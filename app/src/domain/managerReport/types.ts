import type { AnalyticsOrigin, Comparison, ComparisonState } from '../analytics'

/**
 * Manager report model (Phase 1E): Layer A = the deterministic FACT PACK (this file), Layer B = narrative policy + validator,
 * Layer C = renderers. The Fact Pack is composed ONLY from existing deterministic read models (dashboard X/Z model, attention
 * feed, analytics snapshots, inventory control, procurement, weather). Nothing in this module is a second analytics engine and
 * nothing here is produced by AI.
 */

export const FACT_PACK_SCHEMA_VERSION = 'manager_fact_pack.v1' as const
export const NARRATIVE_SCHEMA_VERSION = 'manager_narrative.v1' as const
export const FACT_PACK_GENERATOR = 'deterministic-fact-pack/1' as const

/** complete = whole, supported value; partial = a real but incomplete value (never a final statement); unsupported = no value (never 0). */
export type Support = 'complete' | 'partial' | 'unsupported'

export type FactValue = number | string | boolean

/** One metric. `value` is null IF AND ONLY IF the metric is unsupported/unavailable; a legitimate zero stays 0 with `complete`. */
export interface Fact<T extends FactValue = number> {
  support: Support
  value: T | null
  /** why it is partial/unsupported (machine codes, e.g. missing_z, missing_cost, snapshot_stale) */
  reasons: string[]
  /** evidence id of the value (null when unsupported: an unsupported metric can not be cited) */
  ref: string | null
}

export type EvidenceKind = 'fact' | 'relationship'
export type EvidenceUnit = 'TRY' | 'count' | 'pct' | 'date' | 'text' | 'celsius' | 'mm' | 'ratio'

/** What a narrative (deterministic or AI) is allowed to cite. Hypotheses are never in the registry. */
/**
 * Where the value comes from, for reproducibility:
 *   immutable  a stored, versioned analytics snapshot (can be rebuilt exactly from its pinned version)
 *   mutable    a read of ordinary tables that can still change later (reports, ledger, counts): rebuildable only approximately
 *   live       current operational state (attention feed, procurement, forecast, stock alerts): gone as soon as the state moves
 */
export type EvidenceOrigin = 'immutable' | 'mutable' | 'live'

export interface EvidenceEntry {
  kind: EvidenceKind
  origin: EvidenceOrigin
  /** relationship evidence is always an association; support says whether the underlying data is final */
  support: 'complete' | 'partial'
  value: FactValue
  unit: EvidenceUnit
  label: string
}

export type LimitationCode =
  | 'missing_z'
  | 'missing_transaction_count'
  | 'missing_product_detail'
  | 'line_semantics_unverified'
  | 'missing_cost'
  | 'missing_context'
  | 'legacy_source_limitation'
  | 'mixed_origin'
  | 'stale_weather'
  | 'incomplete_week'
  | 'snapshot_missing'
  | 'snapshot_stale'
  | 'source_unavailable'
  | 'not_current_date'
  | 'no_daily_history'
  | 'insufficient_sample'
  | 'no_finalized_data'
  | 'no_comparison_baseline'
  | 'no_permission'
  | 'live_state'
  | 'mutable_sources'

export interface Limitation {
  code: LimitationCode
  branchKey: string | null
  branchName: string | null
  /** Turkish disclosure sentence; a renderer/AI must carry it forward */
  text: string
}

export interface BranchRef {
  id: string
  key: string
  name: string
}

export interface SnapshotRef {
  kind: 'daily_analytics' | 'weekly_analytics'
  branchKey: string
  snapshotId: string
  version: number
  generatedAt: string | null
  state: 'current' | 'stale'
}

/**
 * REPORT REPRODUCIBILITY (not the same thing as completeness, metric support or evidence confidence):
 *   exact    every cited fact comes from an immutable, versioned source: the same Fact Pack can be rebuilt later
 *   partial  some facts come from tables that can still change (reports, ledger, counts); the pinned snapshots are exact, the rest is not
 *   live     the period is still open or the pack contains current operational state: it can not be rebuilt later
 * V1 persists no Fact Pack, so only `exact` could ever be rebuilt, and no V1 report with business facts reaches it unless every
 * mutable source is absent. Derived from the evidence origins, never claimed.
 */
export type ReproducibilityState = 'exact' | 'partial' | 'live'

export interface Reproducibility {
  state: ReproducibilityState
  reasons: Array<'period_open' | 'live_evidence' | 'mutable_evidence'>
  evidence: { immutable: number; mutable: number; live: number }
}

/** Runtime report metadata. NOT a persisted audit record: V1 stores no report snapshot (see MANAGER_REPORT_MODEL.md). */
export interface Provenance {
  generator: typeof FACT_PACK_GENERATOR
  factSchemaVersion: typeof FACT_PACK_SCHEMA_VERSION
  /** the existing read models the pack was composed from */
  readModels: string[]
  snapshots: SnapshotRef[]
}

/** The caller's access to each underlying domain (permission + branch scope), as evaluated by the database. analytics.read alone grants none of them. */
export interface ReportAccess {
  financial: boolean
  reports: boolean
  stock: boolean
  weather: boolean
}

export interface PackScope {
  kind: 'organization' | 'branch'
  branches: BranchRef[]
}

// ---------------------------------------------------------------------------
// Shared sections
// ---------------------------------------------------------------------------

export interface AttentionFact {
  ref: string
  severity: 'critical' | 'warning' | 'info'
  category: string
  reasonCode: string
  branchKey: string
  branchName: string
  title: string
  /** the count/amount behind the item, null when there is none */
  count: number | null
  actionRoute: string
}

export interface AttentionSection {
  state: 'available' | 'unavailable'
  /** why the section is unavailable (not_current_date / source_unavailable) */
  reason?: string
  counts: { critical: number; warning: number; info: number } | null
  items: AttentionFact[]
  /** sources the role could not see: the feed is then NOT an all-clear */
  unavailableSources: Array<{ branchName: string; source: string; reason: string }>
}

export interface WeatherDayContext {
  date: string
  state: 'present' | 'missing'
  /** historical rows: how the value came to exist; reanalysis is modelled history, never an observation */
  provenance: 'manual' | 'observed' | 'reanalysis' | 'provider_historical' | null
  temperatureC: number | null
  temperatureMinC: number | null
  temperatureMaxC: number | null
  precipitationMm: number | null
  ref: string | null
}

export interface RelationshipFact {
  /** weekly weather effect: an association between past days' weather and revenue, never a cause */
  state: 'ok' | 'insufficient_sample' | 'no_context'
  sample: number
  required: number | null
  ref: string | null
  /** present only when state is ok: the Turkish sentence the analytics engine already vetted is NOT reused; only numbers are */
  rainDifferencePct: number | null
  rainyDays: number | null
  dryDays: number | null
  temperatureCorrelation: number | null
  branchKey: string
  branchName: string
  refs: { sample: string | null; required: string | null; rainyDays: string | null; dryDays: string | null; rainDifferencePct: string | null; temperatureCorrelation: string | null }
}

export interface ProcurementFacts {
  state: 'available' | 'unavailable'
  reason?: string
  awaitingApproval: Fact
  dueToday: Fact
  overdue: Fact
  partiallyReceived: Fact
  receiptWarnings: Fact
  lowStockNoOpenOrder: Fact
}

// ---------------------------------------------------------------------------
// Daily Fact Pack
// ---------------------------------------------------------------------------

export interface DailyBranchFacts {
  branchKey: string
  branchName: string
  finalization: 'finalized' | 'provisional' | 'no_data'
  origin: AnalyticsOrigin | 'unknown'
  finalizedRevenue: Fact
  provisionalRevenue: Fact
  transactions: Fact
  averageBasket: Fact
  grossProfit: Fact
  /** deterministic comparison of the existing analytics snapshot: same weekday last week */
  vsSameWeekdayLastWeek: { state: ComparisonState; pct: number | null; delta: number | null; baseline: number | null; ref: string | null } | null
  anomalies: Array<{ code: 'z_below_x' | 'multiple_readings'; ref: string }>
  reconciliation: { ok: number; warning: number; error: number }
  reportCount: number
  shifts: { completed: number; open: number }
  /** a closing count for this business date: none / submitted / voided_only / unknown (outside the recent window) */
  closingCount: 'submitted' | 'voided_only' | 'missing' | 'unknown' | 'not_tracked'
  countOutcome: { unexplainedLines: Fact; timingUncertainLines: Fact } | null
  waste: { entries: Fact; cost: Fact } | null
  stockAlerts: Fact
}

export interface DailyOrganizationFacts {
  finalizedRevenue: Fact
  provisionalRevenue: Fact
  /** finalized branches / branches in scope */
  reportingCompleteness: { finalizedBranches: number; provisionalBranches: number; noDataBranches: number; total: number; ref: string }
  transactions: Fact
  averageBasket: Fact
  grossProfit: Fact
}

export interface DailyFactPack {
  schemaVersion: typeof FACT_PACK_SCHEMA_VERSION
  reportType: 'daily'
  businessDate: string
  generatedAt: string
  scope: PackScope
  /** the business date is the branch's today: live sources (attention, procurement, weather forecast) apply */
  isCurrentDate: boolean
  reproducibility: Reproducibility
  completeness: { overall: 'complete' | 'partial' | 'no_data'; reasons: LimitationCode[] }
  organization: DailyOrganizationFacts
  branches: DailyBranchFacts[]
  attention: AttentionSection
  operations: {
    shiftsCompleted: Fact
    shiftsOpen: Fact
    reportsSubmitted: Fact
    reconciliationOk: Fact
    reconciliationWarning: Fact
    reconciliationError: Fact
    openReconciliationBacklog: Fact
  }
  inventory: {
    stockAlertBranches: Fact
    countsMissingBranches: string[]
    unexplainedShortageBranches: string[]
    timingUncertainBranches: string[]
    wasteEntries: Fact
    wasteCost: Fact
  }
  procurement: ProcurementFacts
  weather: {
    state: 'available' | 'unavailable'
    reason?: string
    /** forecast / current context: forward-looking, labelled as a forecast and never a historical fact */
    forecast: Array<{
      branchKey: string
      branchName: string
      status: 'fresh' | 'stale' | 'unavailable'
      ageMinutes: number | null
      rainExpected: boolean
      ref: string | null
    }>
    /** the completed business date's historical context (provenance kept) when the date is over */
    historical: Array<WeatherDayContext & { branchKey: string; branchName: string }>
  }
  analytics: { insights: Array<{ branchKey: string; branchName: string; code: string; confidence: 'fact' | 'relationship'; title: string }> }
  limitations: Limitation[]
  evidence: Record<string, EvidenceEntry>
  provenance: Provenance
}

// ---------------------------------------------------------------------------
// Weekly Fact Pack
// ---------------------------------------------------------------------------

export interface WeeklyDay {
  date: string
  finalization: 'finalized' | 'provisional' | 'no_data'
  finalizedRevenue: Fact
}

export interface WeeklyBranchFacts {
  branchKey: string
  branchName: string
  weekComplete: boolean
  finalization: 'finalized' | 'provisional'
  origin: AnalyticsOrigin | 'unknown'
  finalizedRevenue: Fact
  provisionalRevenue: Fact
  transactions: Fact
  averageBasket: Fact
  grossProfit: Fact
  finalizedDays: number
  provisionalDays: number
  daysWithData: number
  days: WeeklyDay[]
  vsPreviousWeek: { state: ComparisonState; pct: number | null; delta: number | null; baseline: number | null; mixedOrigin: boolean; ref: string | null }
  transactionsVsPreviousWeek: { state: ComparisonState; pct: number | null; ref: string | null }
  basketVsPreviousWeek: { state: ComparisonState; pct: number | null; ref: string | null }
  strongestDay: DayExtreme | null
  weakestDay: DayExtreme | null
}

export interface DayExtreme {
  date: string
  revenue: number
  ref: string
}

export interface RecurrenceItem {
  code: 'missing_z' | 'reconciliation_warning' | 'reconciliation_error' | 'z_below_x' | 'count_unexplained_shortage' | 'count_timing_uncertain'
  branchKey: string
  branchName: string
  /** distinct business days of the week on which it occurred */
  days: number
  dates: string[]
  /** days of the week that had a stored daily snapshot (the denominator of what could be observed) */
  observableDays: number
  ref: string
}

export interface WeeklyFactPack {
  schemaVersion: typeof FACT_PACK_SCHEMA_VERSION
  reportType: 'weekly'
  weekStart: string
  weekEnd: string
  generatedAt: string
  scope: PackScope
  weekComplete: boolean
  reproducibility: Reproducibility
  completeness: { overall: 'complete' | 'partial' | 'no_data'; reasons: LimitationCode[] }
  organization: {
    finalizedRevenue: Fact
    provisionalRevenue: Fact
    transactions: Fact
    averageBasket: Fact
    grossProfit: Fact
    /** the previous week with supported, compatible data; unsupported with the reason otherwise */
    vsPreviousWeek: { support: Support; reasons: string[]; pct: number | null; delta: number | null; baseline: number | null; refs: { pct: string | null; delta: string | null; baseline: string | null } }
    /** finalized daily series across all branches, only for dates where every branch is finalized */
    dailySeries: Array<{ date: string; revenue: number; ref: string }>
    strongestDay: DayExtreme | null
    weakestDay: DayExtreme | null
    reportingCompleteness: { finalizedDays: number; provisionalDays: number; branches: number; ref: string }
  }
  branches: WeeklyBranchFacts[]
  operations: {
    missingZDays: Fact
    reconciliationWarningDays: Fact
    reconciliationErrorDays: Fact
    zBelowXDays: Fact
  }
  recurrence: { items: RecurrenceItem[]; unsupported: Array<{ code: string; reason: string }> }
  inventory: {
    wasteEntries: Fact
    wasteCost: Fact
    countShortageBranches: string[]
    timingUncertainBranches: string[]
  }
  /** current-state procurement: only when the viewed week is the current week, otherwise unavailable (no history) */
  procurement: ProcurementFacts
  weather: {
    historical: Array<WeatherDayContext & { branchKey: string; branchName: string }>
    relationships: RelationshipFact[]
  }
  limitations: Limitation[]
  evidence: Record<string, EvidenceEntry>
  provenance: Provenance
}

export type FactPack = DailyFactPack | WeeklyFactPack

// ---------------------------------------------------------------------------
// Narrative contract
// ---------------------------------------------------------------------------

export interface NarrativeSection {
  code: string
  title: string
  body: string
  /** evidence ids from the Fact Pack registry */
  evidenceRefs: string[]
}

export interface NarrativeLimitation {
  code: LimitationCode
  text: string
}

export interface Narrative {
  schemaVersion: typeof NARRATIVE_SCHEMA_VERSION
  reportType: 'daily' | 'weekly'
  headline: string
  executiveSummary: string
  sections: NarrativeSection[]
  limitations: NarrativeLimitation[]
  generatedAt: string
}

export type { Comparison }
