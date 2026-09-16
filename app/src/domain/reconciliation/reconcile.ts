import type { ReconciliationResult, ReconciliationThresholds } from './types'

/**
 * Compares an expected total (e.g. register/Z total, or a sum of category
 * totals) against an actual reported total. Never silently accepts a
 * significant discrepancy — the caller gets a status it must act on
 * (ERROR requires a manager override with a reason before it can be
 * cleared; see ReconciliationOverride).
 */
export function reconcile(
  expected: number,
  actual: number,
  thresholds: ReconciliationThresholds,
): ReconciliationResult {
  const difference = actual - expected
  const differencePercentage = expected !== 0 ? (difference / expected) * 100 : null

  const absPercentage = differencePercentage === null ? 0 : Math.abs(differencePercentage)

  let status: ReconciliationResult['status'] = 'OK'
  if (differencePercentage === null && difference !== 0) {
    // Expected 0 but something was actually reported — always flag, can't compute a %.
    status = 'ERROR'
  } else if (absPercentage >= thresholds.errorPercentage) {
    status = 'ERROR'
  } else if (absPercentage >= thresholds.warningPercentage) {
    status = 'WARNING'
  }

  return { expected, actual, difference, differencePercentage, status }
}
