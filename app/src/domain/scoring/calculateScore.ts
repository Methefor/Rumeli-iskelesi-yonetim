import type { DimensionScore, PerformanceEvent, ScoreResult, ScoringRule } from './types'

/**
 * Recalculates an employee's score for a set of already-recorded
 * PerformanceEvents against a set of ScoringRules.
 *
 * Scores are always *recalculable* from stored events + current rules —
 * this function never mutates or reads stored score rows, so changing a
 * rule and re-running this over history is safe and expected.
 */
export function calculateScore(
  employeeId: string,
  events: PerformanceEvent[],
  rules: ScoringRule[],
): ScoreResult {
  const ruleByDimension = new Map(rules.map((r) => [r.dimension, r]))
  const dimensionTotals = new Map<string, DimensionScore>()

  const ownEvents = events.filter((e) => e.employeeId === employeeId)

  for (const event of ownEvents) {
    const rule = ruleByDimension.get(event.dimension)
    if (!rule) continue // unconfigured dimensions don't silently score

    const existing = dimensionTotals.get(event.dimension) ?? {
      dimension: event.dimension,
      eventCount: 0,
      earnedPoints: 0,
      maxPoints: 0,
    }

    existing.eventCount += 1
    existing.maxPoints += Math.max(rule.pointsIfMet, rule.pointsIfMissed, 0)
    existing.earnedPoints +=
      event.outcome === 'met' ? rule.pointsIfMet : rule.pointsIfMissed

    dimensionTotals.set(event.dimension, existing)
  }

  const byDimension = [...dimensionTotals.values()]
  const earnedPoints = byDimension.reduce((sum, d) => sum + d.earnedPoints, 0)
  const maxPoints = byDimension.reduce((sum, d) => sum + d.maxPoints, 0)

  return {
    employeeId,
    earnedPoints,
    maxPoints,
    percentage: maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : null,
    byDimension,
  }
}
