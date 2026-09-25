/**
 * UI-side mirror of the server-side backdated-entry policy
 * (supabase/migrations/015_sales_backdated_policy.sql). Calendar-date based
 * on the Istanbul business date (never a rolling 72 hours), so the caller
 * must pass an Istanbul yyyy-mm-dd string (see utils/dates.istanbulDate) —
 * never a raw Date, which would reintroduce a device-timezone dependency.
 *
 * This is UI guidance only: it lets a screen show the right message and
 * reason field before submitting, but the server re-validates unconditionally
 * and is the only real authorization boundary.
 */
export interface BackdatedEntryStatus {
  /** The business date is in the future — always denied, no override exists. */
  isFuture: boolean
  /** today or one of the previous 3 Istanbul calendar days — no restriction. */
  withinNormalWindow: boolean
  /**
   * Older than 3 days: only owner/manager may proceed, and only with a
   * reason. False for every non-owner/manager caller (there is no path to
   * "true" for them — they are simply denied, see `deniedForRole`).
   */
  requiresOverrideReason: boolean
  /** Non-owner/manager attempting a submission/edit outside the normal window. */
  deniedForRole: boolean
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  const from = Date.UTC(...(fromIso.split('-').map(Number) as [number, number, number]))
  const to = Date.UTC(...(toIso.split('-').map(Number) as [number, number, number]))
  return Math.round((to - from) / 86_400_000)
}

export function evaluateBackdatedEntry(
  businessDateIso: string,
  isOwnerOrManager: boolean,
  todayIso: string,
): BackdatedEntryStatus {
  const daysAgo = daysBetweenIso(businessDateIso, todayIso)
  const isFuture = daysAgo < 0
  const withinNormalWindow = !isFuture && daysAgo <= 3
  const outsideWindow = !isFuture && daysAgo > 3
  return {
    isFuture,
    withinNormalWindow,
    requiresOverrideReason: outsideWindow && isOwnerOrManager,
    deniedForRole: outsideWindow && !isOwnerOrManager,
  }
}
