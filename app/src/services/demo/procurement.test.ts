import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_STORAGE_KEY } from '../../features/auth/demoSession'
import { demoApi } from './api'
import { buildSuggestions } from './procurement'
import { demoState, resetDemoState } from './state'
import { addMovement, DEMO_BRANCH_DONDURMA as D } from './store'
import { istanbulDate } from '../../utils/dates'

const NOW = new Date('2026-10-07T12:00:00+03:00') // a Wednesday
const signInAs = (code: string) => sessionStorage.setItem(DEMO_STORAGE_KEY, `${code}:2027`)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  sessionStorage.clear()
  resetDemoState(NOW, { fixtureSet: 'qa' })
})
afterEach(() => vi.useRealTimers())

describe('synthetic QA procurement scenarios', () => {
  it('has company, central warehouse and inactive suppliers', () => {
    const suppliers = demoState().suppliers
    expect(suppliers.map((s) => [s.supplierType, s.isActive])).toEqual([['COMPANY', true], ['CENTRAL_WAREHOUSE', true], ['COMPANY', false]])
  })

  it('covers every order status with received/open quantities', () => {
    const orders = demoState().purchaseOrders
    expect(new Set(orders.map((o) => o.status))).toEqual(new Set(['DRAFT', 'SUBMITTED', 'APPROVED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']))
    const partial = orders.find((o) => o.status === 'PARTIALLY_RECEIVED')!
    expect(partial.lines.map((l) => [l.orderedQuantity, l.receivedQuantity])).toEqual([[6, 4], [12, 0]])
    // receipts went through the demo ledger as plain RECEIPT movements referenced by the order number
    const movement = demoState().movements.find((m) => m.id === partial.receipts[0]?.movementId)
    expect(movement).toMatchObject({ type: 'RECEIPT', reference: partial.orderNumber })
    expect(movement?.unitCostSnapshot).not.toBeNull() // DEMO-B has an effective cost
    const received = orders.find((o) => o.status === 'RECEIVED')!
    expect(demoState().movements.find((m) => m.id === received.receipts[0]?.movementId)?.unitCostSnapshot).toBeNull() // uncosted DEMO-C: missing, never 0
  })

  it('suggestions: below minimum without cost, minimum only, calendar from the branch weekdays', () => {
    const s = buildSuggestions(demoState(), D, NOW)
    const c = s.find((x) => x.code === 'DEMO-C')!
    expect(c).toMatchObject({ status: 'partially_configured', reorderNeeded: true, suggestedQuantity: null })
    const a = s.find((x) => x.code === 'DEMO-A')!
    expect(a.calendar).toMatchObject({ configured: true, today: '2026-10-07', canOrderToday: true, cutoffPassed: false }) // Wednesday 12:00, cutoff 14:00
    expect(a.pendingOrderQuantity).toBe(30) // approved 18 + partially received open 12; the DRAFT does not count
    expect(s.every((x) => x.suggestedQuantity === null || x.suggestedQuantity > 0)).toBe(true)
  })
})

describe('demo procurement flows mirror the SQL rules', () => {
  it('manager runs the whole lifecycle and receiving through the existing ledger', async () => {
    signInAs('M001')
    const item = demoState().items.find((i) => i.code === 'DEMO-B')!
    const before = demoState().movements.filter((m) => m.inventoryItemId === item.id).reduce((s, m) => s + m.stockDelta, 0)
    // order multiple 2 for DEMO-B at SYN-CO-A
    expect((await demoApi.createPurchaseOrder({ branchId: D, supplierId: 'demo-sup-syn-co-a', orderedForDate: null, expectedDeliveryDate: null, notes: null, lines: [{ inventoryItemId: item.id, quantity: 3 }] })).error).not.toBeNull()
    const created = await demoApi.createPurchaseOrder({ branchId: D, supplierId: 'demo-sup-syn-co-a', orderedForDate: null, expectedDeliveryDate: istanbulDate(NOW), notes: null, lines: [{ inventoryItemId: item.id, quantity: 10 }] })
    expect(created.error).toBeNull()
    const id = created.id as string
    expect((await demoApi.transitionPurchaseOrder(id, 'APPROVED', null)).error).not.toBeNull() // DRAFT cannot jump
    expect((await demoApi.transitionPurchaseOrder(id, 'SUBMITTED', null)).error).toBeNull()
    expect((await demoApi.replacePurchaseOrderLines(id, [{ inventoryItemId: item.id, quantity: 4 }])).error).not.toBeNull() // frozen once submitted
    expect((await demoApi.transitionPurchaseOrder(id, 'APPROVED', null)).error).toBeNull()
    const detail = await demoApi.getPurchaseOrder(id)
    const line = detail.lines[0]!
    expect((await demoApi.receivePurchaseOrder(id, [{ lineId: line.id, quantity: 11 }], null)).error).not.toBeNull() // more than open
    const partial = await demoApi.receivePurchaseOrder(id, [{ lineId: line.id, quantity: 4 }], 'ilk teslimat')
    expect(partial).toMatchObject({ error: null, status: 'PARTIALLY_RECEIVED' })
    expect(demoState().movements.filter((m) => m.inventoryItemId === item.id).reduce((s, m) => s + m.stockDelta, 0)).toBe(before + 4)
    const rest = await demoApi.receivePurchaseOrder(id, [{ lineId: line.id, quantity: 6, unitCost: 7.5 }], null)
    expect(rest).toMatchObject({ error: null, status: 'RECEIVED' })
    expect((await demoApi.receivePurchaseOrder(id, [{ lineId: line.id, quantity: 1 }], null)).error).not.toBeNull() // no double receive
    expect((await demoApi.transitionPurchaseOrder(id, 'CANCELLED', 'too late to cancel')).error).not.toBeNull() // terminal
    const final = await demoApi.getPurchaseOrder(id)
    expect(final.receipts).toHaveLength(2)
    expect(final.history.map((h) => h.toStatus)).toEqual(['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED'])
  })

  it('missing estimate is unavailable (never 0) and an inactive supplier cannot receive orders', async () => {
    signInAs('M001')
    const orders = await demoApi.listPurchaseOrders(D)
    const detail = await demoApi.getPurchaseOrder(orders.find((o) => o.status === 'SUBMITTED')!.id)
    expect(detail.lines[0]?.unitCostEstimate).toEqual({ state: 'unavailable', reason: 'missing_cost' })
    const item = demoState().items.find((i) => i.code === 'DEMO-A')!
    expect((await demoApi.createPurchaseOrder({ branchId: D, supplierId: 'demo-sup-syn-old', orderedForDate: null, expectedDeliveryDate: null, notes: null, lines: [{ inventoryItemId: item.id, quantity: 6 }] })).error).not.toBeNull()
  })

  it('supplier code is immutable, params are validated, an inactive supplier cannot be assigned', async () => {
    signInAs('M001')
    const base = { branchId: D, itemId: 'demo-item-b', supplierId: 'demo-sup-syn-co-a', orderUnit: null, unitsPerPack: null, minimumStock: null, targetStock: null, safetyStock: null, leadTimeDays: null, allowedOrderWeekdays: null, orderCutoffTime: null, deliveryWeekdays: null, minimumOrderQuantity: null, orderMultiple: null, isActive: true, notes: null, reason: 'sentetik test' }
    expect((await demoApi.upsertSupplyParams({ ...base, minimumStock: 10, targetStock: 5 })).error).not.toBeNull()
    expect((await demoApi.upsertSupplyParams({ ...base, minimumStock: -1 })).error).not.toBeNull()
    expect((await demoApi.upsertSupplyParams({ ...base, orderMultiple: 0 })).error).not.toBeNull()
    expect((await demoApi.upsertSupplyParams({ ...base, supplierId: 'demo-sup-syn-old' })).error).not.toBeNull()
    expect((await demoApi.upsertSupplyParams({ ...base, minimumStock: 5, targetStock: 5 })).error).toBeNull()
    const sup = demoState().suppliers[0]!
    await demoApi.upsertSupplier({ id: sup.id, code: 'CHANGED', name: 'Yeni ad', supplierType: 'COMPANY', contactName: null, phone: null, email: null, notes: null, reason: 'ad güncelle' })
    expect(demoState().suppliers[0]).toMatchObject({ code: 'SYN-CO-A', name: 'Yeni ad' })
  })

  it('cashier has no procurement access at all', async () => {
    signInAs('D001')
    expect(await demoApi.listSuppliers()).toEqual([])
    await expect(demoApi.listPurchaseOrders(D)).rejects.toThrow()
    await expect(demoApi.getProcurementAttention(D)).rejects.toThrow()
    expect((await demoApi.upsertSupplier({ id: null, code: 'NOPE-1', name: 'x', supplierType: 'COMPANY', contactName: null, phone: null, email: null, notes: null, reason: 'cashier tries' })).error).not.toBeNull()
    const id = demoState().purchaseOrders.find((o) => o.status === 'APPROVED')!.id
    expect((await demoApi.receivePurchaseOrder(id, [{ lineId: 'x', quantity: 1 }], null)).error).not.toBeNull()
  })

  it('attention lists due today, overdue, awaiting approval, partially received and low stock without an open order', async () => {
    signInAs('M001')
    const a = await demoApi.getProcurementAttention(D)
    expect(a.dueToday).toHaveLength(1)
    expect(a.overdueDelivery).toHaveLength(1)
    expect(a.awaitingApproval).toHaveLength(1)
    expect(a.partiallyReceived).toHaveLength(1)
    expect(a.lowStockNoOpenOrder.map((s) => s.code)).toContain('DEMO-C')
    expect(a.nextDeliveries.map((o) => o.status)).not.toContain('SUBMITTED')
  })
})

describe('unit contract: order unit vs base (stock) unit (mirrors the SQL tests)', () => {
  const d = () => demoState().items.find((i) => i.code === 'DEMO-D')! // adet, ordered in koli of 12
  const stock = (id: string) => demoState().movements.filter((m) => m.inventoryItemId === id).reduce((sum, m) => sum + m.stockDelta, 0)
  const params = (patch: Record<string, unknown>) => ({
    branchId: D, itemId: 'demo-item-d', supplierId: 'demo-sup-syn-cw', orderUnit: 'koli', unitsPerPack: 12, minimumStock: 100, targetStock: 300, safetyStock: null, leadTimeDays: 1,
    allowedOrderWeekdays: [1, 2, 3, 4, 5], orderCutoffTime: '16:00', deliveryWeekdays: null, minimumOrderQuantity: null, orderMultiple: null, isActive: true, notes: null, reason: 'sentetik test', ...patch,
  })
  const order = async (qty: number) => {
    const created = await demoApi.createPurchaseOrder({ branchId: D, supplierId: 'demo-sup-syn-cw', orderedForDate: null, expectedDeliveryDate: null, notes: null, lines: [{ inventoryItemId: d().id, quantity: qty }] })
    expect(created.error).toBeNull()
    const id = created.id as string
    await demoApi.transitionPurchaseOrder(id, 'SUBMITTED', null)
    await demoApi.transitionPurchaseOrder(id, 'APPROVED', null)
    return { id, line: (await demoApi.getPurchaseOrder(id)).lines[0]! }
  }

  it('2 koli x 12 -> the ledger gains 24 base units (not 2); partial 1 koli -> +12', async () => {
    signInAs('M001')
    const { id, line } = await order(2)
    expect(line).toMatchObject({ orderedQuantity: 2, orderedBaseQuantity: 24, orderUnit: 'koli', unitsPerPack: 12 })
    const before = stock(d().id)
    expect(await demoApi.receivePurchaseOrder(id, [{ lineId: line.id, quantity: 1 }], null)).toMatchObject({ error: null, status: 'PARTIALLY_RECEIVED' })
    expect(stock(d().id)).toBe(before + 12)
    const partial = await demoApi.getPurchaseOrder(id)
    expect(partial.lines[0]).toMatchObject({ receivedQuantity: 1, receivedBaseQuantity: 12, openQuantity: 1, openBaseQuantity: 12 })
    expect(partial.receipts[0]).toMatchObject({ quantity: 1, baseQuantity: 12, reversed: false })
    expect((await demoApi.receivePurchaseOrder(id, [{ lineId: line.id, quantity: 1.5 }], null)).error).not.toBeNull()
    expect(await demoApi.receivePurchaseOrder(id, [{ lineId: line.id, quantity: 1 }], null)).toMatchObject({ error: null, status: 'RECEIVED' })
    expect(stock(d().id)).toBe(before + 24)
  })

  it('a later pack-size change never rewrites an existing order (snapshot), new orders use the new size', async () => {
    signInAs('M001')
    const { id, line } = await order(2)
    expect((await demoApi.upsertSupplyParams(params({ unitsPerPack: 10 }))).error).toBeNull()
    const before = stock(d().id)
    await demoApi.receivePurchaseOrder(id, [{ lineId: line.id, quantity: 1 }], null)
    expect(stock(d().id)).toBe(before + 12) // the snapshot (12), not the new 10
    const fresh = await order(1)
    expect(fresh.line).toMatchObject({ unitsPerPack: 10, orderedBaseQuantity: 10 })
  })

  it('a half-known conversion is refused, a fractional piece is refused, nothing is guessed', async () => {
    signInAs('M001')
    expect((await demoApi.upsertSupplyParams(params({ unitsPerPack: null }))).error).toBeNull() // saved half-configured (input still missing)
    const refused = await demoApi.createPurchaseOrder({ branchId: D, supplierId: 'demo-sup-syn-cw', orderedForDate: null, expectedDeliveryDate: null, notes: null, lines: [{ inventoryItemId: d().id, quantity: 1 }] })
    expect(refused.error).not.toBeNull()
    const s = (await demoApi.getOrderSuggestions(D)).find((x) => x.code === 'DEMO-D')!
    expect(s).toMatchObject({ conversionStatus: 'missing', suggestedQuantity: null, suggestedBaseQuantity: null })
    expect((await demoApi.upsertSupplyParams(params({ unitsPerPack: 10 }))).error).toBeNull()
    const fraction = await demoApi.createPurchaseOrder({ branchId: D, supplierId: 'demo-sup-syn-cw', orderedForDate: null, expectedDeliveryDate: null, notes: null, lines: [{ inventoryItemId: d().id, quantity: 0.25 }] })
    expect(fraction.error).not.toBeNull() // 2.5 pieces of a whole-unit item
  })

  it('suggestions are dimensionally valid: pending packs are converted to pieces before being added to stock', async () => {
    signInAs('M001')
    const s = (await demoApi.getOrderSuggestions(D)).find((x) => x.code === 'DEMO-D')!
    // the QA IN_TRANSIT order of 2 koli = 24 pieces is pending, never "2"
    expect(s).toMatchObject({ conversionStatus: 'pack', unit: 'adet', orderUnit: 'koli', pendingOrderQuantity: 24 })
    expect(s.effectiveStock).toBe(s.onHand + 24)
    if (s.suggestedQuantity !== null) expect(s.suggestedBaseQuantity).toBe(s.suggestedQuantity * 12)
  })

  it('a failing line in a multi-line receipt changes nothing', async () => {
    signInAs('M001')
    const a = demoState().items.find((i) => i.code === 'DEMO-A')!
    const created = await demoApi.createPurchaseOrder({ branchId: D, supplierId: 'demo-sup-syn-cw', orderedForDate: null, expectedDeliveryDate: null, notes: null, lines: [{ inventoryItemId: a.id, quantity: 6 }, { inventoryItemId: d().id, quantity: 1 }] })
    expect(created.error).toBeNull()
    const id = created.id as string
    await demoApi.transitionPurchaseOrder(id, 'SUBMITTED', null)
    await demoApi.transitionPurchaseOrder(id, 'APPROVED', null)
    const lines = (await demoApi.getPurchaseOrder(id)).lines
    const la = lines.find((l) => l.code === 'DEMO-A')!
    const ld = lines.find((l) => l.code === 'DEMO-D')!
    const movements = demoState().movements.length
    const result = await demoApi.receivePurchaseOrder(id, [{ lineId: la.id, quantity: 3 }, { lineId: ld.id, quantity: 100 }], null)
    expect(result.error).not.toBeNull()
    expect(demoState().movements.length).toBe(movements)
    const after = await demoApi.getPurchaseOrder(id)
    expect(after.receipts).toHaveLength(0)
    expect(after.lines.every((l) => l.receivedQuantity === 0)).toBe(true)
    expect(after.status).toBe('APPROVED')
  })

  it('a reversed receipt movement is a visible reconciliation warning, not a silent reopen', async () => {
    signInAs('M001')
    const { id, line } = await order(1)
    await demoApi.receivePurchaseOrder(id, [{ lineId: line.id, quantity: 1 }], null)
    expect((await demoApi.getPurchaseOrder(id)).reconciliation.state).toBe('ok')
    const receipt = (await demoApi.getPurchaseOrder(id)).receipts[0]!
    addMovement(demoState(), { itemId: d().id, type: 'REVERSAL', at: NOW, createdBy: 'demo-m001', reversesMovementId: receipt.movementId, reason: 'test reversal' })
    const detail = await demoApi.getPurchaseOrder(id)
    expect(detail.status).toBe('RECEIVED')
    expect(detail.reconciliation).toMatchObject({ state: 'warning', reasons: ['receipt_reversed'], reversedBaseQuantity: 12, netReceivedBaseQuantity: 0 })
    expect(detail.receipts[0]?.reversed).toBe(true)
    expect(detail.lines[0]?.receivedQuantity).toBe(1) // what was recorded stays recorded
    expect((await demoApi.getProcurementAttention(D)).reconciliationWarnings.map((o) => o.id)).toContain(id)
  })

  it('an order of a supplier that became inactive can still be received; an inactive item is refused explicitly', async () => {
    signInAs('M001')
    const { id, line } = await order(1)
    await demoApi.setSupplierActive('demo-sup-syn-cw', false, 'tedarikçi pasif')
    expect((await demoApi.receivePurchaseOrder(id, [{ lineId: line.id, quantity: 1 }], null)).error).toBeNull()
    await demoApi.setSupplierActive('demo-sup-syn-cw', true, 'tekrar aktif')
    const second = await order(1)
    d().isActive = false
    expect((await demoApi.receivePurchaseOrder(second.id, [{ lineId: second.line.id, quantity: 1 }], null)).error).toMatch(/pasif/)
    d().isActive = true
    expect((await demoApi.transitionPurchaseOrder(second.id, 'CANCELLED', 'ürün pasifti, iptal')).error).toBeNull()
  })
})
