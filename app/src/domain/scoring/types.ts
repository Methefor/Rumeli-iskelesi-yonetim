/**
 * Performance dimensions are data, not an enum baked into this module —
 * "data discipline", "on-time reporting", "closing completeness", "task
 * completion", "attendance", "stock accuracy" etc. are all just strings
 * configured via ScoringRule. Revenue is deliberately not a dimension here;
 * see DECISIONS.md.
 */
export type PerformanceDimension = string

/** A single raw, immutable fact: did this dimension get met for this actor on this date. */
export interface PerformanceEvent {
  id: string
  employeeId: string
  branchId: string
  dimension: PerformanceDimension
  businessDate: string
  outcome: 'met' | 'missed'
}

export interface ScoringRule {
  dimension: PerformanceDimension
  pointsIfMet: number
  pointsIfMissed: number
}

export interface DimensionScore {
  dimension: PerformanceDimension
  eventCount: number
  earnedPoints: number
  maxPoints: number
}

export interface ScoreResult {
  employeeId: string
  earnedPoints: number
  maxPoints: number
  /** 0-100, or null when there is no scoreable data for the period. */
  percentage: number | null
  byDimension: DimensionScore[]
}
