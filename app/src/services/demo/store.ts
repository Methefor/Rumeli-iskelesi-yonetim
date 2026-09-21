/**
 * Centralised, deterministic, SYNTHETIC fixture store for Preview demo mode
 * (VITE_DEMO_MODE=true). Nothing here is real data, nothing is a 2026
 * management figure, and nothing here talks to a network — this module has
 * no Supabase (runtime) import at all. All amounts, quantities, costs and
 * product names are invented placeholders ("Örnek Ürün A" …) so the screens
 * can be reviewed; they must never be read as production truth.
 *
 * The store mirrors the server's business rules where they matter for
 * review (append-only ledger, REVERSAL on edit/cancel, effective-dated cost
 * snapshots, counts that never touch the ledger), reusing the same pure
 * domain functions the real screens use.
 */
import { effectiveCostAt, stockDeltaFor } from '../../domain/inventory'
import { reconcile } from '../../domain/reconciliation'
import type { MovementType } from '../../domain/inventory'
import type { ReconciliationStatus } from '../../domain/reconciliation'
import { addDaysIso, istanbulDate } from '../../utils/dates'
import type {
  BranchEmployee,
  BranchOption,
  ShiftDefinitionSummary,
  ShiftSummary,
} from '../supabase/shifts'
import type { CategoryOption } from '../supabase/sales'
import type {
  GrossProfitResult,
  InventoryCountSummary,
  InventoryItem,
  InventoryMovementRow,
  ItemCostRow,
} from '../supabase/inventory'

export const DEMO_BRANCH_RUMELI = 'demo-branch-rumeli'
export const DEMO_BRANCH_DONDURMA = 'demo-branch-dondurma'

const THRESHOLDS = { warningPercentage: 2, errorPercentage: 5 }

export interface DemoEmployee extends BranchEmployee {
  branchIds: string[]
}

export interface DemoAssignment {
  id: string
  shiftId: string
  userId: string
  status: 'assigned' | 'confirmed' | 'cancelled'
  isOnTime: boolean | null
  lateOverride: boolean | null
}

export interface DemoReportItem {
  categoryId: string
  amount: number
  inventoryItemId: string | null
  inventoryQuantity: number | null
}

export interface DemoReport {
  id: string
  shiftId: string
  branchId: string
  submittedBy: string
  reportType: 'X' | 'Z'
  grossRevenue: number
  status: 'submitted' | 'edited' | 'cancelled'
  reconciliationStatus: ReconciliationStatus
  submittedAt: string
  notes: string | null
  items: DemoReportItem[]
}

export interface DemoMovement extends InventoryMovementRow {
  unitCostSnapshot: number | null
  createdBy: string
}

export interface DemoState {
  branches: BranchOption[]
  employees: DemoEmployee[]
  shiftDefinitions: Array<ShiftDefinitionSummary & { branchId: string }>
  shifts: ShiftSummary[]
  assignments: DemoAssignment[]
  categories: CategoryOption[]
  branchCategoryKeys: Record<string, string[]>
  reports: DemoReport[]
  items: InventoryItem[]
  costs: ItemCostRow[]
  movements: DemoMovement[]
  counts: InventoryCountSummary[]
  overrides: Array<{
    reportId: string
    reason: string
    previous: ReconciliationStatus
    next: ReconciliationStatus
  }>
  auditLog: Array<{ action: string; entityId: string; reason: string | null; at: string }>
  now: () => Date
  seq: number
}

function nextId(state: DemoState, prefix: string): string {
  state.seq += 1
  return `${prefix}-${String(state.seq).padStart(4, '0')}`
}

function audit(
  state: DemoState,
  action: string,
  entityId: string,
  reason: string | null,
  at: Date,
): void {
  state.auditLog.push({ action, entityId, reason, at: at.toISOString() })
}

/** Istanbul is UTC+3 all year (no DST since 2016), so a local clock time is a fixed instant. */
function istanbulInstant(date: string, hour: number, minute = 0): Date {
  return new Date(
    `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+03:00`,
  )
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export interface MovementInput {
  itemId: string
  type: MovementType
  quantity?: number
  at: Date
  createdBy: string
  shiftId?: string | null
  salesReportId?: string | null
  countId?: string | null
  reasonCode?: string | null
  reason?: string | null
  reference?: string | null
  reversesMovementId?: string | null
}

export function costsFor(state: DemoState, itemId: string): ItemCostRow[] {
  return state.costs.filter((c) => c.inventoryItemId === itemId)
}

export function addMovement(state: DemoState, input: MovementInput): DemoMovement {
  const item = state.items.find((i) => i.id === input.itemId)
  if (!item) throw new Error('Ürün bulunamadı.')

  let quantity: number
  let stockDelta: number
  let snapshot: number | null
  let shiftId = input.shiftId ?? null
  let salesReportId = input.salesReportId ?? null
  let countId = input.countId ?? null

  if (input.type === 'REVERSAL') {
    const original = state.movements.find((m) => m.id === input.reversesMovementId)
    if (!original) throw new Error('Geri alınacak hareket bulunamadı.')
    if (original.type === 'REVERSAL')
      throw new Error('Bir geri alma işlemi tekrar geri alınamaz.')
    if (state.movements.some((m) => m.reversesMovementId === original.id)) {
      throw new Error('Bu hareket zaten geri alınmış.')
    }
    quantity = original.quantity
    stockDelta = -original.stockDelta
    snapshot = original.unitCostSnapshot
    shiftId = original.shiftId
    salesReportId = original.salesReportId
    countId = original.inventoryCountId
  } else {
    quantity = input.quantity ?? 0
    if (!item.isActive) throw new Error('Bu ürün pasif durumda.')
    if (quantity <= 0) throw new Error('Miktar sıfırdan büyük olmalıdır.')
    if (!item.allowsDecimal && !Number.isInteger(quantity))
      throw new Error('Bu ürün yalnızca tam sayı olarak girilebilir.')
    stockDelta = stockDeltaFor(input.type, quantity)
    snapshot = effectiveCostAt(costsFor(state, item.id), input.at)
  }

  const movement: DemoMovement = {
    id: nextId(state, 'demo-mv'),
    branchId: item.branchId,
    inventoryItemId: item.id,
    type: input.type,
    quantity,
    stockDelta,
    shiftId,
    salesReportId,
    inventoryCountId: countId,
    reversesMovementId: input.reversesMovementId ?? null,
    reasonCode: input.reasonCode ?? null,
    reason: input.reason ?? null,
    reference: input.reference ?? null,
    occurredAt: input.at.toISOString(),
    unitCostSnapshot: snapshot,
    createdBy: input.createdBy,
  }
  state.movements.push(movement)
  return movement
}

export function theoreticalQuantity(state: DemoState, itemId: string): number {
  return (
    Math.round(
      state.movements
        .filter((m) => m.inventoryItemId === itemId)
        .reduce((s, m) => s + m.stockDelta, 0) * 1000,
    ) / 1000
  )
}

// ---------------------------------------------------------------------------
// Sales reports (+ inventory integration)
// ---------------------------------------------------------------------------

export interface ReportInput {
  shiftId: string
  reportType: 'X' | 'Z'
  grossRevenue: number
  notes?: string | null
  items: Array<{
    categoryId?: string | null
    amount: number
    inventoryItemId?: string | null
    inventoryQuantity?: number | null
  }>
}

function resolveItems(
  state: DemoState,
  branchId: string,
  items: ReportInput['items'],
): DemoReportItem[] {
  const resolved: DemoReportItem[] = items.map((item) => {
    if (!item.inventoryItemId) {
      if (!item.categoryId) throw new Error('Kategori seçilmedi.')
      return {
        categoryId: item.categoryId,
        amount: item.amount,
        inventoryItemId: null,
        inventoryQuantity: null,
      }
    }
    const inv = state.items.find((i) => i.id === item.inventoryItemId)
    if (!inv || inv.branchId !== branchId)
      throw new Error('Seçilen ürün veya vardiya bu şubeye ait değil.')
    if (!inv.isActive) throw new Error('Bu ürün pasif durumda.')
    if (!inv.salesCategoryId) throw new Error('Bu ürünün satış kategorisi tanımlı değil.')
    if (!item.inventoryQuantity || item.inventoryQuantity <= 0)
      throw new Error('Miktar sıfırdan büyük olmalıdır.')
    if (!inv.allowsDecimal && !Number.isInteger(item.inventoryQuantity))
      throw new Error('Bu ürün yalnızca tam sayı olarak girilebilir.')
    return {
      categoryId: inv.salesCategoryId,
      amount: item.amount,
      inventoryItemId: inv.id,
      inventoryQuantity: item.inventoryQuantity,
    }
  })

  const productCategories = new Set(
    resolved.filter((r) => r.inventoryItemId).map((r) => r.categoryId),
  )
  if (resolved.some((r) => !r.inventoryItemId && productCategories.has(r.categoryId))) {
    throw new Error('Aynı kategoride hem kategori toplamı hem ürün satırı girilemez.')
  }
  return resolved
}

function statusFor(
  state: DemoState,
  grossRevenue: number,
  items: DemoReportItem[],
): ReconciliationStatus {
  void state
  const itemsTotal = items.reduce((s, i) => s + i.amount, 0)
  return reconcile(grossRevenue, itemsTotal, THRESHOLDS).status
}

function applySalesLines(
  state: DemoState,
  report: DemoReport,
  at: Date,
  actorId: string,
): void {
  for (const line of report.items) {
    if (!line.inventoryItemId || !line.inventoryQuantity) continue
    addMovement(state, {
      itemId: line.inventoryItemId,
      type: 'SALE',
      quantity: line.inventoryQuantity,
      at,
      createdBy: actorId,
      shiftId: report.shiftId,
      salesReportId: report.id,
    })
  }
}

function reverseSalesLines(
  state: DemoState,
  reportId: string,
  reason: string,
  at: Date,
  actorId: string,
): void {
  const reversed = new Set(
    state.movements.filter((m) => m.reversesMovementId).map((m) => m.reversesMovementId),
  )
  for (const m of state.movements.filter(
    (x) => x.salesReportId === reportId && x.type === 'SALE' && !reversed.has(x.id),
  )) {
    addMovement(state, {
      itemId: m.inventoryItemId,
      type: 'REVERSAL',
      at,
      createdBy: actorId,
      reversesMovementId: m.id,
      reason,
    })
  }
}

export function createReport(
  state: DemoState,
  input: ReportInput,
  actorId: string,
  at: Date,
): DemoReport {
  const shift = state.shifts.find((s) => s.id === input.shiftId)
  if (!shift) throw new Error('Vardiya bulunamadı.')
  if (shift.status === 'cancelled')
    throw new Error('İptal edilmiş bir vardiya için rapor gönderilemez.')
  if (
    state.reports.some(
      (r) =>
        r.shiftId === input.shiftId &&
        r.reportType === input.reportType &&
        r.status !== 'cancelled',
    )
  ) {
    throw new Error('Bu vardiya için bu tipte bir rapor zaten var.')
  }

  const items = resolveItems(state, shift.branchId, input.items)
  const report: DemoReport = {
    id: nextId(state, 'demo-report'),
    shiftId: input.shiftId,
    branchId: shift.branchId,
    submittedBy: actorId,
    reportType: input.reportType,
    grossRevenue: input.grossRevenue,
    status: 'submitted',
    reconciliationStatus: statusFor(state, input.grossRevenue, items),
    submittedAt: at.toISOString(),
    notes: input.notes ?? null,
    items,
  }
  state.reports.push(report)
  applySalesLines(state, report, at, actorId)
  audit(state, 'report_edit', report.id, 'created', at)
  return report
}

export function editReport(
  state: DemoState,
  reportId: string,
  input: Omit<ReportInput, 'shiftId' | 'reportType'>,
  reason: string,
  actorId: string,
  at: Date,
): void {
  const report = state.reports.find((r) => r.id === reportId)
  if (!report || report.status === 'cancelled') throw new Error('Rapor düzenlenemez.')
  if (!reason.trim()) throw new Error('Gerekçe zorunludur.')
  const items = resolveItems(state, report.branchId, input.items)
  reverseSalesLines(state, reportId, reason, at, actorId)
  report.items = items
  report.grossRevenue = input.grossRevenue
  report.notes = input.notes ?? null
  report.status = 'edited'
  report.reconciliationStatus = statusFor(state, input.grossRevenue, items)
  applySalesLines(state, report, at, actorId)
  audit(state, 'report_edit', reportId, reason, at)
}

export function cancelReport(
  state: DemoState,
  reportId: string,
  reason: string,
  actorId: string,
  at: Date,
): void {
  const report = state.reports.find((r) => r.id === reportId)
  if (!report) throw new Error('Rapor bulunamadı.')
  if (!reason.trim()) throw new Error('Gerekçe zorunludur.')
  report.status = 'cancelled'
  reverseSalesLines(state, reportId, reason, at, actorId)
  audit(state, 'report_delete', reportId, reason, at)
}

// ---------------------------------------------------------------------------
// Counts / cost / gross profit
// ---------------------------------------------------------------------------

export function submitCount(
  state: DemoState,
  input: {
    branchId: string
    shiftId: string | null
    lines: Array<{ inventoryItemId: string; physicalQuantity: number }>
    note: string | null
  },
  at: Date,
): InventoryCountSummary {
  const shift = input.shiftId
    ? state.shifts.find((s) => s.id === input.shiftId)
    : undefined
  const count: InventoryCountSummary = {
    id: nextId(state, 'demo-count'),
    branchId: input.branchId,
    shiftId: input.shiftId,
    businessDate: shift?.businessDate ?? istanbulDate(at),
    status: 'submitted',
    note: input.note,
    submittedAt: at.toISOString(),
    lines: input.lines.map((l) => {
      const item = state.items.find((i) => i.id === l.inventoryItemId)
      if (!item || item.branchId !== input.branchId)
        throw new Error('Seçilen ürün veya vardiya bu şubeye ait değil.')
      if (!item.isActive) throw new Error('Bu ürün pasif durumda.')
      if (l.physicalQuantity < 0) throw new Error('Değer negatif olamaz.')
      const theoretical = theoreticalQuantity(state, l.inventoryItemId)
      return {
        inventoryItemId: l.inventoryItemId,
        physicalQuantity: l.physicalQuantity,
        theoreticalQuantity: theoretical,
        varianceQuantity: Math.round((l.physicalQuantity - theoretical) * 1000) / 1000,
      }
    }),
  }
  state.counts.unshift(count)
  return count
}

export function setCost(
  state: DemoState,
  input: { itemId: string; unitCost: number; effectiveFrom: Date; reason: string | null },
  actorId: string,
  now: Date,
): void {
  const existing = costsFor(state, input.itemId)
  const latest = existing.reduce(
    (max, c) => Math.max(max, Date.parse(c.effectiveFrom)),
    -Infinity,
  )
  if (existing.length > 0 && input.effectiveFrom.getTime() <= latest) {
    throw new Error('Yeni maliyet tarihi, mevcut son maliyet tarihinden sonra olmalıdır.')
  }
  state.costs.push({
    id: nextId(state, 'demo-cost'),
    inventoryItemId: input.itemId,
    unitCost: input.unitCost,
    effectiveFrom: input.effectiveFrom.toISOString(),
    reason: input.reason,
  })
  audit(state, 'inventory_cost_change', input.itemId, input.reason, now)
  void actorId
}

export function computeGrossProfit(
  state: DemoState,
  branchId: string,
  from: Date,
  to: Date,
): GrossProfitResult {
  const inPeriod = (report: DemoReport) => {
    const t = Date.parse(report.submittedAt)
    return t >= from.getTime() && t < to.getTime()
  }
  const reportById = new Map(state.reports.map((r) => [r.id, r]))
  const movementById = new Map(state.movements.map((m) => [m.id, m]))

  const lines = state.items
    .filter((i) => i.branchId === branchId)
    .map((item) => {
      let sold = 0
      let cogs = 0
      let costed = 0
      let uncosted = 0
      let touched = false
      for (const m of state.movements) {
        if (m.inventoryItemId !== item.id || !m.salesReportId) continue
        const original = m.reversesMovementId
          ? movementById.get(m.reversesMovementId)
          : null
        if (!(m.type === 'SALE' || (m.type === 'REVERSAL' && original?.type === 'SALE')))
          continue
        const report = reportById.get(m.salesReportId)
        if (!report || !inPeriod(report)) continue
        touched = true
        const qty = -m.stockDelta
        sold += qty
        if (m.unitCostSnapshot === null) uncosted += qty
        else {
          costed += qty
          cogs += qty * m.unitCostSnapshot
        }
      }
      let revenue = 0
      for (const report of state.reports) {
        if (
          report.branchId !== branchId ||
          report.status === 'cancelled' ||
          !inPeriod(report)
        )
          continue
        for (const line of report.items) {
          if (line.inventoryItemId === item.id) {
            revenue += line.amount
            touched = true
          }
        }
      }
      return {
        touched,
        line: {
          inventoryItemId: item.id,
          code: item.code,
          name: item.name,
          unit: item.unit,
          soldQuantity: sold,
          productRevenue: revenue,
          cogs,
          costedQuantity: costed,
          uncostedQuantity: uncosted,
        },
      }
    })
    .filter((x) => x.touched)
    .map((x) => x.line)

  const trackedCategories = new Set(
    state.items
      .filter((i) => i.branchId === branchId && i.salesCategoryId)
      .map((i) => i.salesCategoryId),
  )
  let unmapped = 0
  for (const report of state.reports) {
    if (
      report.branchId !== branchId ||
      report.status === 'cancelled' ||
      !inPeriod(report)
    )
      continue
    for (const line of report.items) {
      if (!line.inventoryItemId && trackedCategories.has(line.categoryId))
        unmapped += line.amount
    }
  }
  return { lines, unmappedCategoryRevenue: unmapped }
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const CATEGORY_DEFS: Array<[string, string]> = [
  ['gida', 'Gıda'],
  ['kahvalti', 'Kahvaltı'],
  ['kahve', 'Kahve'],
  ['meyve_suyu', 'Meyve Suyu'],
  ['sicak_icecek', 'Sıcak İçecek'],
  ['soguk_icecek', 'Soğuk İçecek'],
  ['salata', 'Salata'],
  ['tatli', 'Tatlı'],
  ['dondurma', 'Dondurma'],
  ['borek_corek', 'Börek & Çörek'],
]

export function createDemoState(now: Date = new Date()): DemoState {
  const state: DemoState = {
    branches: [
      { id: DEMO_BRANCH_RUMELI, key: 'rumeli_iskelesi', name: 'Rumeli İskelesi' },
      { id: DEMO_BRANCH_DONDURMA, key: 'iskele_dondurma', name: 'İskele Dondurma' },
    ],
    employees: [
      {
        id: 'demo-m001',
        fullName: 'M001 — Demo Yönetici',
        employeeCode: 'M001',
        branchIds: [DEMO_BRANCH_RUMELI],
      },
      {
        id: 'demo-k001',
        fullName: 'K001 — Demo Kasiyer',
        employeeCode: 'K001',
        branchIds: [DEMO_BRANCH_RUMELI],
      },
      {
        id: 'demo-k002',
        fullName: 'K002 — Demo Kasiyer 2',
        employeeCode: 'K002',
        branchIds: [DEMO_BRANCH_RUMELI],
      },
      {
        id: 'demo-d001',
        fullName: 'D001 — Demo Çalışan',
        employeeCode: 'D001',
        branchIds: [DEMO_BRANCH_DONDURMA],
      },
      {
        id: 'demo-d002',
        fullName: 'D002 — Demo Çalışan 2',
        employeeCode: 'D002',
        branchIds: [DEMO_BRANCH_DONDURMA],
      },
    ],
    shiftDefinitions: [],
    shifts: [],
    assignments: [],
    categories: CATEGORY_DEFS.map(([key, name]) => ({
      id: `demo-cat-${key}`,
      key,
      name,
    })),
    branchCategoryKeys: {
      [DEMO_BRANCH_RUMELI]: [
        'gida',
        'kahvalti',
        'kahve',
        'meyve_suyu',
        'sicak_icecek',
        'soguk_icecek',
        'salata',
        'tatli',
        'borek_corek',
      ],
      [DEMO_BRANCH_DONDURMA]: ['dondurma', 'sicak_icecek', 'soguk_icecek'],
    },
    reports: [],
    items: [],
    costs: [],
    movements: [],
    counts: [],
    overrides: [],
    auditLog: [],
    now: () => new Date(),
    seq: 0,
  }

  const today = istanbulDate(now)
  const cat = (key: string) => `demo-cat-${key}`

  for (const branch of state.branches) {
    for (const [key, name, sh, eh, em] of [
      ['morning', 'Sabah', 8, 16, 0],
      ['evening', 'Akşam', 16, 23, 59],
    ] as const) {
      state.shiftDefinitions.push({
        id: `demo-def-${branch.key}-${key}`,
        branchId: branch.id,
        key,
        name,
        startHour: sh,
        startMinute: 0,
        endHour: eh,
        endMinute: em,
      })
    }
  }

  const defFor = (branchId: string, key: string) => {
    const def = state.shiftDefinitions.find(
      (d) => d.branchId === branchId && d.key === key,
    )
    if (!def) throw new Error('demo seed: missing definition')
    return def
  }
  const shiftId = (branchId: string, key: string, offset: number) =>
    `demo-shift-${branchId}-${key}-${offset}`

  for (const branch of state.branches) {
    for (const offset of [-2, -1, 0]) {
      for (const key of ['morning', 'evening']) {
        const def = defFor(branch.id, key)
        const { branchId: _branchId, ...definition } = def
        void _branchId
        state.shifts.push({
          id: shiftId(branch.id, key, offset),
          branchId: branch.id,
          branchName: branch.name,
          businessDate: addDaysIso(today, offset),
          status: offset < 0 ? 'closed' : 'scheduled',
          definition,
        })
      }
    }
  }

  const assign = (
    userId: string,
    branchId: string,
    key: string,
    offset: number,
    status: DemoAssignment['status'],
  ) => {
    state.assignments.push({
      id: nextId(state, 'demo-assign'),
      shiftId: shiftId(branchId, key, offset),
      userId,
      status,
      isOnTime: offset < 0 ? true : null,
      lateOverride: null,
    })
  }
  for (const offset of [-2, -1]) {
    assign('demo-k001', DEMO_BRANCH_RUMELI, 'morning', offset, 'confirmed')
    assign('demo-k001', DEMO_BRANCH_RUMELI, 'evening', offset, 'confirmed')
  }
  assign('demo-k001', DEMO_BRANCH_RUMELI, 'morning', 0, 'confirmed')
  assign('demo-k001', DEMO_BRANCH_RUMELI, 'evening', 0, 'assigned')
  assign('demo-k002', DEMO_BRANCH_RUMELI, 'evening', -1, 'confirmed')
  assign('demo-d001', DEMO_BRANCH_DONDURMA, 'morning', -2, 'confirmed')
  assign('demo-d001', DEMO_BRANCH_DONDURMA, 'evening', -2, 'confirmed')
  assign('demo-d001', DEMO_BRANCH_DONDURMA, 'evening', -1, 'confirmed')
  assign('demo-d001', DEMO_BRANCH_DONDURMA, 'morning', 0, 'confirmed')
  assign('demo-d001', DEMO_BRANCH_DONDURMA, 'evening', 0, 'assigned')
  assign('demo-d002', DEMO_BRANCH_DONDURMA, 'morning', -1, 'confirmed')

  // Inventory catalogue for İskele Dondurma — clearly synthetic placeholders.
  const item = (
    id: string,
    code: string,
    name: string,
    unit: string,
    allowsDecimal: boolean,
    category: string | null,
    isActive = true,
  ) => {
    state.items.push({
      id,
      branchId: DEMO_BRANCH_DONDURMA,
      code,
      name,
      unit,
      allowsDecimal,
      salesCategoryId: category ? cat(category) : null,
      isActive,
    })
  }
  item('demo-item-a', 'DEMO-A', 'Örnek Ürün A', 'kg', true, 'dondurma')
  item('demo-item-b', 'DEMO-B', 'Örnek Ürün B', 'kg', true, 'dondurma')
  item('demo-item-c', 'DEMO-C', 'Örnek Ürün C (maliyetsiz)', 'kg', true, 'dondurma')
  item('demo-item-d', 'DEMO-D', 'Örnek Ürün D', 'adet', false, 'soguk_icecek')
  item('demo-item-e', 'DEMO-E', 'Örnek Ürün E (pasif)', 'kg', true, 'dondurma', false)

  const at = (offset: number, hour: number, minute = 0) =>
    istanbulInstant(addDaysIso(today, offset), hour, minute)
  const cost = (
    itemId: string,
    unitCost: number,
    effectiveFrom: Date,
    reason: string,
  ) => {
    state.costs.push({
      id: nextId(state, 'demo-cost'),
      inventoryItemId: itemId,
      unitCost,
      effectiveFrom: effectiveFrom.toISOString(),
      reason,
    })
  }
  cost('demo-item-a', 42.5, at(-30, 9), 'ilk maliyet')
  cost('demo-item-a', 45, at(-10, 9), 'fiyat artışı')
  cost('demo-item-b', 38, at(-30, 9), 'ilk maliyet')
  cost('demo-item-d', 12, at(-30, 9), 'ilk maliyet')
  // demo-item-c deliberately has NO cost: demonstrates the "uncosted" gross-profit state.

  const M = 'demo-m001'
  const receipt = (itemId: string, quantity: number) =>
    addMovement(state, {
      itemId,
      type: 'RECEIPT',
      quantity,
      at: at(-3, 12),
      createdBy: M,
      reference: 'ÖRNEK-TESLİMAT-1',
    })
  receipt('demo-item-a', 40)
  receipt('demo-item-b', 30)
  receipt('demo-item-c', 25)
  receipt('demo-item-d', 60)

  // Rumeli: category-level reports (no stock effect). One WARNING, one ERROR for the reconciliation screens.
  const rep = (
    userId: string,
    branchId: string,
    key: string,
    offset: number,
    reportType: 'X' | 'Z',
    grossRevenue: number,
    items: ReportInput['items'],
    hour: number,
  ) =>
    createReport(
      state,
      { shiftId: shiftId(branchId, key, offset), reportType, grossRevenue, items },
      userId,
      at(offset, hour, 15),
    )
  const R = DEMO_BRANCH_RUMELI
  rep(
    'demo-k001',
    R,
    'morning',
    -2,
    'X',
    4000,
    [
      { categoryId: cat('gida'), amount: 1800 },
      { categoryId: cat('kahve'), amount: 1200 },
      { categoryId: cat('tatli'), amount: 1000 },
    ],
    15,
  )
  rep(
    'demo-k001',
    R,
    'evening',
    -2,
    'Z',
    9600,
    [
      { categoryId: cat('gida'), amount: 5000 },
      { categoryId: cat('kahve'), amount: 2600 },
      { categoryId: cat('soguk_icecek'), amount: 2000 },
    ],
    23,
  )
  rep(
    'demo-k001',
    R,
    'morning',
    -1,
    'X',
    4200,
    [
      { categoryId: cat('gida'), amount: 2000 },
      { categoryId: cat('kahve'), amount: 1400 },
      { categoryId: cat('tatli'), amount: 800 },
    ],
    15,
  )
  rep(
    'demo-k001',
    R,
    'evening',
    -1,
    'Z',
    9800,
    [
      { categoryId: cat('gida'), amount: 5000 },
      { categoryId: cat('kahve'), amount: 2600 },
      { categoryId: cat('soguk_icecek'), amount: 2000 },
    ],
    23,
  )
  rep(
    'demo-k001',
    R,
    'morning',
    0,
    'X',
    3000,
    [
      { categoryId: cat('gida'), amount: 1500 },
      { categoryId: cat('kahve'), amount: 1200 },
    ],
    9,
  )

  // İskele Dondurma: product-linked lines (write SALE movements) and one legacy-shape category-level report.
  const D = DEMO_BRANCH_DONDURMA
  rep(
    'demo-d001',
    D,
    'morning',
    -2,
    'X',
    300,
    [{ inventoryItemId: 'demo-item-c', inventoryQuantity: 3, amount: 300 }],
    15,
  )
  rep(
    'demo-d001',
    D,
    'evening',
    -2,
    'Z',
    700,
    [{ categoryId: cat('dondurma'), amount: 700 }],
    23,
  )
  rep(
    'demo-d001',
    D,
    'evening',
    -1,
    'Z',
    1800,
    [
      { inventoryItemId: 'demo-item-a', inventoryQuantity: 6, amount: 900 },
      { inventoryItemId: 'demo-item-b', inventoryQuantity: 4, amount: 600 },
      { inventoryItemId: 'demo-item-d', inventoryQuantity: 20, amount: 300 },
    ],
    23,
  )

  // Waste and a closing count the evening before (count variance on A and D, none on B/C).
  const eveningPrev = shiftId(D, 'evening', -1)
  addMovement(state, {
    itemId: 'demo-item-a',
    type: 'WASTE',
    quantity: 1.5,
    at: at(-1, 21),
    createdBy: 'demo-d001',
    shiftId: eveningPrev,
    reasonCode: 'damaged',
    reason: 'Örnek fire kaydı',
  })
  addMovement(state, {
    itemId: 'demo-item-d',
    type: 'WASTE',
    quantity: 2,
    at: at(-1, 21, 5),
    createdBy: 'demo-d001',
    shiftId: eveningPrev,
    reasonCode: 'expired',
  })
  submitCount(
    state,
    {
      branchId: D,
      shiftId: eveningPrev,
      lines: [
        { inventoryItemId: 'demo-item-a', physicalQuantity: 32 },
        { inventoryItemId: 'demo-item-b', physicalQuantity: 26 },
        { inventoryItemId: 'demo-item-c', physicalQuantity: 22 },
        { inventoryItemId: 'demo-item-d', physicalQuantity: 37 },
      ],
      note: 'Örnek kapanış sayımı',
    },
    at(-1, 23, 40),
  )

  state.now = () => new Date()
  return state
}
