/**
 * Demo mirror of services/supabase/procurement.ts: the same rules as the SQL functions (shared with the domain twin in
 * domain/procurement) over the in-memory SYNTHETIC store. Zero network. Nothing here is business data; authorization mirrors
 * RLS + the RPCs for demo review only. Receiving uses the demo ledger (addMovement) exactly like a RECEIPT movement.
 */
import { canInventory } from '../../domain/inventory'
import {
  PENDING_STATUSES,
  conversionOf,
  toBaseQuantity,
  RECEIVABLE_STATUSES,
  canProcurement,
  permissionForTransition,
  procurementCalendar,
  suggestOrder,
  transitionAllowed,
  transitionNeedsReason,
  type OrderBrief,
  type ReconciliationInfo,
  type OrderSuggestion,
  type ProcurementAttention,
  type ProcurementPermission,
  type PurchaseOrderDetail,
  type PurchaseOrderStatus,
  type PurchaseOrderSummary,
  type Supplier,
  type SupplyParams,
} from '../../domain/procurement'
import { currentDemoUser } from '../../features/auth/demoSession'
import type { DemoUser } from '../../features/auth/demoUsers'
import { istanbulDate } from '../../utils/dates'
import type {
  CreatePurchaseOrderInput,
  OrderLineInput,
  ProcIdResult,
  ProcResult,
  ReceiveLineInput,
  UpsertSupplierInput,
  UpsertSupplyParamsInput,
} from '../supabase/procurement'
import { demoState } from './state'
import { addMovement, nextId, theoreticalQuantity, type DemoPurchaseOrder, type DemoState } from './store'

const DENIED = 'Bu işlem için yetkiniz yok.'
const REASON = 'En az 5 karakterlik bir gerekçe yazın.'
const CODE = /^[A-Z0-9][A-Z0-9._-]{1,31}$/

const orgWide = (u: DemoUser) => u.roles.includes('owner') || u.roles.includes('manager')
const inScope = (u: DemoUser, branchId: string) => orgWide(u) || u.branchIds.includes(branchId)
const can = (u: DemoUser | null, perm: ProcurementPermission, branchId?: string): u is DemoUser =>
  u !== null && canProcurement(u.roles, perm) && (branchId === undefined || inScope(u, branchId))

function actorFor(perm: ProcurementPermission, branchId?: string): DemoUser {
  const actor = currentDemoUser()
  if (!can(actor, perm, branchId)) throw new Error(DENIED)
  return actor
}

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000
const sorted = (a: number[] | null): number[] | null => (a && a.length ? [...new Set(a)].sort((x, y) => x - y) : null)

function findOrder(state: DemoState, id: string): DemoPurchaseOrder | undefined {
  return state.purchaseOrders.find((o) => o.id === id)
}

function pendingFor(state: DemoState, branchId: string, itemId: string): number {
  return round3(
    state.purchaseOrders
      .filter((o) => o.branchId === branchId && PENDING_STATUSES.includes(o.status))
      .flatMap((o) => o.lines)
      .filter((l) => l.inventoryItemId === itemId)
      // BASE units: open order quantity x the line's frozen pack factor
      .reduce((s, l) => s + (l.orderedQuantity - l.receivedQuantity) * (l.unitsPerPack ?? 1), 0),
  )
}

function validateParams(input: UpsertSupplyParamsInput): string | null {
  const neg = (v: number | null) => v !== null && v < 0
  if (neg(input.minimumStock) || neg(input.targetStock) || neg(input.safetyStock)) return 'Stok eşikleri negatif olamaz.'
  if (input.minimumStock !== null && input.targetStock !== null && input.targetStock < input.minimumStock) return 'Hedef stok, minimum stoktan küçük olamaz.'
  if (input.leadTimeDays !== null && input.leadTimeDays < 0) return 'Termin süresi negatif olamaz.'
  if (input.unitsPerPack !== null && input.unitsPerPack <= 0) return 'Koli içi miktar sıfırdan büyük olmalıdır.'
  if (input.orderMultiple !== null && input.orderMultiple <= 0) return 'Sipariş katı sıfırdan büyük olmalıdır.'
  if (input.minimumOrderQuantity !== null && input.minimumOrderQuantity <= 0) return 'Asgari sipariş miktarı sıfırdan büyük olmalıdır.'
  for (const days of [input.allowedOrderWeekdays, input.deliveryWeekdays]) if (days?.some((d) => d < 1 || d > 7)) return 'Gün değerleri 1-7 arasında olmalıdır.'
  return null
}

function writeLines(state: DemoState, order: DemoPurchaseOrder, lines: OrderLineInput[], actor: DemoUser): void {
  const canCost = canInventory(actor.roles, 'inventory.cost.manage') && inScope(actor, order.branchId)
  const seen = new Set<string>()
  const next: DemoPurchaseOrder['lines'] = []
  for (const l of lines) {
    const item = state.items.find((i) => i.id === l.inventoryItemId)
    if (!item || item.branchId !== order.branchId) throw new Error('Seçilen ürün bu şubeye ait değil.')
    if (!item.isActive) throw new Error('Bu ürün pasif durumda.')
    if (seen.has(item.id)) throw new Error('Bir ürün siparişte yalnızca bir kez yer alabilir.')
    seen.add(item.id)
    if (!(l.quantity > 0) || l.quantity !== round3(l.quantity)) throw new Error('Miktar sıfırdan büyük olmalıdır.')
    const params = state.supplyParams.find((p) => p.branchId === order.branchId && p.itemId === item.id && p.supplierId === order.supplierId && p.isActive)
    if (params && conversionOf(params.orderUnit, params.unitsPerPack).status === 'missing') throw new Error('Bu ürünün paket dönüşümü eksik: sipariş birimi ve koli içi miktar birlikte tanımlanmalı.')
    const base = toBaseQuantity(l.quantity, params?.unitsPerPack ?? null)
    if (base !== round3(base)) throw new Error('Miktar stok biriminin 3 ondalığından fazlasına dönüşüyor.')
    if (!item.allowsDecimal && !Number.isInteger(base)) throw new Error('Bu ürün tam sayı olarak stoklanır; sipariş miktarı kesire dönüşüyor.')
    if (params?.minimumOrderQuantity != null && l.quantity < params.minimumOrderQuantity) throw new Error('Miktar asgari sipariş miktarının altında.')
    if (params?.orderMultiple != null && round3(l.quantity % params.orderMultiple) !== 0) throw new Error('Miktar sipariş katının katı değil.')
    if (l.unitCostEstimateKurus != null && !canCost) throw new Error(DENIED)
    next.push({
      id: nextId(state, 'demo-pol'),
      inventoryItemId: item.id,
      orderedQuantity: l.quantity,
      receivedQuantity: 0,
      orderUnit: params?.orderUnit ?? null,
      unitsPerPack: params?.unitsPerPack ?? null,
      unitCostEstimateKurus: l.unitCostEstimateKurus ?? null,
    })
  }
  order.lines = next
}

function record(order: DemoPurchaseOrder, from: PurchaseOrderStatus | null, to: PurchaseOrderStatus, by: string, reason: string | null, at: string) {
  order.history.push({ fromStatus: from, toStatus: to, changedBy: by, reason, changedAt: at })
}

function brief(state: DemoState, o: DemoPurchaseOrder): OrderBrief {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    supplierName: state.suppliers.find((s) => s.id === o.supplierId)?.name ?? '',
    expectedDeliveryDate: o.expectedDeliveryDate,
    submittedAt: o.submittedAt,
    lineCount: o.lines.length,
    receivedLineCount: o.lines.filter((l) => l.receivedQuantity >= l.orderedQuantity).length,
  }
}

/** Mirror of procurement_order_reconciliation(): received_quantity x pack vs receipt links vs reversed ledger movements. */
export function reconcile(state: DemoState, o: DemoPurchaseOrder): ReconciliationInfo {
  const reasons = new Set<'receipt_reversed' | 'link_mismatch'>()
  let reversed = 0
  let net = 0
  for (const l of o.lines) {
    const links = o.receipts.filter((r) => r.lineId === l.id)
    const linkBase = links.reduce((s, r) => s + r.baseQuantity, 0)
    const reversedBase = links.filter((r) => state.movements.some((m) => m.reversesMovementId === r.movementId)).reduce((s, r) => s + r.baseQuantity, 0)
    if (reversedBase > 0) reasons.add('receipt_reversed')
    if (round3(linkBase) !== round3(l.receivedQuantity * (l.unitsPerPack ?? 1))) reasons.add('link_mismatch')
    reversed += reversedBase
    net += linkBase - reversedBase
  }
  return { state: reasons.size ? 'warning' : 'ok', reasons: [...reasons], reversedBaseQuantity: round3(reversed), netReceivedBaseQuantity: round3(net) }
}

export function buildSuggestions(state: DemoState, branchId: string, now: Date): OrderSuggestion[] {
  const tz = 'Europe/Istanbul'
  return state.supplyParams
    .filter((p) => p.branchId === branchId && p.isActive)
    .flatMap((p) => {
      const item = state.items.find((i) => i.id === p.itemId)
      const supplier = state.suppliers.find((s) => s.id === p.supplierId)
      if (!item || !item.isActive || !supplier) return []
      const onHand = theoreticalQuantity(state, item.id)
      const pending = pendingFor(state, branchId, item.id)
      const r = suggestOrder(p, onHand, pending)
      return [{
        inventoryItemId: item.id,
        code: item.code,
        name: item.name,
        unit: item.unit,
        supplierId: supplier.id,
        supplierCode: supplier.code,
        supplierName: supplier.name,
        onHand,
        pendingOrderQuantity: pending,
        effectiveStock: r.effectiveStock,
        minimumStock: p.minimumStock,
        targetStock: p.targetStock,
        safetyStock: p.safetyStock,
        orderUnit: p.orderUnit,
        unitsPerPack: p.unitsPerPack,
        conversionStatus: r.conversionStatus,
        status: r.status,
        reorderNeeded: r.reorderNeeded,
        suggestedQuantity: r.suggestedQuantity,
        suggestedBaseQuantity: r.suggestedBaseQuantity,
        hasOpenOrder: pending > 0,
        calendar: procurementCalendar(now, tz, p.allowedOrderWeekdays, p.orderCutoffTime, p.deliveryWeekdays, p.leadTimeDays),
      }]
    })
    .sort((a, b) => a.code.localeCompare(b.code))
}

const wrap = async (fn: () => void): Promise<ProcResult> => {
  try {
    fn()
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'İşlem tamamlanamadı.' }
  }
}

export const demoProcurement = {
  async listSuppliers(): Promise<Supplier[]> {
    const actor = currentDemoUser()
    if (!can(actor, 'procurement.supplier.read')) return []
    return [...demoState().suppliers].sort((a, b) => a.name.localeCompare(b.name))
  },

  async upsertSupplier(input: UpsertSupplierInput): Promise<ProcIdResult> {
    const state = demoState()
    let id: string | null = null
    const r = await wrap(() => {
      actorFor('procurement.supplier.manage')
      if (input.reason.trim().length < 5) throw new Error(REASON)
      if (!input.name.trim()) throw new Error('Ad zorunludur.')
      if (input.id === null) {
        const code = input.code.trim().toUpperCase()
        if (!CODE.test(code)) throw new Error('Kod büyük harf, rakam, nokta, tire veya alt çizgiden oluşmalı (2-32 karakter).')
        if (state.suppliers.some((s) => s.code === code)) throw new Error('Bu kod zaten kullanılıyor.')
        id = `demo-sup-${code.toLowerCase()}`
        state.suppliers.push({ id, code, name: input.name.trim(), supplierType: input.supplierType, contactName: input.contactName, phone: input.phone, email: input.email, notes: input.notes, isActive: true })
        return
      }
      const row = state.suppliers.find((s) => s.id === input.id)
      if (!row) throw new Error('Tedarikçi bulunamadı.')
      Object.assign(row, { name: input.name.trim(), supplierType: input.supplierType, contactName: input.contactName, phone: input.phone, email: input.email, notes: input.notes }) // the code never changes
      id = row.id
    })
    return { ...r, id: r.error ? null : id }
  },

  async setSupplierActive(id: string, active: boolean, reason: string): Promise<ProcResult> {
    return wrap(() => {
      actorFor('procurement.supplier.manage')
      if (reason.trim().length < 5) throw new Error(REASON)
      const row = demoState().suppliers.find((s) => s.id === id)
      if (!row) throw new Error('Tedarikçi bulunamadı.')
      row.isActive = active
    })
  },

  async listSupplyParams(branchId: string): Promise<SupplyParams[]> {
    const actor = currentDemoUser()
    if (!can(actor, 'procurement.order.read', branchId)) return []
    return demoState().supplyParams.filter((p) => p.branchId === branchId)
  },

  async upsertSupplyParams(input: UpsertSupplyParamsInput): Promise<ProcResult> {
    const state = demoState()
    return wrap(() => {
      actorFor('procurement.supply.manage', input.branchId)
      if (input.reason.trim().length < 5) throw new Error(REASON)
      const item = state.items.find((i) => i.id === input.itemId)
      if (!item || item.branchId !== input.branchId) throw new Error('Seçilen ürün bu şubeye ait değil.')
      const supplier = state.suppliers.find((s) => s.id === input.supplierId)
      if (!supplier) throw new Error('Tedarikçi bulunamadı.')
      const existing = state.supplyParams.find((p) => p.branchId === input.branchId && p.itemId === input.itemId)
      if (!supplier.isActive && existing?.supplierId !== input.supplierId) throw new Error('Pasif bir tedarikçi atanamaz.')
      const invalid = validateParams(input)
      if (invalid) throw new Error(invalid)
      const next: SupplyParams = {
        id: existing?.id ?? nextId(state, 'demo-sp'),
        branchId: input.branchId,
        itemId: input.itemId,
        supplierId: input.supplierId,
        orderUnit: input.orderUnit,
        unitsPerPack: input.unitsPerPack,
        minimumStock: input.minimumStock,
        targetStock: input.targetStock,
        safetyStock: input.safetyStock,
        leadTimeDays: input.leadTimeDays,
        allowedOrderWeekdays: sorted(input.allowedOrderWeekdays),
        orderCutoffTime: input.orderCutoffTime,
        deliveryWeekdays: sorted(input.deliveryWeekdays),
        minimumOrderQuantity: input.minimumOrderQuantity,
        orderMultiple: input.orderMultiple,
        isActive: input.isActive,
        notes: input.notes,
      }
      if (existing) Object.assign(existing, next)
      else state.supplyParams.push(next)
    })
  },

  async listPurchaseOrders(branchId: string, statuses?: PurchaseOrderStatus[]): Promise<PurchaseOrderSummary[]> {
    const state = demoState()
    actorFor('procurement.order.read', branchId)
    return state.purchaseOrders
      .filter((o) => o.branchId === branchId && (!statuses || statuses.includes(o.status)))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((o) => {
        const supplier = state.suppliers.find((s) => s.id === o.supplierId)
        const b = brief(state, o)
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          supplierCode: supplier?.code ?? '',
          supplierName: supplier?.name ?? '',
          orderedForDate: o.orderedForDate,
          expectedDeliveryDate: o.expectedDeliveryDate,
          createdAt: o.createdAt,
          lineCount: b.lineCount,
          receivedLineCount: b.receivedLineCount,
          partialLineCount: o.lines.filter((l) => l.receivedQuantity > 0 && l.receivedQuantity < l.orderedQuantity).length,
        }
      })
  },

  async getPurchaseOrder(orderId: string): Promise<PurchaseOrderDetail> {
    const state = demoState()
    const o = findOrder(state, orderId)
    if (!o) throw new Error(DENIED)
    const actor = actorFor('procurement.order.read', o.branchId)
    const canCost = canInventory(actor.roles, 'inventory.cost.read')
    const supplier = state.suppliers.find((s) => s.id === o.supplierId)
    const name = (id: string) => state.employees.find((e) => e.id === id)?.fullName ?? null
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      branchId: o.branchId,
      branchName: state.branches.find((b) => b.id === o.branchId)?.name ?? '',
      status: o.status,
      orderedForDate: o.orderedForDate,
      expectedDeliveryDate: o.expectedDeliveryDate,
      submittedAt: o.submittedAt,
      approvedAt: o.approvedAt,
      receivedAt: o.receivedAt,
      cancelledAt: o.cancelledAt,
      createdAt: o.createdAt,
      notes: o.notes,
      supplier: { id: o.supplierId, code: supplier?.code ?? '', name: supplier?.name ?? '', type: supplier?.supplierType ?? 'COMPANY' },
      lines: o.lines
        .map((l) => {
          const item = state.items.find((i) => i.id === l.inventoryItemId)
          return {
            id: l.id,
            inventoryItemId: l.inventoryItemId,
            code: item?.code ?? '',
            name: item?.name ?? '',
            unit: item?.unit ?? '',
            orderedQuantity: l.orderedQuantity,
            receivedQuantity: l.receivedQuantity,
            openQuantity: round3(l.orderedQuantity - l.receivedQuantity),
            orderedBaseQuantity: toBaseQuantity(l.orderedQuantity, l.unitsPerPack),
            receivedBaseQuantity: toBaseQuantity(l.receivedQuantity, l.unitsPerPack),
            openBaseQuantity: toBaseQuantity(round3(l.orderedQuantity - l.receivedQuantity), l.unitsPerPack),
            orderUnit: l.orderUnit,
            unitsPerPack: l.unitsPerPack,
            notes: null,
            unitCostEstimate: !canCost
              ? ({ state: 'unavailable', reason: 'no_permission' } as const)
              : l.unitCostEstimateKurus === null
                ? ({ state: 'unavailable', reason: 'missing_cost' } as const)
                : ({ state: 'available', kurus: l.unitCostEstimateKurus } as const),
          }
        })
        .sort((a, b) => a.code.localeCompare(b.code)),
      history: o.history.map((h) => ({ ...h, changedBy: name(h.changedBy) })),
      receipts: o.receipts.map((r) => ({ ...r, reversed: state.movements.some((m) => m.reversesMovementId === r.movementId), receivedBy: name(r.receivedBy) })),
      reconciliation: reconcile(state, o),
    }
  },

  async createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<ProcIdResult> {
    const state = demoState()
    let id: string | null = null
    const r = await wrap(() => {
      const actor = actorFor('procurement.order.create', input.branchId)
      const supplier = state.suppliers.find((s) => s.id === input.supplierId)
      if (!supplier || !supplier.isActive) throw new Error('Aktif bir tedarikçi gerekli.')
      const at = state.now().toISOString()
      const order: DemoPurchaseOrder = {
        id: nextId(state, 'demo-po'),
        branchId: input.branchId,
        supplierId: input.supplierId,
        orderNumber: `PO-${istanbulDate(state.now()).slice(0, 4)}-${String(state.purchaseOrders.length + 1).padStart(6, '0')}`,
        status: 'DRAFT',
        orderedForDate: input.orderedForDate,
        expectedDeliveryDate: input.expectedDeliveryDate,
        submittedAt: null,
        approvedAt: null,
        receivedAt: null,
        cancelledAt: null,
        createdBy: actor.id,
        createdAt: at,
        notes: input.notes,
        lines: [],
        history: [],
        receipts: [],
      }
      writeLines(state, order, input.lines, actor)
      record(order, null, 'DRAFT', actor.id, 'created', at)
      state.purchaseOrders.push(order)
      id = order.id
    })
    return { ...r, id: r.error ? null : id }
  },

  async replacePurchaseOrderLines(orderId: string, lines: OrderLineInput[]): Promise<ProcResult> {
    const state = demoState()
    return wrap(() => {
      const o = findOrder(state, orderId)
      if (!o) throw new Error(DENIED)
      const actor = actorFor('procurement.order.create', o.branchId)
      if (o.status !== 'DRAFT') throw new Error('Yalnızca TASLAK sipariş düzenlenebilir.')
      writeLines(state, o, lines, actor)
    })
  },

  async updatePurchaseOrderHeader(orderId: string, orderedForDate: string | null, expectedDeliveryDate: string | null, notes: string | null): Promise<ProcResult> {
    return wrap(() => {
      const o = findOrder(demoState(), orderId)
      if (!o) throw new Error(DENIED)
      actorFor('procurement.order.create', o.branchId)
      if (o.status !== 'DRAFT') throw new Error('Yalnızca TASLAK sipariş düzenlenebilir.')
      o.orderedForDate = orderedForDate
      o.expectedDeliveryDate = expectedDeliveryDate
      o.notes = notes
    })
  },

  async transitionPurchaseOrder(orderId: string, to: PurchaseOrderStatus, reason: string | null): Promise<ProcResult> {
    const state = demoState()
    return wrap(() => {
      const o = findOrder(state, orderId)
      if (!o) throw new Error(DENIED)
      if (to === 'PARTIALLY_RECEIVED') throw new Error('Bu durum doğrudan atanamaz.')
      if (to === 'RECEIVED' && o.status !== 'PARTIALLY_RECEIVED') throw new Error('Siparişi yalnızca kısmi teslim edilmişse eksik kapatabilirsiniz.')
      if (!transitionAllowed(o.status, to)) throw new Error(`${o.status} durumundan ${to} durumuna geçilemez.`)
      const actor = actorFor(permissionForTransition(o.status, to), o.branchId)
      if (transitionNeedsReason(to) && (reason ?? '').trim().length < 5) throw new Error(REASON)
      if (to === 'SUBMITTED' && o.lines.length === 0) throw new Error('Göndermeden önce en az bir satır gerekli.')
      if (to === 'CANCELLED' && o.lines.some((l) => l.receivedQuantity > 0)) throw new Error('Teslim alınmış siparişler iptal edilemez.')
      const at = state.now().toISOString()
      const from = o.status
      o.status = to
      if (to === 'SUBMITTED') o.submittedAt = at
      if (to === 'APPROVED') o.approvedAt = at
      if (to === 'CANCELLED') o.cancelledAt = at
      if (to === 'RECEIVED') o.receivedAt = at
      record(o, from, to, actor.id, reason?.trim() || null, at)
    })
  },

  async receivePurchaseOrder(orderId: string, lines: ReceiveLineInput[], note: string | null): Promise<ProcResult & { status?: PurchaseOrderStatus }> {
    const state = demoState()
    let status: PurchaseOrderStatus | undefined
    const r = await wrap(() => {
      const o = findOrder(state, orderId)
      if (!o) throw new Error(DENIED)
      const actor = actorFor('procurement.order.receive', o.branchId)
      if (!RECEIVABLE_STATUSES.includes(o.status)) throw new Error(`${o.status} durumundaki sipariş teslim alınamaz.`)
      if (lines.length === 0) throw new Error('En az bir satır gerekli.')
      const hasCost = lines.some((l) => l.unitCost != null)
      if (hasCost && !(canInventory(actor.roles, 'inventory.cost.manage') && inScope(actor, o.branchId))) throw new Error(DENIED)
      // validate everything first so a bad line changes nothing (the SQL does the same inside one transaction)
      const seen = new Set<string>()
      for (const l of lines) {
        const line = o.lines.find((x) => x.id === l.lineId)
        if (!line) throw new Error('Satır bu siparişe ait değil.')
        if (seen.has(l.lineId)) throw new Error('Bir satır tek teslimatta yalnızca bir kez yer alabilir.')
        seen.add(l.lineId)
        if (!(l.quantity > 0)) throw new Error('Miktar sıfırdan büyük olmalıdır.')
        if (l.quantity > round3(line.orderedQuantity - line.receivedQuantity) + 1e-9) throw new Error('Miktar satırda açık kalan miktarı aşıyor.')
        if ((line.orderUnit === null) !== (line.unitsPerPack === null)) throw new Error('Satırın paket dönüşümü bilinmiyor; teslim alma reddedildi.')
        const item = state.items.find((i) => i.id === line.inventoryItemId)
        if (!item?.isActive) throw new Error('Ürün pasif: teslim almak için ürünü aktifleştirin veya siparişi kapatın/iptal edin.')
        const base = toBaseQuantity(l.quantity, line.unitsPerPack)
        if (!item.allowsDecimal && !Number.isInteger(base)) throw new Error('Bu ürün tam sayı olarak stoklanır; teslim miktarı kesire dönüşüyor.')
      }
      const at = state.now()
      for (const l of lines) {
        const line = o.lines.find((x) => x.id === l.lineId)!
        if (l.unitCost != null) {
          state.costs.push({ id: nextId(state, 'demo-cost'), inventoryItemId: line.inventoryItemId, unitCost: l.unitCost, effectiveFrom: at.toISOString(), reason: o.orderNumber })
        }
        // the ledger RECEIPT is in BASE units: order quantity x the line's frozen pack factor
        const baseQuantity = toBaseQuantity(l.quantity, line.unitsPerPack)
        const movement = addMovement(state, { itemId: line.inventoryItemId, type: 'RECEIPT', quantity: baseQuantity, at, createdBy: actor.id, reference: o.orderNumber, reason: note })
        line.receivedQuantity = round3(line.receivedQuantity + l.quantity)
        o.receipts.push({ lineId: line.id, movementId: movement.id, quantity: l.quantity, baseQuantity, receivedBy: actor.id, receivedAt: at.toISOString() })
      }
      const from = o.status
      o.status = o.lines.every((l) => l.receivedQuantity >= l.orderedQuantity) ? 'RECEIVED' : 'PARTIALLY_RECEIVED'
      if (o.status === 'RECEIVED') o.receivedAt = at.toISOString()
      record(o, from, o.status, actor.id, note?.trim() || 'received', at.toISOString())
      status = o.status
    })
    return r.error ? r : { ...r, status }
  },

  async getOrderSuggestions(branchId: string): Promise<OrderSuggestion[]> {
    actorFor('procurement.order.read', branchId)
    return buildSuggestions(demoState(), branchId, demoState().now())
  },

  async getProcurementAttention(branchId: string): Promise<ProcurementAttention> {
    actorFor('procurement.order.read', branchId)
    const state = demoState()
    const today = istanbulDate(state.now())
    const open = state.purchaseOrders.filter((o) => o.branchId === branchId && RECEIVABLE_STATUSES.includes(o.status))
    const suggestions = buildSuggestions(state, branchId, state.now())
    return {
      branchId,
      today,
      awaitingApproval: state.purchaseOrders.filter((o) => o.branchId === branchId && o.status === 'SUBMITTED').map((o) => brief(state, o)),
      dueToday: open.filter((o) => o.expectedDeliveryDate === today).map((o) => brief(state, o)),
      overdueDelivery: open.filter((o) => o.expectedDeliveryDate !== null && o.expectedDeliveryDate < today).map((o) => brief(state, o)),
      partiallyReceived: state.purchaseOrders.filter((o) => o.branchId === branchId && o.status === 'PARTIALLY_RECEIVED').map((o) => brief(state, o)),
      nextDeliveries: open
        .filter((o) => o.expectedDeliveryDate !== null && o.expectedDeliveryDate >= today)
        .sort((a, b) => (a.expectedDeliveryDate ?? '').localeCompare(b.expectedDeliveryDate ?? ''))
        .slice(0, 10)
        .map((o) => brief(state, o)),
      lowStockNoOpenOrder: suggestions.filter((s) => s.reorderNeeded === true && !s.hasOpenOrder),
      reconciliationWarnings: state.purchaseOrders
        .filter((o) => o.branchId === branchId && ['APPROVED', 'PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(o.status))
        .map((o) => ({ o, rec: reconcile(state, o) }))
        .filter(({ rec }) => rec.state === 'warning')
        .map(({ o, rec }) => ({ ...brief(state, o), reasons: rec.reasons })),
    }
  },
}
