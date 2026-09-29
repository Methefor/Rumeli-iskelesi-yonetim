import { describe, expect, it } from 'vitest'
import { fromKurus, sumKurus, toKurus } from './money'

describe('kuruş money aggregation', () => {
  it('converts TL to exact integer kuruş', () => {
    expect(toKurus(10.5)).toBe(1050)
    expect(toKurus(0.01)).toBe(1)
    expect(toKurus(0)).toBe(0)
  })

  it('summing many TL amounts as floats drifts; summing the same amounts as kuruş does not', () => {
    const tlAmounts = Array.from({ length: 1000 }, () => 0.1)
    const floatSum = tlAmounts.reduce((s, v) => s + v, 0)
    expect(floatSum).not.toBe(100) // the classic float-drift case (99.99999999999997 in IEEE754)

    const kurusSum = sumKurus(tlAmounts.map(toKurus))
    expect(kurusSum).toBe(10_000) // exact: 1000 x 10 kuruş
    expect(fromKurus(kurusSum)).toBe(100)
  })

  it('round-trips arbitrary TL amounts exactly at the kuruş precision', () => {
    for (const tl of [1234.56, 0.03, 999999.99, 7.1]) {
      expect(fromKurus(toKurus(tl))).toBeCloseTo(tl, 2)
    }
  })

  it('sumKurus of an empty list is 0, never a fabricated positive or negative drift', () => {
    expect(sumKurus([])).toBe(0)
  })
})
