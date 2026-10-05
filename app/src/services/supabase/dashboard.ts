import { supabase } from './client'
import { deriveInventoryAlerts } from '../../domain/inventory'
import type { DashboardPeriod, BranchRawData } from '../../domain/dashboard'
import { listInventoryItems, listStockBalances, listLastCounts, getInventoryGrossProfit } from './inventory'
import { listReconciliationQueue } from './sales'

/**
 * Everything the Manager Dashboard reads is period-scoped by the SAME
 * `DashboardPeriod` (see `domain/dashboard/period.ts`) and the SAME
 * inclusion rules for every branch — no branch gets a different date range,
 * a different report-status filter, or a different "in range" definition.
 * This module only fetches and shapes rows; every number on screen is
 * computed by `domain/dashboard` from the shapes returned here.
 */

interface ReportFactRow {
  shift_id: string
  report_type: 'X' | 'Z'
  gross_revenue: number
  status: string
  reconciliation_status: 'OK' | 'WARNING' | 'ERROR'
  origin: 'native' | 'legacy_import'
}

interface ShiftFactRow {
  id: string
  business_date: string
  status: string
}

/** Shifts whose business_date falls in [fromDate, toDateInclusive] — the period's own inclusion rule, not submission time. */
async function listShiftFactsInRange(
  branchId: string,
  fromDate: string,
  toDateInclusive: string,
): Promise<ShiftFactRow[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select('id, business_date, status')
    .eq('branch_id', branchId)
    .gte('business_date', fromDate)
    .lte('business_date', toDateInclusive)
    .returns<ShiftFactRow[]>()
  if (error || !data) return []
  return data
}

/** Reports that belong to the given shifts (i.e. to shifts already known to be in range) — never filtered by submission time, so a same-day backdated entry still counts under its shift's own business date. */
async function listReportFactsForShifts(branchId: string, shiftIds: readonly string[]): Promise<ReportFactRow[]> {
  if (shiftIds.length === 0) return []
  const { data, error } = await supabase
    .from('sales_reports_with_origin')
    .select('shift_id, report_type, gross_revenue, status, reconciliation_status, origin')
    .eq('branch_id', branchId)
    .in('shift_id', [...shiftIds])
    .returns<ReportFactRow[]>()
  if (error || !data) return []
  return data
}

async function countWasteMovementsInRange(
  branchId: string,
  fromInstant: string,
  toInstantExclusive: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('inventory_movements')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', branchId)
    .eq('movement_type', 'WASTE')
    .gte('occurred_at', fromInstant)
    .lt('occurred_at', toInstantExclusive)
  if (error || count === null) return 0
  return count
}

async function countSubmittedCountsInRange(
  branchId: string,
  fromDate: string,
  toDateInclusive: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('inventory_counts')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', branchId)
    .eq('status', 'submitted')
    .gte('business_date', fromDate)
    .lte('business_date', toDateInclusive)
  if (error || count === null) return 0
  return count
}

/** Fetches and shapes one branch's raw dashboard data for the given period. RLS scopes visibility exactly as every other screen. */
export async function fetchBranchDashboardRaw(
  branchId: string,
  branchKey: string,
  branchName: string,
  period: DashboardPeriod,
): Promise<BranchRawData> {
  const [shifts, items, openQueue] = await Promise.all([
    listShiftFactsInRange(branchId, period.fromDate, period.toDateInclusive),
    listInventoryItems(branchId).catch(() => []),
    listReconciliationQueue(branchId).catch(() => []),
  ])
  const reports = await listReportFactsForShifts(
    branchId,
    shifts.map((s) => s.id),
  )

  const inventoryTracked = items.length > 0
  let inventoryAlertCount = 0
  let wasteEntryCountInPeriod = 0
  let countsSubmittedInPeriod = 0
  let grossProfit: BranchRawData['grossProfit'] = null

  if (inventoryTracked) {
    const [balances, lastCounts, waste, counts, gp] = await Promise.all([
      listStockBalances(branchId).catch(() => []),
      listLastCounts(items.map((i) => i.id)).catch(() => []),
      countWasteMovementsInRange(branchId, period.fromInstant, period.toInstantExclusive),
      countSubmittedCountsInRange(branchId, period.fromDate, period.toDateInclusive),
      getInventoryGrossProfit(branchId, period.fromInstant, period.toInstantExclusive).catch(() => null),
    ])
    inventoryAlertCount = deriveInventoryAlerts(items, balances, lastCounts).length
    wasteEntryCountInPeriod = waste
    countsSubmittedInPeriod = counts
    grossProfit = gp
      ? { lines: gp.lines.map((l) => ({ ...l })), unmappedCategoryRevenue: gp.unmappedCategoryRevenue }
      : null
  }

  return {
    branchId,
    branchKey,
    branchName,
    period: {
      reports: reports.map((r) => ({
        shiftId: r.shift_id,
        reportType: r.report_type,
        grossRevenue: Number(r.gross_revenue),
        status: r.status,
        reconciliationStatus: r.reconciliation_status,
        origin: r.origin,
      })),
      shifts: shifts.map((s) => ({ id: s.id, businessDate: s.business_date, status: s.status })),
    },
    openReconciliationCount: openQueue.length,
    inventoryTracked,
    inventoryAlertCount,
    wasteEntryCountInPeriod,
    countsSubmittedInPeriod,
    grossProfit,
  }
}
