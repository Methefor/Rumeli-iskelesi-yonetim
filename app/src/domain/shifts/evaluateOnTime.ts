import type { ShiftTimingRule } from './types'

// Compare business wall-clock values in Europe/Istanbul. UTC methods below
// are only calendar arithmetic; neither value depends on the device timezone.
const businessClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function businessTimestamp(date: Date): number {
  const parts = businessClock.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value)
  return Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
    date.getUTCMilliseconds(),
  )
}

function resolveCutoffInstant(businessDate: string, rule: ShiftTimingRule): Date {
  const cutoff = new Date(`${businessDate}T00:00:00Z`)
  cutoff.setUTCDate(cutoff.getUTCDate() + rule.cutoffDayOffset)
  cutoff.setUTCHours(rule.cutoffHour, rule.cutoffMinute, 0, 0)
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
  return businessTimestamp(submittedAt) <= cutoffInstant.getTime()
}
