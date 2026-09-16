import { describe, expect, it } from 'vitest'
import { reconcile } from './reconcile'
import type { ReconciliationThresholds } from './types'

const thresholds: ReconciliationThresholds = { warningPercentage: 2, errorPercentage: 5 }

describe('reconcile', () => {
  it('is OK when actual matches expected exactly', () => {
    const result = reconcile(1000, 1000, thresholds)
    expect(result.status).toBe('OK')
    expect(result.difference).toBe(0)
  })

  it('is OK for a difference under the warning threshold', () => {
    const result = reconcile(1000, 1010, thresholds) // 1%
    expect(result.status).toBe('OK')
  })

  it('is WARNING at/above the warning threshold and below error', () => {
    const result = reconcile(1000, 1030, thresholds) // 3%
    expect(result.status).toBe('WARNING')
  })

  it('is ERROR at/above the error threshold', () => {
    const result = reconcile(1000, 1060, thresholds) // 6%
    expect(result.status).toBe('ERROR')
  })

  it('treats a negative discrepancy the same as a positive one', () => {
    const result = reconcile(1000, 940, thresholds) // -6%
    expect(result.status).toBe('ERROR')
    expect(result.difference).toBe(-60)
  })

  it('flags any nonzero actual when expected is 0, without a percentage', () => {
    const result = reconcile(0, 50, thresholds)
    expect(result.status).toBe('ERROR')
    expect(result.differencePercentage).toBeNull()
  })

  it('is OK when both expected and actual are 0', () => {
    const result = reconcile(0, 0, thresholds)
    expect(result.status).toBe('OK')
  })
})
