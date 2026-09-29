/**
 * Every dashboard metric is one of four states — never a bare number that
 * silently means "0" when it actually means "we don't know":
 *
 *   available      — a real, fully-covered value
 *   partial        — a real but incompletely-covered value (e.g. gross
 *                    profit with some uncosted quantity); must be labelled
 *                    "Kısmi" and never presented as the complete picture
 *   unavailable    — the metric cannot be calculated right now (missing
 *                    data, no reliable mapping) — "Veri yok" / "Henüz
 *                    hesaplanamıyor", never a fabricated 0
 *   not_applicable — the metric does not apply here (e.g. inventory KPIs
 *                    for a branch with no inventory tracking configured)
 *
 * Components branch on `.status` and render the matching Turkish copy; they
 * never invent their own null-handling.
 */
export type MetricState<T> =
  | { status: 'available'; value: T }
  | { status: 'partial'; value: T; note?: string }
  | { status: 'unavailable'; reason?: string }
  | { status: 'not_applicable'; reason?: string }

export const available = <T>(value: T): MetricState<T> => ({ status: 'available', value })
export const partial = <T>(value: T, note?: string): MetricState<T> => ({
  status: 'partial',
  value,
  note,
})
export const unavailable = <T>(reason?: string): MetricState<T> => ({
  status: 'unavailable',
  reason,
})
export const notApplicable = <T>(reason?: string): MetricState<T> => ({
  status: 'not_applicable',
  reason,
})

/** Reads the value out of an available/partial state, or `null` otherwise — for internal aggregation only, never for direct rendering. */
export function metricValue<T>(state: MetricState<T>): T | null {
  return state.status === 'available' || state.status === 'partial' ? state.value : null
}
