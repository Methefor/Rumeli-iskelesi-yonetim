import type { ShiftTimingRule } from './types'

/**
 * Resolves a shift's cutoff to a concrete instant for a given business
 * date, so "past midnight" cutoffs (e.g. an evening shift closing at
 * 01:00 the next day) are unambiguous — unlike comparing bare "HH:mm"
 * clock strings, which can't tell 00:45 tonight from 00:45 two days ago.
 */
function resolveCutoffInstant(businessDate: string, rule: ShiftTimingRule): Date {
  const cutoff = new Date(`${businessDate}T00:00:00`)
  cutoff.setDate(cutoff.getDate() + rule.cutoffDayOffset)
  cutoff.setHours(rule.cutoffHour, rule.cutoffMinute, 0, 0)
  return cutoff
}

export interface EvaluateOnTimeInput {
  rule: ShiftTimingRule
  /** The business date the report is FOR, "YYYY-MM-DD" (not necessarily today). */
  businessDate: string
  submittedAt: Date
  /** True when businessDate is not the current calendar day. */
  isBackdated: boolean
}

/**
 * Config-driven replacement for the hardcoded hour/minute checks that used
 * to live inline in the legacy insertShiftEntry. Shift cutoff times come
 * from data (ShiftTimingRule), never from an if/else in this function.
 *
 * A backdated entry (submitted for a business date other than today) is
 * never considered on-time — matches legacy behavior where isOnTime was
 * only evaluated `if (data.selectedDate === todayStr)`.
 */
export function evaluateOnTime({
  rule,
  businessDate,
  submittedAt,
  isBackdated,
}: EvaluateOnTimeInput): boolean {
  if (isBackdated) return false

  const cutoffInstant = resolveCutoffInstant(businessDate, rule)
  return submittedAt.getTime() <= cutoffInstant.getTime()
}
