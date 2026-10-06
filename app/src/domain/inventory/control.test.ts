import { describe, expect, it } from 'vitest'
import {
  canManageBranchLocation,
  canManageWasteReasons,
  canReviewControl,
  classifyCountLine,
  costMetric,
  periodRange,
  validateCoordinates,
} from './control'

// The numbers below are the SAME fixtures as supabase/tests/inventory_control.test.sql (I1..I6).
describe('costMetric (mirror of inventory_cost_metric)', () => {
  it('fully costed is available with the exact value', () => {
    expect(costMetric(7, 7, 21, true)).toEqual({ state: 'available', value: 21, knownCostKurus: 2100, costedQuantity: 7, totalQuantity: 7 })
  })
  it('nothing wasted is a real zero', () => {
    expect(costMetric(0, 0, 0, true)).toEqual({ state: 'available', value: 0, knownCostKurus: 0, costedQuantity: 0, totalQuantity: 0 })
  })
  it('nothing costed is unavailable, never 0', () => {
    expect(costMetric(7, 0, 0, true)).toEqual({ state: 'unavailable', reason: 'missing_cost', knownCostKurus: null, costedQuantity: 0, totalQuantity: 7 })
  })
  it('partly costed is partial and names the missing cost (2*5 + 4*3 = 22 of 7 units)', () => {
    expect(costMetric(7, 6, 22, true)).toEqual({ state: 'partial', value: 22, reason: 'missing_cost', knownCostKurus: 2200, costedQuantity: 6, totalQuantity: 7 })
  })
  it('without cost permission the value is withheld', () => {
    expect(costMetric(7, 7, 21, false)).toEqual({ state: 'unavailable', reason: 'no_permission' })
  })
})

describe('classifyCountLine (waste timing is never confirmed)', () => {
  it('balanced: exact match, no explanation needed', () => {
    expect(classifyCountLine(10, 10, 0)).toMatchObject({ classification: 'balanced', explanation: 'not_applicable' })
  })
  it('waste recorded after the count is only a candidate: timing_uncertain, nothing confirmed (I2: -2, candidate 2)', () => {
    expect(classifyCountLine(10, 8, 2)).toEqual({
      classification: 'shortage',
      explanation: 'timing_uncertain',
      candidateWasteQuantity: 2,
      potentialExplainedQuantity: 2,
      confirmedExplainedQuantity: 0,
      unexplainedQuantity: 2,
    })
  })
  it('a candidate larger than the shortage is capped and still not confirmed', () => {
    expect(classifyCountLine(10, 8, 5)).toMatchObject({ explanation: 'timing_uncertain', potentialExplainedQuantity: 2, confirmedExplainedQuantity: 0, unexplainedQuantity: 2 })
  })
  it('only the corresponding quantity is a candidate (I3: -3, candidate 1)', () => {
    expect(classifyCountLine(10, 7, 1)).toMatchObject({ explanation: 'timing_uncertain', potentialExplainedQuantity: 1, unexplainedQuantity: 3 })
  })
  it('unexplained when no waste was recorded after the count (I4: waste before the count is already in expected)', () => {
    expect(classifyCountLine(10, 6, 0)).toMatchObject({ explanation: 'unexplained', potentialExplainedQuantity: 0, unexplainedQuantity: 4 })
  })
  it('surplus is never explained by waste', () => {
    expect(classifyCountLine(5, 7, 3)).toMatchObject({ classification: 'surplus', explanation: 'not_applicable', unexplainedQuantity: 0 })
  })
  it('does not drift on decimals', () => {
    expect(classifyCountLine(0.3, 0.1, 0.2)).toMatchObject({ classification: 'shortage', explanation: 'timing_uncertain', unexplainedQuantity: 0.2 })
  })
})

describe('validateCoordinates', () => {
  it('accepts both null and valid pairs', () => {
    expect(validateCoordinates(null, null)).toBeNull()
    expect(validateCoordinates(41.0123, 28.9786)).toBeNull()
    expect(validateCoordinates(-90, 180)).toBeNull()
  })
  it('rejects half a coordinate and out-of-range values', () => {
    expect(validateCoordinates(10, null)).not.toBeNull()
    expect(validateCoordinates(null, 10)).not.toBeNull()
    expect(validateCoordinates(91, 10)).not.toBeNull()
    expect(validateCoordinates(10, -181)).not.toBeNull()
    expect(validateCoordinates(Number.NaN, 10)).not.toBeNull()
  })
})

describe('UI-visibility role helpers (the server re-checks)', () => {
  it('waste reasons: owner and manager manage; nobody else', () => {
    expect(canManageWasteReasons(['owner'])).toBe(true)
    expect(canManageWasteReasons(['manager'])).toBe(true)
    expect(canManageWasteReasons(['branch_manager'])).toBe(false)
    expect(canManageWasteReasons(['cashier'])).toBe(false)
  })
  it('reports: owner, manager, branch_manager; not cashier/employee/viewer', () => {
    expect(canReviewControl(['branch_manager'])).toBe(true)
    for (const role of ['cashier', 'employee', 'viewer']) expect(canReviewControl([role])).toBe(false)
  })
  it('branch location: owner and manager only', () => {
    expect(canManageBranchLocation(['manager'])).toBe(true)
    expect(canManageBranchLocation(['branch_manager'])).toBe(false)
  })
})

describe('periodRange', () => {
  it('today, week (7 days incl. today) and month-to-date', () => {
    expect(periodRange('today', '2026-10-07')).toEqual({ from: '2026-10-07', to: '2026-10-07' })
    expect(periodRange('week', '2026-10-07')).toEqual({ from: '2026-10-01', to: '2026-10-07' })
    expect(periodRange('week', '2026-10-03')).toEqual({ from: '2026-09-27', to: '2026-10-03' })
    expect(periodRange('month', '2026-10-07')).toEqual({ from: '2026-10-01', to: '2026-10-07' })
  })
})
