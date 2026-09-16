import { describe, expect, it } from 'vitest'
import { calculateScore } from './calculateScore'
import type { PerformanceEvent, ScoringRule } from './types'

const rules: ScoringRule[] = [
  { dimension: 'on_time_reporting', pointsIfMet: 50, pointsIfMissed: 0 },
  { dimension: 'closing_completeness', pointsIfMet: 50, pointsIfMissed: 0 },
]

function event(overrides: Partial<PerformanceEvent>): PerformanceEvent {
  return {
    id: crypto.randomUUID(),
    employeeId: 'emp-1',
    branchId: 'branch-1',
    dimension: 'on_time_reporting',
    businessDate: '2027-06-01',
    outcome: 'met',
    ...overrides,
  }
}

describe('calculateScore', () => {
  it('sums earned points across configured dimensions', () => {
    const events = [
      event({ dimension: 'on_time_reporting', outcome: 'met' }),
      event({ dimension: 'closing_completeness', outcome: 'met' }),
    ]
    const result = calculateScore('emp-1', events, rules)
    expect(result.earnedPoints).toBe(100)
    expect(result.maxPoints).toBe(100)
    expect(result.percentage).toBe(100)
  })

  it('awards 0 for a missed outcome', () => {
    const events = [event({ dimension: 'on_time_reporting', outcome: 'missed' })]
    const result = calculateScore('emp-1', events, rules)
    expect(result.earnedPoints).toBe(0)
    expect(result.percentage).toBe(0)
  })

  it('ignores events for other employees', () => {
    const events = [event({ employeeId: 'someone-else', outcome: 'met' })]
    const result = calculateScore('emp-1', events, rules)
    expect(result.maxPoints).toBe(0)
    expect(result.percentage).toBeNull()
  })

  it('ignores events for a dimension with no configured rule', () => {
    const events = [event({ dimension: 'unconfigured_dimension' })]
    const result = calculateScore('emp-1', events, rules)
    expect(result.byDimension).toHaveLength(0)
    expect(result.percentage).toBeNull()
  })

  it('returns null percentage when there is no scoreable data', () => {
    const result = calculateScore('emp-1', [], rules)
    expect(result.percentage).toBeNull()
  })
})
