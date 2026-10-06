import type { MetricState } from './metricState'
import type { Kurus } from './money'
import type { GrossProfitStatus } from '../inventory'
import type { ReconciliationStatus } from '../reconciliation'

// ---------------------------------------------------------------------------
// Raw inputs the aggregation layer consumes. Structural, minimal subsets of
// the service-layer row shapes (services/supabase/*, services/demo/*) so the
// same aggregate functions run against either without a service import.
// ---------------------------------------------------------------------------

export interface BranchReportFact {
  shiftId: string
  /** Istanbul business date of the report's shift. Revenue is decided per BUSINESS DAY, never per shift. A fact without one is treated as its own day (legacy callers/tests). */
  businessDate?: string
  /** Submission instant (ISO). Decides which of several active readings of one type is the latest; absent = input order. */
  submittedAt?: string
  reportType: 'X' | 'Z'
  /** TL, as returned by the data layer. Converted to kuruş at ingestion. */
  grossRevenue: number
  status: 'submitted' | 'edited' | 'cancelled' | string
  reconciliationStatus: ReconciliationStatus
  /** legacy_import findings are historical context, never today open work. */
  origin?: 'native' | 'legacy_import'
}

export interface BranchShiftFact {
  id: string
  businessDate: string
  status: 'scheduled' | 'in_progress' | 'submitted' | 'closed' | 'cancelled' | string
}

/** One line of `get_inventory_gross_profit`, exactly as `domain/inventory/grossProfit` consumes it. */
export interface GrossProfitLineFact {
  inventoryItemId: string
  code: string
  name: string
  unit: string
  soldQuantity: number
  productRevenue: number
  cogs: number
  costedQuantity: number
  uncostedQuantity: number
}

export interface BranchRawData {
  branchId: string
  branchKey: string
  branchName: string
  period: { reports: BranchReportFact[]; shifts: BranchShiftFact[] }
  /** All-time (not period-scoped): the current unresolved reconciliation backlog. */
  openReconciliationCount: number
  inventoryTracked: boolean
  /** Only meaningful when `inventoryTracked`. */
  inventoryAlertCount: number
  /** Waste movements recorded within the period (count only — cost is not exposed to every role, so no waste value is derived). */
  wasteEntryCountInPeriod: number
  /** Closing counts submitted within the period. */
  countsSubmittedInPeriod: number
  grossProfit: { lines: GrossProfitLineFact[]; unmappedCategoryRevenue: number } | null
}

// ---------------------------------------------------------------------------
// Aggregated output
// ---------------------------------------------------------------------------

export interface ReconciliationCounts {
  OK: number
  WARNING: number
  ERROR: number
}

export interface ShiftStats {
  scheduled: number
  inProgress: number
  submitted: number
  closed: number
  cancelled: number
  /** submitted + closed. */
  completed: number
}

export interface GrossProfitCard {
  amountKurus: Kurus
  status: GrossProfitStatus
  /** Product revenue not yet reflected in `amountKurus` (partial/unavailable lines + unmapped category revenue), for disclosure. */
  uncoveredRevenueKurus: Kurus
}

/**
 * Business-day revenue split. X is provisional, Z is the final management revenue; X + Z is never revenue.
 *   finalized  = sum over days WITH a Z of that Z exactly
 *   provisional = sum over X-only days of the X reading (shown separately, never added to finalized)
 */
export interface RevenueBreakdown {
  finalizedKurus: Kurus
  provisionalKurus: Kurus
  finalizedDays: number
  provisionalDays: number
  /** Days where Z < X: Z is still used. */
  zBelowXDays: string[]
  /** Days with several active readings of one type (inherited behaviour: the latest wins). */
  multipleReadingDays: string[]
}

export interface BranchComparisonRow {
  branchId: string
  branchKey: string
  branchName: string
  revenue: MetricState<Kurus>
  revenueBreakdown: RevenueBreakdown
  /** Share of the organization total for the same period; only available when the org total itself is available and > 0. */
  revenueShare: MetricState<number>
  reportCount: number
  reconciliation: ReconciliationCounts
  openReconciliationCount: number
  shifts: ShiftStats
  inventoryTracked: boolean
  inventoryAlertCount: MetricState<number>
  wasteEntryCount: MetricState<number>
  countsSubmittedInPeriod: MetricState<number>
  grossProfit: MetricState<GrossProfitCard>
}

export interface OrganizationSummary {
  period: import('./period').DashboardPeriod
  branchCount: number
  totalRevenue: MetricState<Kurus>
  /** Sum of the X readings of days that have no Z yet. Never part of `totalRevenue`. */
  provisionalRevenueKurus: Kurus
  provisionalDays: number
  zBelowXDays: number
  reportCount: number
  openReconciliationCount: number
  shifts: ShiftStats
  grossProfit: MetricState<GrossProfitCard>
  /** Sum of `inventoryAlertCount` over inventory-tracked branches only. */
  inventoryAlertCount: MetricState<number>
  /** How many of the branches in scope have inventory tracking configured at all. */
  inventoryTrackedBranchCount: number
}

export interface OperationalSummary {
  reconciliation: ReconciliationCounts
  /** Reports whose status is 'submitted' or 'edited' (never cancelled) in the period. */
  reportsSubmitted: number
  shifts: ShiftStats
  countsSubmittedInPeriod: number
  wasteEntryCountInPeriod: number
}

export interface BranchDashboardDetail {
  row: BranchComparisonRow
  recentReports: BranchReportFact[]
  recentShifts: BranchShiftFact[]
}
