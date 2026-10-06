/**
 * SYNTHETIC QA scenarios for procurement (Phase 1C). Everything is invented ("Sentetik Firma A", "Sentetik Merkez Depo",
 * "SYN-..."): no real supplier, contact, price, weekday rule or business secret. Applied by applyQaFixtures after the base history.
 *
 *   Suppliers: an active COMPANY, a CENTRAL_WAREHOUSE and an INACTIVE COMPANY.
 *   Dondurma item rules (all values are placeholders for review): order weekdays + cutoff (Mon/Wed/Fri 14:00 and Tue/Thu 10:00, so
 *     the "cutoff passed / not passed" states depend on the time of day), delivery weekdays and lead times, an item below its minimum
 *     (DEMO-C, no cost), an item with only a minimum (partially configured), an item with no thresholds (unavailable).
 *   Orders (Dondurma): DRAFT, SUBMITTED, APPROVED due today, IN_TRANSIT overdue, PARTIALLY_RECEIVED, RECEIVED for the uncosted DEMO-C (the
 *     receipt snapshot is missing, never 0), CANCELLED.
 */
import type { PurchaseOrderStatus, SupplyParams } from '../../domain/procurement'
import type { QaDeps } from './qaFixtures'
import type { DemoPurchaseOrder, DemoState } from './store'

const D = 'demo-branch-dondurma'
const MGR = 'demo-m001'
const CASHIER = 'demo-d001'

export function applyQaProcurement(state: DemoState, deps: QaDeps, date: (offset: number) => string): void {
  const { instant } = deps
  state.suppliers.push(
    { id: 'demo-sup-syn-co-a', code: 'SYN-CO-A', name: 'Sentetik Firma A', supplierType: 'COMPANY', contactName: 'Demo Kişi', phone: null, email: null, notes: 'Sentetik örnek', isActive: true },
    { id: 'demo-sup-syn-cw', code: 'SYN-CW', name: 'Sentetik Merkez Depo', supplierType: 'CENTRAL_WAREHOUSE', contactName: null, phone: null, email: null, notes: 'Sentetik örnek', isActive: true },
    { id: 'demo-sup-syn-old', code: 'SYN-OLD', name: 'Sentetik Pasif Firma', supplierType: 'COMPANY', contactName: null, phone: null, email: null, notes: 'Pasif örnek', isActive: false },
  )

  const params = (itemId: string, supplierId: string, p: Partial<SupplyParams>): void => {
    state.supplyParams.push({
      id: `demo-sp-${itemId}`, branchId: D, itemId, supplierId, orderUnit: null, unitsPerPack: null, minimumStock: null, targetStock: null, safetyStock: null,
      leadTimeDays: null, allowedOrderWeekdays: null, orderCutoffTime: null, deliveryWeekdays: null, minimumOrderQuantity: null, orderMultiple: null,
      isActive: true, notes: null, ...p,
    })
  }
  params('demo-item-a', 'demo-sup-syn-cw', { minimumStock: 10, targetStock: 40, safetyStock: 4, leadTimeDays: 1, allowedOrderWeekdays: [1, 3, 5], orderCutoffTime: '14:00', deliveryWeekdays: [2, 4, 6], minimumOrderQuantity: 6, orderMultiple: 6 }) // kg, ordered in kg
  params('demo-item-b', 'demo-sup-syn-co-a', { minimumStock: 5, targetStock: 25, leadTimeDays: 2, allowedOrderWeekdays: [2, 4], orderCutoffTime: '10:00', orderMultiple: 2 }) // kg, ordered in kg
  params('demo-item-c', 'demo-sup-syn-co-a', { minimumStock: 1000 }) // far above the stock on hand: below minimum, partially configured, no cost
  params('demo-item-d', 'demo-sup-syn-cw', { orderUnit: 'koli', unitsPerPack: 12, minimumStock: 100, targetStock: 300, leadTimeDays: 1, allowedOrderWeekdays: [1, 2, 3, 4, 5], orderCutoffTime: '16:00' }) // pieces (adet), ordered in koli of 12

  let n = 0
  const order = (status: PurchaseOrderStatus, supplierId: string, expected: number | null, lines: Array<[string, number, number]>, createdOffset: number): DemoPurchaseOrder => {
    n += 1
    const created = instant(date(createdOffset), 9).toISOString()
    const o: DemoPurchaseOrder = {
      id: `demo-po-qa-${n}`,
      branchId: D,
      supplierId,
      orderNumber: `PO-${date(0).slice(0, 4)}-${String(900 + n).padStart(6, '0')}`,
      status,
      orderedForDate: null,
      expectedDeliveryDate: expected === null ? null : date(expected),
      submittedAt: null,
      approvedAt: null,
      receivedAt: null,
      cancelledAt: null,
      createdBy: CASHIER,
      createdAt: created,
      notes: 'Sentetik sipariş',
      lines: lines.map(([itemId, qty, received], i) => ({
        id: `demo-pol-qa-${n}-${i}`, inventoryItemId: itemId, orderedQuantity: qty, receivedQuantity: received,
        // lines snapshot the pack conversion of the item's supply parameters (only DEMO-D is ordered in packs)
        orderUnit: state.supplyParams.find((p) => p.itemId === itemId)?.orderUnit ?? null,
        unitsPerPack: state.supplyParams.find((p) => p.itemId === itemId)?.unitsPerPack ?? null,
        unitCostEstimateKurus: itemId === 'demo-item-a' ? 4200 : null,
      })),
      history: [{ fromStatus: null, toStatus: 'DRAFT', changedBy: CASHIER, reason: 'created', changedAt: created }],
      receipts: [],
    }
    const path: PurchaseOrderStatus[] = ['SUBMITTED', 'APPROVED', 'PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED']
    const reach: PurchaseOrderStatus[] = status === 'CANCELLED' ? ['SUBMITTED'] : path.slice(0, path.indexOf(status) + 1)
    let prev: PurchaseOrderStatus = 'DRAFT'
    for (const s of status === 'DRAFT' ? [] : reach) {
      const at = created
      o.history.push({ fromStatus: prev, toStatus: s, changedBy: s === 'SUBMITTED' ? CASHIER : MGR, reason: null, changedAt: at })
      if (s === 'SUBMITTED') o.submittedAt = at
      if (s === 'APPROVED') o.approvedAt = at
      prev = s
    }
    if (status === 'CANCELLED') {
      o.cancelledAt = created
      o.history.push({ fromStatus: 'SUBMITTED', toStatus: 'CANCELLED', changedBy: MGR, reason: 'Sentetik iptal', changedAt: created })
    }
    if (status === 'RECEIVED') o.receivedAt = created
    for (const l of o.lines) {
      if (l.receivedQuantity > 0) {
        // real receipts go through the demo ledger, exactly like a RECEIPT movement (the snapshot is the item's effective cost; missing for DEMO-C)
        const baseQuantity = l.receivedQuantity * (l.unitsPerPack ?? 1)
        const movement = deps.addMovement(state, { itemId: l.inventoryItemId, type: 'RECEIPT', quantity: baseQuantity, at: instant(date(createdOffset + 1), 11), createdBy: CASHIER, reference: o.orderNumber }) as { id: string }
        o.receipts.push({ lineId: l.id, movementId: movement.id, quantity: l.receivedQuantity, baseQuantity, receivedBy: CASHIER, receivedAt: instant(date(createdOffset + 1), 11).toISOString() })
      }
    }
    state.purchaseOrders.push(o)
    return o
  }

  order('DRAFT', 'demo-sup-syn-cw', 3, [['demo-item-a', 12, 0]], 0)
  order('SUBMITTED', 'demo-sup-syn-co-a', 3, [['demo-item-b', 10, 0]], -1)
  order('APPROVED', 'demo-sup-syn-cw', 0, [['demo-item-a', 18, 0]], -2) // due today
  order('IN_TRANSIT', 'demo-sup-syn-cw', -2, [['demo-item-d', 2, 0]], -5) // overdue: 2 koli = 24 pieces
  order('PARTIALLY_RECEIVED', 'demo-sup-syn-co-a', 1, [['demo-item-b', 6, 4], ['demo-item-a', 12, 0]], -4)
  order('RECEIVED', 'demo-sup-syn-co-a', -8, [['demo-item-c', 6, 6]], -10) // DEMO-C has no cost: its receipt snapshot is missing
  order('CANCELLED', 'demo-sup-syn-cw', null, [['demo-item-d', 1, 0]], -7)
}
