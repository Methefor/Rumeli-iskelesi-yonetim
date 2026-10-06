import { describe, expect, it } from 'vitest'
import { sumCategoryAmounts } from './calculateShiftRevenue'

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
