import { describe, expect, it } from 'vitest'
import { evaluateAutomaticBadges } from './evaluateAutomaticBadges'
import type { BadgeDefinition } from './types'
import type { ScoreResult } from '../scoring/types'

const definitions: BadgeDefinition[] = [
  {
    id: 'badge-1',
    key: 'on_time_discipline',
    name: 'On-Time Discipline',
    description: '',
    kind: 'automatic',
    criteria: { minPercentage: 90, minEventCount: 20 },
  },
  {
    id: 'badge-2',
    key: 'manual_only',
    name: 'Manual Only',
    description: '',
    kind: 'manual',
  },
]

function score(overrides: Partial<ScoreResult>): ScoreResult {
  return {
    employeeId: 'emp-1',
    earnedPoints: 900,
    maxPoints: 1000,
    percentage: 90,
    byDimension: [
      {
        dimension: 'on_time_reporting',
        eventCount: 20,
        earnedPoints: 900,
        maxPoints: 1000,
      },
    ],
    ...overrides,
  }
}

describe('evaluateAutomaticBadges', () => {
  it('awards a badge when thresholds are met exactly', () => {
    const result = evaluateAutomaticBadges(score({}), definitions)
    expect(result.map((d) => d.key)).toEqual(['on_time_discipline'])
  })

  it('does not award when percentage is below the threshold', () => {
    const result = evaluateAutomaticBadges(score({ percentage: 89 }), definitions)
    expect(result).toHaveLength(0)
  })

  it('does not award when event count is below the threshold', () => {
    const result = evaluateAutomaticBadges(
      score({
        byDimension: [
          {
            dimension: 'on_time_reporting',
            eventCount: 5,
            earnedPoints: 450,
            maxPoints: 500,
          },
        ],
      }),
      definitions,
    )
    expect(result).toHaveLength(0)
  })

  it('never auto-awards a manual-kind badge', () => {
    const result = evaluateAutomaticBadges(score({ percentage: 100 }), definitions)
    expect(result.some((d) => d.key === 'manual_only')).toBe(false)
  })

  it('returns nothing when there is no scoreable data', () => {
    const result = evaluateAutomaticBadges(score({ percentage: null }), definitions)
    expect(result).toHaveLength(0)
  })
})
