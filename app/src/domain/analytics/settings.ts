/**
 * The ONE place analytics thresholds live in the app. They are TECHNICAL
 * DEFAULTS (guards against misleading statistics), not business decisions, and
 * are pending owner review. They mirror `analytics_params()` /
 * `analytics_settings` in supabase/migrations/20261006000100_analytics_engine_v1.sql,
 * which is authoritative: a snapshot read from the database carries the params it
 * was generated with. There are no branch-specific values.
 */
export interface AnalyticsSettings {
  timezone: 'Europe/Istanbul'
  /** Same-weekday weeks looked back for the baseline (structural, not configurable). */
  baselineWeeks: number
  /** Minimum finalized same-weekday days for a baseline comparison. */
  minBaselineSamples: number
  /** Minimum days (with data and context) before any weather correlation is reported. */
  minCorrelationSamples: number
  /** Minimum days per group (rainy / dry) before the rain comparison is reported. */
  minGroupSamples: number
  /** Below this baseline revenue (TL) a percentage change is not reported. */
  lowVolumeBaseRevenue: number
  /** Below this baseline transaction count a percentage change is not reported. */
  lowVolumeBaseTransactions: number
  /** Precipitation (mm) from which a day counts as rainy. */
  rainMmThreshold: number
  /** Lookback window (days) of the weather relationship. */
  weatherWindowDays: number
  status: 'defaults_pending_owner_review' | 'owner_configured'
}

export const DEFAULT_ANALYTICS_SETTINGS: Readonly<AnalyticsSettings> = Object.freeze({
  timezone: 'Europe/Istanbul',
  baselineWeeks: 4,
  minBaselineSamples: 2,
  minCorrelationSamples: 14,
  minGroupSamples: 3,
  lowVolumeBaseRevenue: 500,
  lowVolumeBaseTransactions: 10,
  rainMmThreshold: 1.0,
  weatherWindowDays: 84,
  status: 'defaults_pending_owner_review',
})

/** Defaults overridden by the supplied (database-held) values; unknown keys are ignored. */
export function resolveAnalyticsSettings(override: Partial<AnalyticsSettings> = {}): AnalyticsSettings {
  const out: AnalyticsSettings = { ...DEFAULT_ANALYTICS_SETTINGS }
  for (const key of Object.keys(DEFAULT_ANALYTICS_SETTINGS) as Array<keyof AnalyticsSettings>) {
    const v = override[key]
    if (v !== undefined) (out as unknown as Record<string, unknown>)[key] = v
  }
  return out
}
