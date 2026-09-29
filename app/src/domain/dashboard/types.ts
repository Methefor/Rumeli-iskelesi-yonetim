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
  reportType: 'X' | 'Z'
  /** TL, as returned by the data layer. Converted to kuruş at ingestion. */
  grossRevenue: number
  status: 'submitted' | 'edited' | 'cancelled' | string
  reconciliationStatus: ReconciliationStatus
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

export interface BranchComparisonRow {
  branchId: string
  branchKey: string
  branchName: string
  revenue: MetricState<Kurus>
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
