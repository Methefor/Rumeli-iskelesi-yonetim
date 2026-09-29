/**
 * Business dates are attributed in Istanbul time (matching the database's
 * `inventory_resolve_shift_context`), regardless of the device's timezone.
 */
const istanbulFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** yyyy-mm-dd in Istanbul time. */
export function istanbulDate(date: Date = new Date()): string {
  return istanbulFormatter.format(date)
}

/** Adds whole days to a yyyy-mm-dd string (calendar arithmetic, timezone-free). */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days))
  return date.toISOString().slice(0, 10)
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  })
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** "20 Eyl" — compact day + month for tight stat cards. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Istanbul',
  })
}

/**
 * Istanbul has been UTC+3 year-round since 2016 (no DST) — the same fact
 * `services/demo/store.ts`'s `istanbulInstant` relies on. A fixed offset
 * lets a calendar date convert to a UTC instant boundary without a timezone
 * library, and (unlike `Date.parse` of a bare date) never depends on the
 * caller's own device/session timezone.
 */
export function istanbulInstant(dateIso: string, hour = 0, minute = 0): Date {
  return new Date(`${dateIso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+03:00`)
}

/** [start, endExclusive) as UTC instants for the Istanbul calendar day `dateIso`. */
export function istanbulDayBounds(dateIso: string): { start: Date; endExclusive: Date } {
  return { start: istanbulInstant(dateIso, 0, 0), endExclusive: istanbulInstant(addDaysIso(dateIso, 1), 0, 0) }
}
