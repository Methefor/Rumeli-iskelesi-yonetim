import { describe, expect, it } from 'vitest'
import {
  calculateDailyRevenue,
  calculateEveningIncrement,
  sumCategoryAmounts,
} from './calculateShiftRevenue'

describe('sumCategoryAmounts', () => {
  it('sums all category values', () => {
    expect(sumCategoryAmounts({ gida: 100, kahve: 50.5 })).toBe(150.5)
  })

  it('treats missing/invalid values as 0', () => {
    expect(sumCategoryAmounts({ gida: Number.NaN, kahve: 20 })).toBe(20)
  })

  it('returns 0 for an empty map', () => {
    expect(sumCategoryAmounts({})).toBe(0)
  })
})

describe('calculateEveningIncrement (Z - X)', () => {
  it('never double-counts X inside Z', () => {
    expect(calculateEveningIncrement(1000, 2500)).toBe(1500)
  })

  it('floors at 0 when Z regresses below X', () => {
    expect(calculateEveningIncrement(1000, 800)).toBe(0)
  })

  it('returns 0 when X and Z are equal', () => {
    expect(calculateEveningIncrement(500, 500)).toBe(0)
  })
})

describe('calculateDailyRevenue', () => {
  it('sums X and the Z increment when both readings exist', () => {
    expect(calculateDailyRevenue({ morningX: 1000, eveningZ: 2500 })).toBe(2500)
  })

  it('returns X alone when only morning exists', () => {
    expect(calculateDailyRevenue({ morningX: 1200, eveningZ: null })).toBe(1200)
  })

  it('returns Z alone when only evening exists', () => {
    expect(calculateDailyRevenue({ morningX: null, eveningZ: 900 })).toBe(900)
  })

  it('returns 0 when neither reading exists', () => {
    expect(calculateDailyRevenue({ morningX: null, eveningZ: null })).toBe(0)
  })
})
