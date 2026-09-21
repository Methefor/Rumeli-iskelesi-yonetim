import { describe, expect, it } from 'vitest'
import { calculateSellThrough } from './sellThrough'

describe('calculateSellThrough', () => {
  it('is sold / (opening + received + adjustmentIn)', () => {
    const result = calculateSellThrough({
      opening: 20,
      received: 80,
      adjustmentIn: 0,
      sold: 60,
    })
    expect(result).toEqual({ available: 100, ratio: 0.6 })
  })

  it('counts inbound adjustments as available stock', () => {
    const result = calculateSellThrough({
      opening: 0,
      received: 90,
      adjustmentIn: 10,
      sold: 50,
    })
    expect(result.available).toBe(100)
    expect(result.ratio).toBe(0.5)
  })

  it('does not hide waste: spoiled stock stays in the denominator', () => {
    // 100 available, 60 sold, 10 wasted -> 60%, not 66.7%
    const result = calculateSellThrough({
      opening: 0,
      received: 100,
      adjustmentIn: 0,
      sold: 60,
    })
    expect(result.ratio).toBe(0.6)
  })

  it('returns null (not 0% or Infinity) when nothing was available', () => {
    expect(
      calculateSellThrough({ opening: 0, received: 0, adjustmentIn: 0, sold: 0 }).ratio,
    ).toBeNull()
    expect(
      calculateSellThrough({ opening: 0, received: 0, adjustmentIn: 0, sold: 5 }).ratio,
    ).toBeNull()
  })

  it('returns null when the denominator is negative (data problem)', () => {
    expect(
      calculateSellThrough({ opening: -3, received: 1, adjustmentIn: 0, sold: 1 }).ratio,
    ).toBeNull()
  })

  it('does not clamp a ratio above 1 — it flags inconsistent data', () => {
    expect(
      calculateSellThrough({ opening: 0, received: 10, adjustmentIn: 0, sold: 12 }).ratio,
    ).toBe(1.2)
  })
})
