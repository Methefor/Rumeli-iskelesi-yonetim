export type BadgeKind = 'automatic' | 'manual' | 'achievement'

export interface AutomaticBadgeCriteria {
  /** Minimum ScoreResult.percentage required (0-100). */
  minPercentage: number
  /** Minimum number of scored events required, so a single lucky entry can't earn it. */
  minEventCount: number
}

export interface BadgeDefinition {
  id: string
  key: string
  name: string
  description: string
  kind: BadgeKind
  /** Required and only meaningful when kind === 'automatic'. Thresholds live here, never in UI code. */
  criteria?: AutomaticBadgeCriteria
}

export interface EmployeeBadge {
  id: string
  employeeId: string
  badgeId: string
  awardedAt: string
  awardedByEmployeeId: string | null
  note: string | null
}
