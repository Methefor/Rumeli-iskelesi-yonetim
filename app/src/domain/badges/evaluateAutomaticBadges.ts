import type { ScoreResult } from '../scoring/types'
import type { BadgeDefinition } from './types'

/**
 * Pure evaluation of which automatic badges a score qualifies for.
 * Thresholds come entirely from BadgeDefinition.criteria — never hardcode
 * a percentage or count here.
 */
export function evaluateAutomaticBadges(
  score: ScoreResult,
  definitions: BadgeDefinition[],
): BadgeDefinition[] {
  if (score.percentage === null) return []

  return definitions.filter((def) => {
    if (def.kind !== 'automatic' || !def.criteria) return false
    return (
      score.percentage !== null &&
      score.percentage >= def.criteria.minPercentage &&
      score.byDimension.reduce((sum, d) => sum + d.eventCount, 0) >=
        def.criteria.minEventCount
    )
  })
}
