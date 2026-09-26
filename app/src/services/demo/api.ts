/**
 * Synthetic implementation of the data API for Preview demo mode. Same
 * signatures as services/data/real.ts (enforced by the `DataApi` type), no
 * network, no Supabase at runtime. Authorization here is a faithful-enough
 * MIRROR of what RLS + the RPCs enforce (role/branch/permission checks) so
 * reviewing a screen as M001 / K001 / D001 shows what that role can really
 * do — but it is a demo aid, not a security boundary: the real boundary is
 * the database.
 */
import {
  canInventory,
  effectiveCostAt,
  type InventoryPermission,
} from '../../domain/inventory'
import { evaluateBackdatedEntry } from '../../domain/shifts'
import { currentDemoUser } from '../../features/auth/demoSession'
import type { DemoUser } from '../../features/auth/demoUsers'
import type { DataApi } from '../data/real'
import { istanbulDate } from '../../utils/dates'
import { demoManagement } from './management'
import { demoState } from './state'
import {
  addMovement,
  computeGrossProfit,
  costsFor,
  createReport,
  setCost,
  submitCount,
  theoreticalQuantity,
  type DemoState,
} from './store'

const NOT_AUTHORIZED = 'Bu işlem için yetkiniz yok.'

function isOrgWide(roles: readonly string[]): boolean {
  return roles.includes('owner') || roles.includes('manager')
}

function canSee(actor: DemoUser, branchId: string): boolean {
  return isOrgWide(actor.roles) || actor.branchIds.includes(branchId)
}

function canInv(
  actor: DemoUser | null,
  permission: InventoryPermission,
  branchId: string,
): boolean {
  return (
    actor !== null && canInventory(actor.roles, permission) && canSee(actor, branchId)
  )
}

function canManageShifts(actor: DemoUser | null, branchId: string): boolean {
  if (!actor) return false
  return (
    isOrgWide(actor.roles) ||
    (actor.roles.includes('branch_manager') && actor.branchIds.includes(branchId))
  )
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'
}

function assignedTo(state: DemoState, actor: DemoUser, shiftId: string): boolean {
  return state.assignments.some(
    (a) => a.shiftId === shiftId && a.userId === actor.id && a.status !== 'cancelled',
  )
}

/** Optional-shift rule shared by waste and count: assigned to it, or privileged in that branch. */
function shiftAllowed(
  state: DemoState,
  actor: DemoUser,
  shiftId: string | null | undefined,
  branchId: string,
): string | null {
  if (!shiftId) return null
  const shift = state.shifts.find((s) => s.id === shiftId)
  if (!shift) return 'Vardiya bulunamadı.'
  if (shift.branchId !== branchId) return 'Seçilen ürün veya vardiya bu şubeye ait değil.'
  if (shift.status === 'cancelled')
    return 'İptal edilmiş bir vardiya için kayıt girilemez.'
  if (!assignedTo(state, actor, shiftId) && !canManageShifts(actor, branchId))
    return 'Bu vardiyaya atanmış değilsiniz.'
  return null
}

function visibleItems(state: DemoState, actor: DemoUser | null, branchId: string) {
  return canInv(actor, 'inventory.read', branchId)
    ? state.items.filter((i) => i.branchId === branchId)
    : []
}

function auditInventory(
  state: DemoState,
  actor: DemoUser,
  action: string,
  entityId: string,
  reason: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  state.seq += 1
  state.inventoryAudit.push({
    id: `demo-audit-${state.seq}`,
    actorId: actor.id,
    actorName: state.employees.find((e) => e.id === actor.id)?.fullName ?? actor.id,
    action,
    entityId,
    reason,
    at: state.now().toISOString(),
    before,
    after,
  })
}
export const demoApi: DataApi = {
  ...demoManagement,
  async listInventoryAudit(branchId, limit = 100) {
    const actor = currentDemoUser()
    if (!actor || !isOrgWide(actor.roles)) return []
    return demoState()
      .inventoryAudit.filter(
        (r) => r.after?.branch_id === branchId || r.before?.branch_id === branchId,
      )
      .slice()
      .reverse()
      .slice(0, limit)
  },
  // ------------------------------------------------------------------ shifts
  async listMyShiftAssignments(userId) {
    const state = demoState()
    return state.assignments
      .filter((a) => a.userId === userId)
      .flatMap((a) => {
        const shift = state.shifts.find((s) => s.id === a.shiftId)
        return shift
          ? [
              {
                assignmentId: a.id,
                status: a.status,
                isOnTime: a.isOnTime,
                lateOverride: a.lateOverride,
                shift,
              },
            ]
          : []
      })
      .sort((x, y) =>
        y.shift.businessDate === x.shift.businessDate
          ? y.shift.definition.startHour - x.shift.definition.startHour
          : y.shift.businessDate.localeCompare(x.shift.businessDate),
      )
      .slice(0, 20)
  },

  async listBranchShifts(branchId) {
    const actor = currentDemoUser()
    if (!actor || !canSee(actor, branchId)) return []
    return demoState()
      .shifts.filter((s) => s.branchId === branchId)
      .sort((x, y) =>
        y.businessDate === x.businessDate
          ? y.definition.startHour - x.definition.startHour
          : y.businessDate.localeCompare(x.businessDate),
      )
  },

  async listBranches() {
    return [...demoState().branches]
  },

  async listShiftDefinitions(branchId) {
    return demoState()
      .shiftDefinitions.filter((d) => d.branchId === branchId)
      .map((d) => ({
        id: d.id,
        key: d.key,
        name: d.name,
        startHour: d.startHour,
        startMinute: d.startMinute,
        endHour: d.endHour,
        endMinute: d.endMinute,
      }))
  },

  async listBranchEmployees(branchId) {
    const actor = currentDemoUser()
    if (!actor || !canSee(actor, branchId)) return []
    return demoState()
      .employees.filter((e) => e.branchIds.includes(branchId))
      .map((e) => ({ id: e.id, fullName: e.fullName, employeeCode: e.employeeCode }))
  },

  async scheduleShift(input) {
    const state = demoState()
    if (!canManageShifts(currentDemoUser(), input.branchId))
      return { shiftId: null, error: NOT_AUTHORIZED }
    const definition = state.shiftDefinitions.find(
      (d) => d.id === input.shiftDefinitionId && d.branchId === input.branchId,
    )
    if (!definition) return { shiftId: null, error: 'Vardiya tanımı bulunamadı.' }
    if (
      state.shifts.some(
        (s) =>
          s.branchId === input.branchId &&
          s.definition.id === definition.id &&
          s.businessDate === input.businessDate,
      )
    ) {
      return {
        shiftId: null,
        error: 'Bu şube, tanım ve tarih için bir vardiya zaten var.',
      }
    }
    const branch = state.branches.find((b) => b.id === input.branchId)
    const { branchId: _b, ...def } = definition
    void _b
    state.seq += 1
    const id = `demo-shift-new-${state.seq}`
    state.shifts.push({
      id,
      branchId: input.branchId,
      branchName: branch?.name ?? '',
      businessDate: input.businessDate,
      status: 'scheduled',
      definition: def,
    })
    return { shiftId: id, error: null }
  },

  async assignShift(input) {
    const state = demoState()
    const shift = state.shifts.find((s) => s.id === input.shiftId)
    if (!shift) return { assignmentId: null, error: 'Vardiya bulunamadı.' }
    if (!canManageShifts(currentDemoUser(), shift.branchId))
      return { assignmentId: null, error: NOT_AUTHORIZED }
    if (
      state.assignments.some(
        (a) => a.shiftId === input.shiftId && a.userId === input.userId,
      )
    ) {
      return { assignmentId: null, error: 'Bu çalışan bu vardiyaya zaten atanmış.' }
    }
    state.seq += 1
    const id = `demo-assign-new-${state.seq}`
    state.assignments.push({
      id,
      shiftId: input.shiftId,
      userId: input.userId,
      status: 'assigned',
      isOnTime: null,
      lateOverride: null,
    })
    return { assignmentId: id, error: null }
  },

  async confirmShiftAssignment(assignmentId) {
    const actor = currentDemoUser()
    const assignment = demoState().assignments.find((a) => a.id === assignmentId)
    if (!actor || !assignment || assignment.userId !== actor.id)
      return { error: NOT_AUTHORIZED }
    assignment.status = 'confirmed'
    return { error: null }
  },

  // ------------------------------------------------------------------- sales
  async listBranchCategories(branchId) {
    const state = demoState()
    const keys = state.branchCategoryKeys[branchId] ?? []
    return state.categories.filter((c) => keys.includes(c.key))
  },

  async createSalesReport(input) {
    const state = demoState()
    const actor = currentDemoUser()
    const shift = state.shifts.find((s) => s.id === input.shiftId)
    if (!actor || !shift) return { reportId: null, error: 'Vardiya bulunamadı.' }
    if (
      !assignedTo(state, actor, input.shiftId) &&
      !canManageShifts(actor, shift.branchId)
    ) {
      return { reportId: null, error: 'Bu vardiyaya atanmış değilsiniz.' }
    }
    const backdated = evaluateBackdatedEntry(
      shift.businessDate,
      isOrgWide(actor.roles),
      istanbulDate(state.now()),
    )
    if (backdated.isFuture) {
      return { reportId: null, error: 'İleri bir tarih için rapor girilemez.' }
    }
    if (backdated.deniedForRole) {
      return {
        reportId: null,
        error:
          'Yalnızca bugün ve önceki 3 gün için rapor girebilirsiniz. Daha eski bir tarih için yönetici/işletme sahibi gerekçeli olarak girebilir.',
      }
    }
    if (backdated.requiresOverrideReason && !input.backdatedReason?.trim()) {
      return { reportId: null, error: '3 günden eski bir tarih için gerekçe zorunludur.' }
    }
    try {
      const report = createReport(
        state,
        {
          shiftId: input.shiftId,
          reportType: input.reportType,
          grossRevenue: input.grossRevenue,
          notes: input.notes ?? null,
          items: input.items.map((i) => ({
            categoryId: i.categoryId ?? null,
            amount: i.amount,
            inventoryItemId: i.inventoryItemId ?? null,
            inventoryQuantity: i.inventoryQuantity ?? null,
          })),
        },
        actor.id,
        state.now(),
      )
      return { reportId: report.id, error: null }
    } catch (error) {
      return { reportId: null, error: messageOf(error) }
    }
  },

  async listMyRecentReports(userId) {
    const state = demoState()
    return state.reports
      .filter((r) => r.submittedBy === userId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 20)
      .map((r) => toSummary(state, r))
  },

  async listBranchReports(branchId) {
    const state = demoState()
    const actor = currentDemoUser()
    if (!actor || !canSee(actor, branchId)) return []
    return state.reports
      .filter((r) => r.branchId === branchId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 50)
      .map((r) => toSummary(state, r))
  },

  async listReconciliationQueue(branchId) {
    const state = demoState()
    const actor = currentDemoUser()
    if (!actor || !canSee(actor, branchId)) return []
    return state.reports
      .filter(
        (r) =>
          r.branchId === branchId &&
          r.status !== 'cancelled' &&
          r.reconciliationStatus !== 'OK',
      )
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map((r) => toSummary(state, r))
  },

  async overrideReconciliation(input) {
    const state = demoState()
    const report = state.reports.find((r) => r.id === input.reportId)
    if (!report) return { error: 'Rapor bulunamadı.' }
    if (!canManageShifts(currentDemoUser(), report.branchId))
      return { error: NOT_AUTHORIZED }
    if (!input.reason.trim()) return { error: 'Gerekçe zorunludur.' }
    state.overrides.push({
      reportId: report.id,
      reason: input.reason,
      previous: report.reconciliationStatus,
      next: input.newStatus,
    })
    report.reconciliationStatus = input.newStatus
    return { error: null }
  },

  // --------------------------------------------------------------- inventory
  async listInventoryItems(branchId) {
    return visibleItems(demoState(), currentDemoUser(), branchId)
  },

  async listStockBalances(branchId) {
    const state = demoState()
    return visibleItems(state, currentDemoUser(), branchId).map((item) => {
      const moves = state.movements.filter((m) => m.inventoryItemId === item.id)
      const last = moves.reduce<string | null>(
        (max, m) => (max === null || m.occurredAt > max ? m.occurredAt : max),
        null,
      )
      return {
        inventoryItemId: item.id,
        branchId,
        theoreticalQuantity: theoreticalQuantity(state, item.id),
        lastMovementAt: last,
      }
    })
  },

  async listInventoryMovements(branchId, limit = 200) {
    const state = demoState()
    if (!canInv(currentDemoUser(), 'inventory.read', branchId)) return []
    return state.movements
      .filter((m) => m.branchId === branchId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit)
      .map(({ unitCostSnapshot: _snapshot, createdBy: _createdBy, ...row }) => {
        void _snapshot
        void _createdBy
        return row
      })
  },

  async listLastCounts(inventoryItemIds) {
    const state = demoState()
    const actor = currentDemoUser()
    const result = new Map<
      string,
      {
        at: string
        line: (typeof state.counts)[number]['lines'][number]
        countId: string
      }
    >()
    for (const count of state.counts) {
      if (
        count.status !== 'submitted' ||
        !canInv(actor, 'inventory.read', count.branchId)
      )
        continue
      for (const line of count.lines) {
        if (!inventoryItemIds.includes(line.inventoryItemId)) continue
        const existing = result.get(line.inventoryItemId)
        if (!existing || count.submittedAt > existing.at)
          result.set(line.inventoryItemId, {
            at: count.submittedAt,
            line,
            countId: count.id,
          })
      }
    }
    return [...result.values()].map(({ at, line, countId }) => ({
      inventoryItemId: line.inventoryItemId,
      inventoryCountId: countId,
      countedAt: at,
      physicalQuantity: line.physicalQuantity,
      theoreticalQuantity: line.theoreticalQuantity,
      varianceQuantity: line.varianceQuantity,
    }))
  },

  async listInventoryCounts(branchId, limit = 20) {
    if (!canInv(currentDemoUser(), 'inventory.read', branchId)) return []
    return demoState()
      .counts.filter((c) => c.branchId === branchId)
      .slice(0, limit)
  },

  async listBranchItemCosts(branchId) {
    const state = demoState()
    if (!canInv(currentDemoUser(), 'inventory.cost.read', branchId)) return []
    const ids = new Set(
      state.items.filter((i) => i.branchId === branchId).map((i) => i.id),
    )
    return state.costs
      .filter((c) => ids.has(c.inventoryItemId))
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
  },

  async getInventoryGrossProfit(branchId, from, to) {
    if (!canInv(currentDemoUser(), 'inventory.cost.read', branchId))
      throw new Error(NOT_AUTHORIZED)
    return computeGrossProfit(demoState(), branchId, new Date(from), new Date(to))
  },

  async upsertInventoryItem(input) {
    const state = demoState()
    if (!canInv(currentDemoUser(), 'inventory.item.manage', input.branchId))
      return { itemId: null, error: NOT_AUTHORIZED }
    const code = input.code.trim().toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(code))
      return {
        itemId: null,
        error: 'Ürün kodu geçersiz (harf/rakam, en fazla 32 karakter).',
      }
    if (!input.name.trim() || !input.unit.trim())
      return { itemId: null, error: 'Ürün adı ve birimi zorunludur.' }
    const clash = state.items.find(
      (i) => i.branchId === input.branchId && i.code === code && i.id !== input.itemId,
    )
    if (clash)
      return { itemId: null, error: 'Bu koda sahip bir ürün bu şubede zaten var.' }

    if (input.itemId) {
      const item = state.items.find((i) => i.id === input.itemId)
      if (!item) return { itemId: null, error: 'Ürün bulunamadı.' }
      const hasMovements = state.movements.some((m) => m.inventoryItemId === item.id)
      if (
        hasMovements &&
        (item.unit !== input.unit.trim() || item.allowsDecimal !== input.allowsDecimal)
      ) {
        return { itemId: null, error: 'Hareket görmüş bir ürünün birimi değiştirilemez.' }
      }
      item.code = code
      item.name = input.name.trim()
      item.unit = input.unit.trim()
      item.allowsDecimal = input.allowsDecimal
      item.salesCategoryId = input.salesCategoryId ?? null
      return { itemId: item.id, error: null }
    }
    state.seq += 1
    const id = `demo-item-new-${state.seq}`
    state.items.push({
      id,
      branchId: input.branchId,
      code,
      name: input.name.trim(),
      unit: input.unit.trim(),
      allowsDecimal: input.allowsDecimal,
      salesCategoryId: input.salesCategoryId ?? null,
      isActive: true,
    })
    return { itemId: id, error: null }
  },

  async setInventoryItemActive(input) {
    const state = demoState()
    const item = state.items.find((i) => i.id === input.itemId)
    if (!item) return { error: 'Ürün bulunamadı.' }
    if (!canInv(currentDemoUser(), 'inventory.item.manage', item.branchId))
      return { error: NOT_AUTHORIZED }
    item.isActive = input.isActive
    return { error: null }
  },

  async setInventoryItemCost(input) {
    const state = demoState()
    const actor = currentDemoUser()
    const item = state.items.find((i) => i.id === input.itemId)
    if (!item) return { error: 'Ürün bulunamadı.' }
    if (!actor || !canInv(actor, 'inventory.cost.manage', item.branchId))
      return { error: NOT_AUTHORIZED }
    try {
      const now = state.now()
      setCost(
        state,
        {
          itemId: item.id,
          unitCost: input.unitCost,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : now,
          reason: input.reason ?? null,
        },
        actor.id,
        now,
      )
      return { error: null }
    } catch (error) {
      return { error: messageOf(error) }
    }
  },

  async recordInventoryReceipt(input) {
    const state = demoState()
    const actor = currentDemoUser()
    if (!actor || !canInv(actor, 'inventory.receive', input.branchId))
      return { error: NOT_AUTHORIZED }
    if (
      input.lines.some((l) => l.unitCost != null) &&
      !canInv(actor, 'inventory.cost.manage', input.branchId)
    ) {
      return { error: NOT_AUTHORIZED }
    }
    if (input.lines.length === 0) return { error: 'En az bir satır gerekli.' }
    try {
      const now = state.now()
      // validate first so a failing line leaves nothing behind (mirrors the server transaction)
      for (const line of input.lines) {
        const item = state.items.find((i) => i.id === line.inventoryItemId)
        if (!item || item.branchId !== input.branchId)
          throw new Error('Seçilen ürün veya vardiya bu şubeye ait değil.')
        if (!item.isActive) throw new Error('Bu ürün pasif durumda.')
        if (line.quantity <= 0) throw new Error('Miktar sıfırdan büyük olmalıdır.')
        if (!item.allowsDecimal && !Number.isInteger(line.quantity))
          throw new Error('Bu ürün yalnızca tam sayı olarak girilebilir.')
      }
      for (const line of input.lines) {
        if (
          line.unitCost != null &&
          effectiveCostAt(costsFor(state, line.inventoryItemId), now) !== line.unitCost
        ) {
          setCost(
            state,
            {
              itemId: line.inventoryItemId,
              unitCost: line.unitCost,
              effectiveFrom: now,
              reason: input.reference ?? 'teslimat',
            },
            actor.id,
            now,
          )
        }
        addMovement(state, {
          itemId: line.inventoryItemId,
          type: 'RECEIPT',
          quantity: line.quantity,
          at: now,
          createdBy: actor.id,
          reason: input.note ?? null,
          reference: input.reference ?? null,
        })
      }
      return { error: null }
    } catch (error) {
      return { error: messageOf(error) }
    }
  },

  async recordInventoryWaste(input) {
    const state = demoState()
    const actor = currentDemoUser()
    if (!actor || !canInv(actor, 'inventory.record', input.branchId))
      return { error: NOT_AUTHORIZED }
    const shiftError = shiftAllowed(state, actor, input.shiftId, input.branchId)
    if (shiftError) return { error: shiftError }
    try {
      const now = state.now()
      for (const line of input.lines) {
        const item = state.items.find((i) => i.id === line.inventoryItemId)
        if (!item || item.branchId !== input.branchId)
          throw new Error('Seçilen ürün veya vardiya bu şubeye ait değil.')
      }
      for (const line of input.lines) {
        addMovement(state, {
          itemId: line.inventoryItemId,
          type: 'WASTE',
          quantity: line.quantity,
          at: now,
          createdBy: actor.id,
          shiftId: input.shiftId ?? null,
          reasonCode: input.reasonCode,
          reason: input.note ?? null,
        })
      }
      return { error: null }
    } catch (error) {
      return { error: messageOf(error) }
    }
  },

  async recordInventoryAdjustment(input) {
    const state = demoState()
    const actor = currentDemoUser()
    const item = state.items.find((i) => i.id === input.itemId)
    if (!item) return { error: 'Ürün bulunamadı.' }
    if (!actor || !canInv(actor, 'inventory.adjust', item.branchId))
      return { error: NOT_AUTHORIZED }
    if (!input.reason.trim()) return { error: 'Gerekçe zorunludur.' }
    try {
      const beforeQuantity = theoreticalQuantity(state, item.id)
      const movement = addMovement(state, {
        itemId: item.id,
        type: input.direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
        quantity: input.quantity,
        at: state.now(),
        createdBy: actor.id,
        reason: input.reason,
        countId: input.countId ?? null,
      })
      auditInventory(
        state,
        actor,
        'inventory_adjustment',
        movement.id,
        input.reason,
        {
          branch_id: item.branchId,
          inventory_item_id: item.id,
          theoretical_quantity: beforeQuantity,
        },
        {
          branch_id: item.branchId,
          inventory_item_id: item.id,
          theoretical_quantity: theoreticalQuantity(state, item.id),
          stock_delta: movement.stockDelta,
        },
      )
      return { error: null }
    } catch (error) {
      return { error: messageOf(error) }
    }
  },

  async reverseInventoryMovement(input) {
    const state = demoState()
    const actor = currentDemoUser()
    const movement = state.movements.find((m) => m.id === input.movementId)
    if (!movement) return { error: 'Hareket bulunamadı.' }
    // Reversal is owner/manager only — narrower than 'inventory.adjust', which
    // branch_manager also holds for adjustments and count-void (see permissions.ts).
    if (
      !actor ||
      !canInv(actor, 'inventory.adjust', movement.branchId) ||
      !isOrgWide(actor.roles)
    )
      return { error: NOT_AUTHORIZED }
    if (!input.reason.trim()) return { error: 'Gerekçe zorunludur.' }
    if (movement.salesReportId)
      return {
        error:
          'Satışa bağlı hareketler, satış raporu düzenlenerek veya iptal edilerek düzeltilir.',
      }
    try {
      const beforeQuantity = theoreticalQuantity(state, movement.inventoryItemId)
      const reversal = addMovement(state, {
        itemId: movement.inventoryItemId,
        type: 'REVERSAL',
        at: state.now(),
        createdBy: actor.id,
        reversesMovementId: movement.id,
        reason: input.reason,
      })
      auditInventory(
        state,
        actor,
        'inventory_movement_reversal',
        reversal.id,
        input.reason,
        {
          branch_id: movement.branchId,
          inventory_item_id: movement.inventoryItemId,
          theoretical_quantity: beforeQuantity,
        },
        {
          branch_id: movement.branchId,
          inventory_item_id: movement.inventoryItemId,
          theoretical_quantity: theoreticalQuantity(state, movement.inventoryItemId),
          reverses_movement_id: movement.id,
          stock_delta: reversal.stockDelta,
        },
      )
      return { error: null }
    } catch (error) {
      return { error: messageOf(error) }
    }
  },

  async submitInventoryCount(input) {
    const state = demoState()
    const actor = currentDemoUser()
    if (!actor || !canInv(actor, 'inventory.count', input.branchId))
      return { countId: null, error: NOT_AUTHORIZED }
    const shiftError = shiftAllowed(state, actor, input.shiftId, input.branchId)
    if (shiftError) return { countId: null, error: shiftError }
    if (input.lines.length === 0)
      return { countId: null, error: 'En az bir satır gerekli.' }
    try {
      const count = submitCount(
        state,
        {
          branchId: input.branchId,
          shiftId: input.shiftId ?? null,
          lines: input.lines,
          note: input.note ?? null,
        },
        state.now(),
      )
      return { countId: count.id, error: null }
    } catch (error) {
      return { countId: null, error: messageOf(error) }
    }
  },

  async voidInventoryCount(input) {
    const state = demoState()
    const actor = currentDemoUser()
    const count = state.counts.find((c) => c.id === input.countId)
    if (!count) return { error: 'Sayım bulunamadı.' }
    if (!actor || !canInv(actor, 'inventory.adjust', count.branchId))
      return { error: NOT_AUTHORIZED }
    if (!input.reason.trim()) return { error: 'Gerekçe zorunludur.' }
    if (count.status !== 'submitted')
      return { error: 'Yalnızca gönderilmiş bir sayım iptal edilebilir.' }
    const before = {
      branch_id: count.branchId,
      status: count.status,
      lines: structuredClone(count.lines),
    }
    count.status = 'voided'
    auditInventory(state, actor, 'inventory_count_void', count.id, input.reason, before, {
      ...before,
      status: count.status,
    })
    return { error: null }
  },
}

function toSummary(
  state: DemoState,
  report: ReturnType<typeof demoState>['reports'][number],
) {
  return {
    id: report.id,
    shiftId: report.shiftId,
    branchId: report.branchId,
    branchName: state.branches.find((b) => b.id === report.branchId)?.name ?? '',
    reportType: report.reportType,
    grossRevenue: report.grossRevenue,
    status: report.status,
    reconciliationStatus: report.reconciliationStatus,
    submittedAt: report.submittedAt,
    notes: report.notes,
  }
}
