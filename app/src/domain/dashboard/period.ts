import { addDaysIso, istanbulDate, istanbulDayBounds } from '../../utils/dates'

export type DashboardPeriodKind = 'today' | '7d' | '30d' | 'custom'

export interface DashboardPeriod {
  kind: DashboardPeriodKind
  label: string
  /** Inclusive Istanbul calendar dates (yyyy-mm-dd). */
  fromDate: string
  toDateInclusive: string
  /** [fromInstant, toInstantExclusive) — the UTC instant range every metric query uses. */
  fromInstant: string
  toInstantExclusive: string
  /** Number of Istanbul calendar days covered (inclusive). */
  days: number
}

const LABEL: Record<Exclude<DashboardPeriodKind, 'custom'>, string> = {
  today: 'Bugün',
  '7d': 'Son 7 gün',
  '30d': 'Son 30 gün',
}

function daysBetweenInclusive(fromDate: string, toDateInclusive: string): number {
  const ms = istanbulDayBounds(toDateInclusive).start.getTime() - istanbulDayBounds(fromDate).start.getTime()
  return Math.round(ms / 86_400_000) + 1
}

function buildPeriod(
  kind: DashboardPeriodKind,
  label: string,
  fromDate: string,
  toDateInclusive: string,
): DashboardPeriod {
  return {
    kind,
    label,
    fromDate,
    toDateInclusive,
    fromInstant: istanbulDayBounds(fromDate).start.toISOString(),
    toInstantExclusive: istanbulDayBounds(toDateInclusive).endExclusive.toISOString(),
    days: daysBetweenInclusive(fromDate, toDateInclusive),
  }
}

/**
 * The ONE place a dashboard period is resolved. Every widget must be given
 * (or derive from) the same `DashboardPeriod` object — never call `new
 * Date()` / compute its own day boundary independently, or two cards can
 * silently disagree on "today". Boundaries are always Istanbul calendar
 * days, regardless of the caller's device/session timezone (see
 * `istanbulDate` / `istanbulDayBounds`).
 */
export function resolveDashboardPeriod(
  kind: Exclude<DashboardPeriodKind, 'custom'>,
  now: Date = new Date(),
): DashboardPeriod {
  const today = istanbulDate(now)
  const spanDays = kind === 'today' ? 1 : kind === '7d' ? 7 : 30
  const fromDate = addDaysIso(today, -(spanDays - 1))
  return buildPeriod(kind, LABEL[kind], fromDate, today)
}

/** Validates an owner-chosen custom range before it becomes a period; never silently clamps. */
export function validateCustomRange(
  fromDate: string,
  toDateInclusive: string,
  now: Date = new Date(),
): string | null {
  const today = istanbulDate(now)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDateInclusive)) {
    return 'Geçersiz tarih.'
  }
  if (fromDate > toDateInclusive) return 'Başlangıç tarihi bitiş tarihinden sonra olamaz.'
  if (toDateInclusive > today) return 'Gelecek bir tarih seçilemez.'
  return null
}

export function resolveCustomPeriod(fromDate: string, toDateInclusive: string): DashboardPeriod {
  return buildPeriod('custom', 'Özel aralık', fromDate, toDateInclusive)
}
