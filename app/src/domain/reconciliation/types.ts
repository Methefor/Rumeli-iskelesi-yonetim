export type ReconciliationStatus = 'OK' | 'WARNING' | 'ERROR'

export interface ReconciliationThresholds {
  /** Absolute difference-percentage at/above which status becomes WARNING. */
  warningPercentage: number
  /** Absolute difference-percentage at/above which status becomes ERROR. */
  errorPercentage: number
}

export interface ReconciliationResult {
  expected: number
  actual: number
  difference: number
  /** Signed; positive = actual exceeded expected. Null when expected is 0 (percentage undefined). */
  differencePercentage: number | null
  status: ReconciliationStatus
}

export interface ReconciliationOverride {
  reason: string
  overriddenByEmployeeId: string
  overriddenAt: string
}
