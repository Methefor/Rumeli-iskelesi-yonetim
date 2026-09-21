import { describe, expect, it } from 'vitest'
import { buildCostHistory, effectiveCostAt, validateNewCost } from './cost'
import type { CostRecord } from './types'

const costs: CostRecord[] = [
  { unitCost: 10, effectiveFrom: '2027-05-01T00:00:00Z' },
  { unitCost: 12, effectiveFrom: '2027-06-01T00:00:00Z' },
  { unitCost: 15, effectiveFrom: '2027-07-01T00:00:00Z' },
]

describe('effectiveCostAt', () => {
  it('picks the latest cost whose effectiveFrom is not after the moment', () => {
    expect(effectiveCostAt(costs, '2027-05-15T00:00:00Z')).toBe(10)
    expect(effectiveCostAt(costs, '2027-06-20T00:00:00Z')).toBe(12)
    expect(effectiveCostAt(costs, '2027-08-01T00:00:00Z')).toBe(15)
  })

  it('is inclusive of the exact effectiveFrom instant', () => {
    expect(effectiveCostAt(costs, '2027-06-01T00:00:00Z')).toBe(12)
  })

  it('returns null (unknown), never zero, before any cost exists', () => {
    expect(effectiveCostAt(costs, '2027-04-30T23:59:59Z')).toBeNull()
    expect(effectiveCostAt([], '2027-06-01T00:00:00Z')).toBeNull()
  })

  it('is independent of the order costs are supplied in', () => {
    expect(effectiveCostAt([...costs].reverse(), '2027-06-20T00:00:00Z')).toBe(12)
  })
})

describe('historical cost snapshots stay stable', () => {
  it('appending a later cost never changes the cost that applied at an earlier moment', () => {
    const saleAt = '2027-06-10T12:00:00Z'
    const before = effectiveCostAt(costs, saleAt)

    const withNewCost = [
      ...costs,
      { unitCost: 99, effectiveFrom: '2027-09-01T00:00:00Z' },
    ]

    expect(before).toBe(12)
    expect(effectiveCostAt(withNewCost, saleAt)).toBe(before)
  })
})

describe('validateNewCost', () => {
  const now = new Date('2027-07-10T00:00:00Z')

  it('accepts a cost effective after the latest existing one', () => {
    expect(
      validateNewCost(
        costs,
        { unitCost: 16.5, effectiveFrom: '2027-07-10T00:00:00Z' },
        now,
      ),
    ).toEqual({ ok: true })
  })

  it('accepts the first ever cost, even back-dated', () => {
    expect(
      validateNewCost([], { unitCost: 5, effectiveFrom: '2027-01-01T00:00:00Z' }, now),
    ).toEqual({ ok: true })
  })

  it('rejects rewriting history: not later than the latest cost', () => {
    expect(
      validateNewCost(costs, { unitCost: 9, effectiveFrom: '2027-06-15T00:00:00Z' }, now),
    ).toEqual({ ok: false, reason: 'not_later' })
    expect(
      validateNewCost(costs, { unitCost: 9, effectiveFrom: '2027-07-01T00:00:00Z' }, now),
    ).toEqual({ ok: false, reason: 'not_later' })
  })

  it('rejects negative, over-precise and non-finite costs', () => {
    expect(
      validateNewCost(
        costs,
        { unitCost: -1, effectiveFrom: '2027-07-10T00:00:00Z' },
        now,
      ),
    ).toEqual({ ok: false, reason: 'negative' })
    expect(
      validateNewCost(
        costs,
        { unitCost: 1.23456, effectiveFrom: '2027-07-10T00:00:00Z' },
        now,
      ),
    ).toEqual({ ok: false, reason: 'precision' })
    expect(
      validateNewCost(
        costs,
        { unitCost: Number.NaN, effectiveFrom: '2027-07-10T00:00:00Z' },
        now,
      ),
    ).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects a far-future date that would block later changes', () => {
    expect(
      validateNewCost(
        costs,
        { unitCost: 20, effectiveFrom: '2027-12-01T00:00:00Z' },
        now,
      ),
    ).toEqual({ ok: false, reason: 'too_far' })
  })
})

describe('buildCostHistory', () => {
  it('lists newest first and marks the current and scheduled rows', () => {
    const history = buildCostHistory(
      [...costs, { unitCost: 18, effectiveFrom: '2027-08-01T00:00:00Z' }],
      new Date('2027-06-20T00:00:00Z'),
    )
    expect(history.map((h) => h.unitCost)).toEqual([18, 15, 12, 10])
    expect(history.find((h) => h.isCurrent)?.unitCost).toBe(12)
    expect(history.filter((h) => h.isScheduled).map((h) => h.unitCost)).toEqual([18, 15])
  })

  it('does not mutate the supplied records', () => {
    const copy = JSON.stringify(costs)
    buildCostHistory(costs, new Date('2027-06-20T00:00:00Z'))
    expect(JSON.stringify(costs)).toBe(copy)
  })
})
