import { addDaysIso } from '../../utils/dates'

/** ISO weekday of a yyyy-mm-dd date: Monday = 1 ... Sunday = 7. Pure calendar arithmetic (no timezone). */
export function isoWeekday(dateIso: string): number {
  const [y = 1970, m = 1, d = 1] = dateIso.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}

/** Monday of the ISO week containing the business date (analytics weeks are Monday..Sunday). */
export function weekStartOf(dateIso: string): string {
  return addDaysIso(dateIso, -(isoWeekday(dateIso) - 1))
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i))
}

export function isMonday(dateIso: string): boolean {
  return isoWeekday(dateIso) === 1
}
