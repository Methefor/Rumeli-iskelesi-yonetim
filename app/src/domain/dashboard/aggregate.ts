import { deriveShiftRevenueFromReports } from '../revenue'
import { summarizeGrossProfit } from '../inventory'
import { available, notApplicable, partial, unavailable, type MetricState } from './metricState'
import { sumKurus, toKurus, type Kurus } from './money'
import type { DashboardPeriod } from './period'
import type {
  BranchComparisonRow,
  BranchDashboardDetail,
  BranchRawData,
  BranchReportFact,
  BranchShiftFact,
  GrossProfitCard,
  OperationalSummary,
  OrganizationSummary,
  ReconciliationCounts,
  ShiftStats,
} from './types'

const notCancelled = (r: BranchReportFact) => r.status !== 'cancelled'

/**
 * Revenue for a set of reports, in kuruş. Groups reports by shift and
 * applies the single shared X/Z rule (`deriveShiftRevenueFromReports`) per
 * shift, in integer kuruş, before summing across shifts — so the "evening Z
 * already includes the morning X" rule is applied exactly once per shift,
 * the same way every other screen in the app applies it, and the
 * cross-shift sum is exact integer arithmetic.
 *
 * Always `available`, never `unavailable`: a period with zero submitted
 * reports genuinely has zero measured revenue — that is a real fact, not a
 * missing one. "Missing data" applies to metrics this module cannot derive
 * from what exists (gross profit without a cost mapping), not to an empty,
 * correctly-queried period.
 */
export function computeBranchRevenueKurus(reports: readonly BranchReportFact[]): MetricState<Kurus> {
  const byShift = new Map<string, BranchReportFact[]>()
  for (const r of reports) {
    if (!notCancelled(r)) continue
    const list = byShift.get(r.shiftId)
    if (list) list.push(r)
    else byShift.set(r.shiftId, [r])
  }
  const perShiftKurus = [...byShift.values()].map((shiftReports) =>
    deriveShiftRevenueFromReports(
      shiftReports.map((r) => ({
        reportType: r.reportType,
        grossRevenue: toKurus(r.grossRevenue),
        status: r.status as 'submitted' | 'edited' | 'cancelled',
      })),
    ),
  )
  return available(sumKurus(perShiftKurus))
}

export function computeShiftStats(shifts: readonly BranchShiftFact[]): ShiftStats {
  const count = (status: string) => shifts.filter((s) => s.status === status).length
  const submitted = count('submitted')
  const closed = count('closed')
  return {
    scheduled: count('scheduled'),
    inProgress: count('in_progress'),
    submitted,
    closed,
    cancelled: count('cancelled'),
    completed: submitted + closed,
  }
}

/** Tallies the server-computed `reconciliationStatus` of non-cancelled reports — never re-derives OK/WARNING/ERROR client-side. */
export function computeReconciliationCounts(reports: readonly BranchReportFact[]): ReconciliationCounts {
  // Historical imported findings keep their stored status but are not tallied as operational work.
  const active = reports.filter((r) => notCancelled(r) && r.origin !== 'legacy_import')
  return {
    OK: active.filter((r) => r.reconciliationStatus === 'OK').length,
    WARNING: active.filter((r) => r.reconciliationStatus === 'WARNING').length,
    ERROR: active.filter((r) => r.reconciliationStatus === 'ERROR').length,
  }
}

/**
 * Wraps `domain/inventory/summarizeGrossProfit` (the single source of truth
 * for complete/partial/unavailable gross profit) into a dashboard
 * MetricState, in kuruş. A branch with no inventory tracking is
 * `not_applicable`, never `unavailable` — those are different facts.
 */
export function computeGrossProfitCard(
  grossProfit: BranchRawData['grossProfit'],
  inventoryTracked: boolean,
): MetricState<GrossProfitCard> {
  if (!inventoryTracked) return notApplicable('Bu şubede stok takibi yapılmıyor.')
  if (!grossProfit) return unavailable('Henüz hesaplanamıyor.')

  const summary = summarizeGrossProfit(grossProfit.lines, grossProfit.unmappedCategoryRevenue)
  const uncoveredRevenueKurus = toKurus(summary.uncoveredProductRevenue + summary.unmappedCategoryRevenue)
  const card: GrossProfitCard = {
    amountKurus: toKurus(summary.grossProfit),
    status: summary.status,
    uncoveredRevenueKurus,
  }
  if (summary.status === 'unavailable') {
    return unavailable('Maliyet eşlemesi yetersiz; Brüt Kâr hesaplanamıyor.')
  }
  if (summary.status === 'partial') {
    return partial(card, 'Kısmi: bazı satışların maliyeti veya kategori eşlemesi eksik.')
  }
  return available(card)
}

function combineShiftStats(a: ShiftStats, b: ShiftStats): ShiftStats {
  return {
    scheduled: a.scheduled + b.scheduled,
    inProgress: a.inProgress + b.inProgress,
    submitted: a.submitted + b.submitted,
    closed: a.closed + b.closed,
    cancelled: a.cancelled + b.cancelled,
    completed: a.completed + b.completed,
  }
}
const EMPTY_SHIFT_STATS: ShiftStats = {
  scheduled: 0,
  inProgress: 0,
  submitted: 0,
  closed: 0,
  cancelled: 0,
  completed: 0,
}

function revenueShareOf(branchRevenue: Kurus, orgTotal: MetricState<Kurus>): MetricState<number> {
  if (orgTotal.status !== 'available') return unavailable('Toplam ciro hesaplanamadı.')
  if (orgTotal.value <= 0) return unavailable('Bu dönemde toplam ciro yok.')
  return available(branchRevenue / orgTotal.value)
}

/** Builds one branch's comparison row. `orgTotalRevenue` must be the SAME period's org total (for `revenueShare`), never a different range. */
export function buildBranchComparisonRow(
  raw: BranchRawData,
  orgTotalRevenue: MetricState<Kurus>,
): BranchComparisonRow {
  const revenue = computeBranchRevenueKurus(raw.period.reports)
  const revenueValue = revenue.status === 'available' ? revenue.value : 0
  const inventoryTracked = raw.inventoryTracked

  return {
    branchId: raw.branchId,
    branchKey: raw.branchKey,
    branchName: raw.branchName,
    revenue,
    revenueShare: revenueShareOf(revenueValue, orgTotalRevenue),
    reportCount: raw.period.reports.filter(notCancelled).length,
    reconciliation: computeReconciliationCounts(raw.period.reports),
    openReconciliationCount: raw.openReconciliationCount,
    shifts: computeShiftStats(raw.period.shifts),
    inventoryTracked,
    inventoryAlertCount: inventoryTracked
      ? available(raw.inventoryAlertCount)
      : notApplicable('Stok takibi yok.'),
    wasteEntryCount: inventoryTracked
      ? available(raw.wasteEntryCountInPeriod)
      : notApplicable('Stok takibi yok.'),
    countsSubmittedInPeriod: inventoryTracked
      ? available(raw.countsSubmittedInPeriod)
      : notApplicable('Stok takibi yok.'),
    grossProfit: computeGrossProfitCard(raw.grossProfit, inventoryTracked),
  }
}

/**
 * Combines each tracked branch's gross-profit MetricState into one org-wide
 * figure. Never averages or fabricates: if every tracked branch is fully
 * 'available' the org figure is 'available' too; any partial/unavailable
 * branch downgrades the whole figure to 'partial' (its amount still sums
 * whatever IS known), and zero trackable branches is 'not_applicable'.
 */
function combineGrossProfit(rows: readonly BranchComparisonRow[]): MetricState<GrossProfitCard> {
  const tracked = rows.filter((r) => r.inventoryTracked)
  if (tracked.length === 0) return notApplicable('Hiçbir şubede stok takibi yapılmıyor.')

  let amount = 0
  let uncovered = 0
  let anyKnown = false
  let allComplete = true
  for (const row of tracked) {
    const gp = row.grossProfit
    if (gp.status === 'available' || gp.status === 'partial') {
      amount += gp.value.amountKurus
      uncovered += gp.value.uncoveredRevenueKurus
      anyKnown = true
      if (gp.status === 'partial') allComplete = false
    } else {
      allComplete = false
    }
  }
  if (!anyKnown) return unavailable('Maliyet eşlemesi yetersiz; Brüt Kâr hesaplanamıyor.')
  const card: GrossProfitCard = {
    amountKurus: amount,
    status: allComplete ? 'complete' : 'partial',
    uncoveredRevenueKurus: uncovered,
  }
  return allComplete
    ? available(card)
    : partial(card, 'Kısmi: bir veya daha fazla şubede maliyet/kategori eşlemesi eksik.')
}

export function buildOrganizationSummary(
  period: DashboardPeriod,
  rows: readonly BranchComparisonRow[],
): OrganizationSummary {
  const totalRevenue: MetricState<Kurus> =
    rows.length === 0
      ? unavailable('Görüntülenecek şube yok.')
      : available(sumKurus(rows.map((r) => (r.revenue.status === 'available' ? r.revenue.value : 0))))

  const trackedCount = rows.filter((r) => r.inventoryTracked).length

  return {
    period,
    branchCount: rows.length,
    totalRevenue,
    reportCount: rows.reduce((sum, r) => sum + r.reportCount, 0),
    openReconciliationCount: rows.reduce((sum, r) => sum + r.openReconciliationCount, 0),
    shifts: rows.reduce((acc, r) => combineShiftStats(acc, r.shifts), EMPTY_SHIFT_STATS),
    grossProfit: combineGrossProfit(rows),
    inventoryAlertCount:
      trackedCount === 0
        ? notApplicable('Hiçbir şubede stok takibi yapılmıyor.')
        : available(
            rows.reduce(
              (sum, r) => sum + (r.inventoryAlertCount.status === 'available' ? r.inventoryAlertCount.value : 0),
              0,
            ),
          ),
    inventoryTrackedBranchCount: trackedCount,
  }
}

export function buildOperationalSummary(rows: readonly BranchComparisonRow[]): OperationalSummary {
  return {
    reconciliation: rows.reduce<ReconciliationCounts>(
      (acc, r) => ({
        OK: acc.OK + r.reconciliation.OK,
        WARNING: acc.WARNING + r.reconciliation.WARNING,
        ERROR: acc.ERROR + r.reconciliation.ERROR,
      }),
      { OK: 0, WARNING: 0, ERROR: 0 },
    ),
    reportsSubmitted: rows.reduce((sum, r) => sum + r.reportCount, 0),
    shifts: rows.reduce((acc, r) => combineShiftStats(acc, r.shifts), EMPTY_SHIFT_STATS),
    countsSubmittedInPeriod: rows.reduce(
      (sum, r) => sum + (r.countsSubmittedInPeriod.status === 'available' ? r.countsSubmittedInPeriod.value : 0),
      0,
    ),
    wasteEntryCountInPeriod: rows.reduce(
      (sum, r) => sum + (r.wasteEntryCount.status === 'available' ? r.wasteEntryCount.value : 0),
      0,
    ),
  }
}

export function buildBranchDetail(row: BranchComparisonRow, raw: BranchRawData): BranchDashboardDetail {
  return {
    row,
    recentReports: [...raw.period.reports].sort((a, b) => (a.shiftId < b.shiftId ? 1 : -1)),
    recentShifts: [...raw.period.shifts].sort((a, b) => (a.businessDate < b.businessDate ? 1 : -1)),
  }
}

/** Orchestrates the three builders above for a whole dashboard render (org overview + comparison rows). */
export function buildDashboard(
  period: DashboardPeriod,
  raws: readonly BranchRawData[],
): { organization: OrganizationSummary; branches: BranchComparisonRow[] } {
  // Pass 1: each branch's own revenue, to compute the org total.
  const provisionalTotal = available(
    sumKurus(
      raws.map((raw) => {
        const rev = computeBranchRevenueKurus(raw.period.reports)
        return rev.status === 'available' ? rev.value : 0
      }),
    ),
  )
  const orgTotalRevenue: MetricState<Kurus> = raws.length === 0 ? unavailable('Görüntülenecek şube yok.') : provisionalTotal

  // Pass 2: full rows, now that every row can compute its share of the same total.
  const branches = raws.map((raw) => buildBranchComparisonRow(raw, orgTotalRevenue))
  const organization = buildOrganizationSummary(period, branches)
  return { organization, branches }
}
