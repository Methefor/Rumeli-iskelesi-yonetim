import { describe, expect, it } from 'vitest'
import { availableTransitions, canProcurement, conversionOf, permissionForTransition, procurementCalendar, suggestOrder, toBaseQuantity, transitionAllowed, transitionNeedsReason } from './rules'

// The numbers mirror supabase/tests/procurement.test.sql.
const MON_WED_FRI = [1, 3, 5]
const TUE_THU_SAT = [2, 4, 6]
const at = (iso: string) => new Date(iso)

describe('state machine', () => {
  it('RECEIVED and CANCELLED are terminal', () => {
    for (const from of ['RECEIVED', 'CANCELLED'] as const) {
      for (const to of ['DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED', 'RECEIVED'] as const) expect(transitionAllowed(from, to)).toBe(false)
    }
  })
  it('follows DRAFT -> SUBMITTED -> APPROVED -> PREPARING -> IN_TRANSIT and allows return/cancel', () => {
    expect(transitionAllowed('DRAFT', 'SUBMITTED')).toBe(true)
    expect(transitionAllowed('SUBMITTED', 'APPROVED')).toBe(true)
    expect(transitionAllowed('APPROVED', 'PREPARING')).toBe(true)
    expect(transitionAllowed('PREPARING', 'IN_TRANSIT')).toBe(true)
    expect(transitionAllowed('SUBMITTED', 'DRAFT')).toBe(true)
    expect(transitionAllowed('APPROVED', 'SUBMITTED')).toBe(false)
    expect(transitionAllowed('IN_TRANSIT', 'PREPARING')).toBe(false)
    expect(transitionAllowed('PARTIALLY_RECEIVED', 'CANCELLED')).toBe(false)
  })
  it('approval needs the approve permission, which branch_manager does not hold', () => {
    expect(permissionForTransition('SUBMITTED', 'APPROVED')).toBe('procurement.order.approve')
    expect(canProcurement(['branch_manager'], 'procurement.order.approve')).toBe(false)
    expect(canProcurement(['manager'], 'procurement.order.approve')).toBe(true)
    expect(canProcurement(['cashier'], 'procurement.order.read')).toBe(false)
  })
  it('lists only the moves a role may make', () => {
    expect(availableTransitions('DRAFT', ['branch_manager'])).toEqual(['SUBMITTED', 'CANCELLED'])
    expect(availableTransitions('SUBMITTED', ['branch_manager'])).toEqual([])
    expect(availableTransitions('SUBMITTED', ['manager'])).toEqual(['DRAFT', 'APPROVED', 'CANCELLED'])
    expect(availableTransitions('PARTIALLY_RECEIVED', ['manager'])).toEqual(['RECEIVED'])
    expect(availableTransitions('RECEIVED', ['owner'])).toEqual([])
  })
  it('destructive moves need a reason', () => {
    expect(transitionNeedsReason('CANCELLED')).toBe(true)
    expect(transitionNeedsReason('DRAFT')).toBe(true)
    expect(transitionNeedsReason('APPROVED')).toBe(false)
  })
})

describe('procurementCalendar (branch time zone, Europe/Istanbul)', () => {
  it('Monday 10:00: can order, cutoff not passed, delivery is an estimate', () => {
    const c = procurementCalendar(at('2026-10-05T10:00:00+03:00'), 'Europe/Istanbul', MON_WED_FRI, '14:00', TUE_THU_SAT, 1)
    expect(c).toMatchObject({ canOrderToday: true, cutoffPassed: false, nextOrderDate: '2026-10-05', expectedDelivery: { state: 'estimated', date: '2026-10-06' } })
  })
  it('Monday 15:00: cutoff passed, next order day Wednesday, delivery Thursday', () => {
    const c = procurementCalendar(at('2026-10-05T15:00:00+03:00'), 'Europe/Istanbul', MON_WED_FRI, '14:00', TUE_THU_SAT, 1)
    expect(c).toMatchObject({ canOrderToday: false, cutoffPassed: true, nextOrderDate: '2026-10-07', expectedDelivery: { date: '2026-10-08' } })
  })
  it('Tuesday: not an order day, cutoff not applicable; no lead/delivery rule = unknown delivery', () => {
    const c = procurementCalendar(at('2026-10-06T10:00:00+03:00'), 'Europe/Istanbul', MON_WED_FRI, '14:00', null, null)
    expect(c).toMatchObject({ canOrderToday: false, cutoffPassed: null, nextOrderDate: '2026-10-07', expectedDelivery: { state: 'unknown', date: null } })
  })
  it('the branch time zone decides the day (22:30 UTC is Tuesday in Istanbul, Monday in UTC)', () => {
    const now = at('2026-10-05T22:30:00Z')
    expect(procurementCalendar(now, 'Europe/Istanbul', [1], null, null, null)).toMatchObject({ today: '2026-10-06', canOrderToday: false })
    expect(procurementCalendar(now, 'UTC', [1], null, null, null)).toMatchObject({ today: '2026-10-05', canOrderToday: true })
  })
  it('the cutoff minute counts as passed; no cutoff means orderable all day; unconfigured invents nothing', () => {
    expect(procurementCalendar(at('2026-10-05T23:59:00+03:00'), 'Europe/Istanbul', [1], '23:59', null, null).cutoffPassed).toBe(true)
    expect(procurementCalendar(at('2026-10-05T23:00:00+03:00'), 'Europe/Istanbul', [1], null, null, null)).toMatchObject({ canOrderToday: true, cutoffPassed: null })
    expect(procurementCalendar(at('2026-10-05T10:00:00+03:00'), 'Europe/Istanbul', null, '14:00', null, null)).toMatchObject({ configured: false, canOrderToday: null, nextOrderDate: null })
  })
  it('Sunday with only a lead time: next Monday + lead, estimated', () => {
    const c = procurementCalendar(at('2026-10-04T12:00:00+03:00'), 'Europe/Istanbul', MON_WED_FRI, null, null, 2)
    expect(c).toMatchObject({ nextOrderDate: '2026-10-05', expectedDelivery: { state: 'estimated', date: '2026-10-07' } })
  })
})

describe('suggestOrder (deterministic primitives)', () => {
  const p = { minimumStock: 5, targetStock: 20, safetyStock: null, minimumOrderQuantity: 6, orderMultiple: 6, orderUnit: null, unitsPerPack: null }
  it('target 20, on hand 3 -> 17 rounded up to the multiple 6 = 18', () => {
    expect(suggestOrder(p, 3, 0)).toEqual({ effectiveStock: 3, status: 'configured', reorderNeeded: true, conversionStatus: 'base_unit', suggestedQuantity: 18, suggestedBaseQuantity: 18 })
  })
  it('a pending order counts: effective 9 -> 11 -> 12', () => {
    expect(suggestOrder(p, 3, 6)).toMatchObject({ effectiveStock: 9, suggestedQuantity: 12 })
  })
  it('target reached: no suggestion (never 0 or negative)', () => {
    expect(suggestOrder(p, 25, 0).suggestedQuantity).toBeNull()
    expect(suggestOrder(p, 20, 0).suggestedQuantity).toBeNull()
  })
  it('minimum only: partially configured, reorder flag, no invented quantity', () => {
    expect(suggestOrder({ minimumStock: 10, targetStock: null, safetyStock: null, minimumOrderQuantity: null, orderMultiple: null, orderUnit: null, unitsPerPack: null }, 8, 0)).toEqual({
      effectiveStock: 8, status: 'partially_configured', reorderNeeded: true, conversionStatus: 'base_unit', suggestedQuantity: null, suggestedBaseQuantity: null,
    })
  })
  it('nothing configured: unavailable, unknown reorder, no quantity', () => {
    expect(suggestOrder({ minimumStock: null, targetStock: null, safetyStock: null, minimumOrderQuantity: null, orderMultiple: null, orderUnit: null, unitsPerPack: null }, 0, 0)).toEqual({
      effectiveStock: 0, status: 'unavailable', reorderNeeded: null, conversionStatus: 'base_unit', suggestedQuantity: null, suggestedBaseQuantity: null,
    })
  })
  it('minimum order quantity raises a small need; no multiple means exact need', () => {
    expect(suggestOrder({ minimumStock: null, targetStock: 10, safetyStock: null, minimumOrderQuantity: 8, orderMultiple: null, orderUnit: null, unitsPerPack: null }, 8, 0).suggestedQuantity).toBe(8)
    expect(suggestOrder({ minimumStock: 1, targetStock: 4, safetyStock: null, minimumOrderQuantity: null, orderMultiple: null, orderUnit: null, unitsPerPack: null }, 0, 0).suggestedQuantity).toBe(4)
  })
})

describe('unit contract: base stock vs order unit (same fixtures as supabase/tests/procurement.test.sql)', () => {
  const pack = { minimumStock: 12, targetStock: 48, safetyStock: null, minimumOrderQuantity: 0.1, orderMultiple: null, orderUnit: 'koli', unitsPerPack: 12 }
  it('2 koli x 12 = 24 base units; 1 koli = 12', () => {
    expect(toBaseQuantity(2, 12)).toBe(24)
    expect(toBaseQuantity(1, 12)).toBe(12)
    expect(toBaseQuantity(5, null)).toBe(5)
  })
  it('stock is base units: need 48 - 6 = 42 pieces = 3.5 koli, rounded UP to 4 koli (= 48 pieces)', () => {
    expect(suggestOrder(pack, 6, 0)).toMatchObject({ conversionStatus: 'pack', suggestedQuantity: 4, suggestedBaseQuantity: 48 })
  })
  it('pending inbound arrives already converted to base units (24 pieces for 2 koli), never added as 2', () => {
    expect(suggestOrder(pack, 6, 24)).toMatchObject({ effectiveStock: 30, suggestedQuantity: 2, suggestedBaseQuantity: 24 })
  })
  it('minimum order quantity and multiple are ORDER-unit rules: need 18 pieces = 1.5 koli, minimum 3 koli, multiple 4 koli = 4 koli = 48 pieces', () => {
    expect(suggestOrder({ ...pack, minimumOrderQuantity: 3, orderMultiple: 4 }, 30, 0)).toMatchObject({ suggestedQuantity: 4, suggestedBaseQuantity: 48 })
  })
  it('a half-configured conversion yields no suggestion instead of a guess', () => {
    expect(conversionOf('koli', null)).toEqual({ status: 'missing', factor: 1 })
    expect(conversionOf(null, 12)).toEqual({ status: 'missing', factor: 1 })
    expect(suggestOrder({ ...pack, unitsPerPack: null }, 6, 0)).toMatchObject({ conversionStatus: 'missing', suggestedQuantity: null, suggestedBaseQuantity: null })
  })
  it('changing the pack size later only affects NEW suggestions (snapshots live on the lines)', () => {
    expect(suggestOrder({ ...pack, unitsPerPack: 10 }, 18, 0)).toMatchObject({ suggestedQuantity: 3, suggestedBaseQuantity: 30 })
  })
})
