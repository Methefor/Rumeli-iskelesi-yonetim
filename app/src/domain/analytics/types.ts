import type { AnalyticsSettings } from './settings'

/**
 * Analytics Engine V1 types. The payload shapes are IDENTICAL to the jsonb the
 * SQL snapshot functions produce (supabase/migrations/20261006000100), so a
 * snapshot read from the database and one computed by `engine.ts` (demo mode,
 * parity tests) are the same type. Every number is calculated deterministically;
 * nothing here is produced by AI.
 */

export type AnalyticsParams = AnalyticsSettings

/** fact = directly computed; relationship = statistical association; hypothesis = AI interpretation, never computed. */
export type Confidence = 'fact' | 'relationship' | 'hypothesis'

export type MetricStateName = 'available' | 'partial' | 'unavailable' | 'unsupported'

export interface MetricValue {
  state: MetricStateName
  value?: number
  reason?: string
}

export type ComparisonState =
  | 'ok'
  | 'no_baseline'
  | 'insufficient_samples'
  | 'no_current'
  | 'zero_base'
  | 'low_base'
  | 'not_final'
  | 'baseline_not_final'
  | 'mixed_origin'

export interface Comparison {
  state: ComparisonState
  baseline?: number
  delta?: number
  /** Present only when state is `ok`: a percentage from a tiny, zero, provisional or incomparable base is never reported. */
  pct?: number
  samples?: number
  /** native and legacy-imported data were mixed (revenue only; other metrics refuse the comparison). */
  mixedOrigin?: boolean
}

export interface PeriodComparisons {
  previousDay: Comparison
  previousWeekSameWeekday: Comparison
  baseline4SameWeekday: Comparison
}

/**
 * PROVISIONAL vs FINALIZED. Project rule: morning = X, evening = Z, and Z already includes X.
 *   finalized   an active Z exists: finalized revenue = Z exactly (never normalized or increased by X)
 *   provisional only an X exists: finalized revenue is null; the X reading is exposed as provisionalRevenue
 *   no_data     no active reading
 */
export type Finalization = 'finalized' | 'provisional' | 'no_data'

/** Where the readings came from. Legacy imports only support what their source supports. */
export type AnalyticsOrigin = 'native' | 'legacy_import' | 'mixed' | 'none'

export type CompletenessStatus = 'complete' | 'partial' | 'unsupported'

/** Why a metric is incomplete or unsupported. */
export type CompletenessReason =
  | 'missing_z'
  | 'missing_transaction_count'
  | 'missing_product_detail'
  | 'missing_category_detail'
  | 'missing_cost'
  | 'missing_context'
  | 'legacy_source_limitation'
  | 'xz_line_semantics_unknown'
  | 'z_line_semantics_unverified'
  | 'line_semantics_unverified'
  | 'zero_transactions'
  | 'no_reports'
  | 'no_hourly_source'
  | 'week_in_progress'
  | 'insufficient_sample'

export interface Capability {
  status: CompletenessStatus
  reasons: string[]
}

export interface Completeness {
  overall: 'complete' | 'partial' | 'no_data'
  /** distinct reason codes across every metric */
  reasons: string[]
  metrics: Record<string, Capability>
}

export interface ExternalContext {
  state: 'present' | 'missing'
  temperatureC?: number
  apparentTemperatureC?: number
  precipitationMm?: number
  windKmh?: number
  isWeekend: boolean
  isPublicHoliday?: boolean
  holidayName?: string
  payPeriodTag?: string
  specialEvent?: string
  source?: string
}

export interface DayReports {
  active: number
  cancelled: number
  x: number
  z: number
  reconciliation: { OK: number; WARNING: number; ERROR: number }
}

export interface DayReadings {
  x: { present: boolean; revenue: number | null; transactions: number | null }
  z: { present: boolean; revenue: number | null; transactions: number | null }
}

export type DayWarning =
  | { code: 'multiple_active_readings'; type: 'X' | 'Z'; count: number }
  | { code: 'z_below_x' }

export interface CategoryVolume {
  categoryId: string
  key: string
  name: string
  quantity: number | null
  quantityMissing: boolean
}
export interface ProductVolume {
  inventoryItemId: string
  code: string
  name: string
  unit: string
  quantity: number | null
}
export interface CategoryFinancial {
  categoryId: string
  key: string
  name: string
  revenue: number
  share: number | null
}
export interface ProductFinancial {
  inventoryItemId: string
  code: string
  name: string
  unit: string
  quantity: number | null
  revenue: number
  averageUnitPrice: number | null
  unitCost: number | null
  costState: 'costed' | 'uncosted'
  grossProfit: number | null
}

export interface GrossProfitSummary {
  /** Gross profit is revenue minus cost of goods sold ONLY, never net profit. */
  grossOnly: true
  metric: MetricValue
  coveredRevenue: number
  uncoveredRevenue: number
}

export interface DayVolume {
  transactions: MetricValue
  itemQuantity: MetricValue
  categories: CategoryVolume[]
  products: ProductVolume[]
}
export interface DayFinancial {
  grossRevenue: MetricValue
  /** The X reading of an X-only (provisional) day, otherwise null. */
  provisionalRevenue: number | null
  averageBasket: MetricValue
  categories: CategoryFinancial[]
  products: ProductFinancial[]
  grossProfit: GrossProfitSummary
}

/** Output of the deterministic day computation (SQL `analytics_compute_day`). */
export interface DayCore {
  date: string
  hasData: boolean
  finalization: Finalization
  origin: AnalyticsOrigin
  sourceLatestAt: string | null
  reports: DayReports
  readings: DayReadings
  warnings: DayWarning[]
  volume: DayVolume
  financial: DayFinancial
  capabilities: Record<string, Capability>
}

export interface UnsupportedMetric {
  state: 'unsupported'
  reason: string
}

export interface DailyAnalyticsPayload extends Omit<DayCore, 'date' | 'capabilities'> {
  schemaVersion: 2
  scope: 'daily'
  branchId: string
  businessDate: string
  isoWeekday: number
  timezone: 'Europe/Istanbul'
  params: AnalyticsParams
  context: ExternalContext
  completeness: Completeness
  volumeComparisons: { transactions: PeriodComparisons }
  financialComparisons: { grossRevenue: PeriodComparisons; averageBasket: PeriodComparisons }
  baselineSamples: { sameWeekdayFinalizedDays: number; of: number }
  peakHour: UnsupportedMetric
  /** Present (true) when the caller lacks analytics.financial.read and financial sections were removed. */
  redacted?: boolean
}

export interface WeekDayRow {
  date: string
  hasData: boolean
  finalization: Finalization
  origin: AnalyticsOrigin
  grossRevenue: number | null
  provisionalRevenue: number | null
  transactions: number | null
  averageBasket: number | null
}

export interface WeekProductRow {
  inventoryItemId: string
  code: string
  name: string
  unit: string
  quantity: number | null
  revenue: number
  grossProfit: number | null
  costedDays: number
  days: number
}

export interface WeatherEffect {
  state: 'ok' | 'insufficient_sample' | 'no_context'
  confidence: 'relationship'
  sample: number
  required?: number
  withContext?: number
  method?: string
  temperatureCorrelation?: { r: number; n: number }
  rainEffect?:
    | {
        rainyDays: number
        dryDays: number
        rainyIndex: number
        dryIndex: number
        differencePct?: number
      }
    | { state: 'insufficient_group_sample'; rainyDays: number; dryDays: number; required: number }
  caveat?: string
}

export interface WeeklyAnalyticsPayload {
  schemaVersion: 2
  scope: 'weekly'
  branchId: string
  weekStart: string
  weekEnd: string
  /** The week has ended. */
  weekComplete: boolean
  /** finalized only when the week ended and none of its days with data is provisional (X only). */
  finalization: 'finalized' | 'provisional'
  origin: AnalyticsOrigin
  timezone: 'Europe/Istanbul'
  params: AnalyticsParams
  sourceLatestAt: string | null
  daysWithData: number
  finalizedDays: number
  provisionalDays: number
  volume: {
    transactions: MetricValue
    itemQuantity: MetricValue
  }
  financial: {
    grossRevenue: MetricValue
    provisionalRevenue: number | null
    averageBasket: MetricValue
    categories: CategoryFinancial[]
    products: WeekProductRow[]
    grossProfit: GrossProfitSummary
  }
  days: WeekDayRow[]
  completeness: Completeness
  previousWeek: { weekStart: string; daysWithData: number; provisionalDays: number; origin: AnalyticsOrigin }
  volumeComparisons: { transactions: Comparison }
  financialComparisons: { grossRevenue: Comparison; averageBasket: Comparison }
  weatherEffect: WeatherEffect
  peakHour: UnsupportedMetric
  redacted?: boolean
}

export type SnapshotState = 'missing' | 'current' | 'stale'

export interface SnapshotEnvelope<P> {
  state: SnapshotState
  snapshotId?: string
  version?: number
  generatedAt?: string
  generationKind?: 'scheduled' | 'manual'
  sourceLatestAt?: string | null
  weekComplete?: boolean
  payload?: P
}

export interface AnalyticsInsight {
  id: string
  scope: 'daily' | 'weekly'
  confidence: Confidence
  code: string
  title: string
  body: string | null
  evidence: Record<string, unknown>
  isFinancial: boolean
  origin: 'deterministic' | 'ai'
}
