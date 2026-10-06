import { describe, expect, it } from 'vitest'
import { resolveDashboardPeriod } from './period'
import {
  buildBranchComparisonRow,
  buildBranchDetail,
  buildDashboard,
  buildOperationalSummary,
  buildOrganizationSummary,
  computeBranchRevenueBreakdown,
  computeBranchRevenueKurus,
  computeGrossProfitCard,
  computeReconciliationCounts,
  computeShiftStats,
} from './aggregate'
import type { BranchRawData, BranchReportFact, BranchShiftFact, GrossProfitLineFact } from './types'
import { available } from './metricState'

const PERIOD = resolveDashboardPeriod('7d', new Date('2027-06-15T10:00:00+03:00'))

function report(over: Partial<BranchReportFact>): BranchReportFact {
  return { shiftId: 's1', reportType: 'X', grossRevenue: 0, status: 'submitted', reconciliationStatus: 'OK', ...over }
}
function shift(over: Partial<BranchShiftFact>): BranchShiftFact {
  return { id: 's1', businessDate: '2027-06-15', status: 'scheduled', ...over }
}
function raw(over: Partial<BranchRawData>): BranchRawData {
  return {
    branchId: 'b1',
    branchKey: 'b1',
    branchName: 'Şube 1',
    period: { reports: [], shifts: [] },
    openReconciliationCount: 0,
    inventoryTracked: false,
    inventoryAlertCount: 0,
    wasteEntryCountInPeriod: 0,
    countsSubmittedInPeriod: 0,
    grossProfit: null,
    ...over,
  }
}

const day = (businessDate: string, shiftId: string, reportType: 'X' | 'Z', grossRevenue: number, over: Partial<BranchReportFact> = {}) =>
  report({ businessDate, shiftId, reportType, grossRevenue, ...over })

describe('computeBranchRevenueKurus: business-day X/Z rule (X provisional, Z final, never X + Z)', () => {
  it('X morning + Z evening on DIFFERENT shifts: the day is the Z exactly, never X + Z', () => {
    const reports = [day('2027-06-15', 'morning', 'X', 6000), day('2027-06-15', 'evening', 'Z', 9600)]
    expect(computeBranchRevenueKurus(reports)).toEqual(available(960000))
    expect(computeBranchRevenueBreakdown(reports)).toMatchObject({ finalizedKurus: 960000, provisionalKurus: 0, finalizedDays: 1, provisionalDays: 0 })
  })

  it('X and Z on the SAME shift: the Z exactly', () => {
    const reports = [day('2027-06-15', 'a', 'X', 1000.5), day('2027-06-15', 'a', 'Z', 2500.75)]
    expect(computeBranchRevenueKurus(reports)).toEqual(available(250075))
  })

  it('X only: provisional, not final revenue and not added to the total', () => {
    const reports = [day('2027-06-15', 'morning', 'X', 9600)]
    const revenue = computeBranchRevenueKurus(reports)
    expect(revenue.status).toBe('partial')
    expect(revenue).toMatchObject({ value: 0 })
    expect(computeBranchRevenueBreakdown(reports)).toMatchObject({ finalizedKurus: 0, provisionalKurus: 960000, provisionalDays: 1 })
  })

  it('Z only: the Z', () => {
    expect(computeBranchRevenueKurus([day('2027-06-15', 'evening', 'Z', 9600)])).toEqual(available(960000))
  })

  it('Z below X: still the Z (no max(X, Z)), and the day is flagged', () => {
    const reports = [day('2027-06-15', 'morning', 'X', 9600), day('2027-06-15', 'evening', 'Z', 6000)]
    expect(computeBranchRevenueKurus(reports)).toEqual(available(600000))
    expect(computeBranchRevenueBreakdown(reports).zBelowXDays).toEqual(['2027-06-15'])
  })

  it('INHERITED behaviour: several active readings of one type on a day (shifts/registers) -> the LAST one wins, flagged', () => {
    const reports = [
      day('2027-06-15', 'm', 'X', 100),
      day('2027-06-15', 'm2', 'X', 700),
      day('2027-06-15', 'e', 'Z', 1000),
      day('2027-06-15', 'e2', 'Z', 1200),
    ]
    expect(computeBranchRevenueKurus(reports)).toEqual(available(120000))
    expect(computeBranchRevenueBreakdown(reports).multipleReadingDays).toEqual(['2027-06-15'])
  })

  it('several active readings of one type: the latest submittedAt wins, whatever the input order', () => {
    const early = day('2027-06-15', 'e1', 'Z', 1000, { submittedAt: '2027-06-15T20:00:00Z' })
    const late = day('2027-06-15', 'e2', 'Z', 1200, { submittedAt: '2027-06-15T21:00:00Z' })
    expect(computeBranchRevenueKurus([late, early])).toEqual(available(120000))
    expect(computeBranchRevenueKurus([early, late])).toEqual(available(120000))
  })

  it('sums finalized days only; a day without Z is partial and its X stays separate', () => {
    const reports = [
      day('2027-06-14', 'm', 'X', 6000),
      day('2027-06-14', 'e', 'Z', 9600), // final 9600
      day('2027-06-15', 'm', 'X', 3000), // provisional
      day('2027-06-16', 'e', 'Z', 400.25), // final 400.25
    ]
    const revenue = computeBranchRevenueKurus(reports)
    expect(revenue.status).toBe('partial')
    expect(revenue).toMatchObject({ value: 960000 + 40025 })
    expect(computeBranchRevenueBreakdown(reports)).toMatchObject({ finalizedDays: 2, provisionalDays: 1, provisionalKurus: 300000 })
  })

  it('kuruş exactness across many days', () => {
    const reports = Array.from({ length: 500 }, (_, i) => day(`d${i}`, `s${i}`, 'Z', 0.1))
    expect(computeBranchRevenueKurus(reports)).toEqual(available(500 * 10))
  })

  it('excludes cancelled reports entirely, even one that would dominate the day', () => {
    const reports = [
      day('2027-06-15', 'a', 'X', 999999, { status: 'cancelled' }),
      day('2027-06-15', 'a', 'Z', 500),
    ]
    expect(computeBranchRevenueKurus(reports)).toEqual(available(50000))
    // a cancelled Z leaves the X as the only reading -> provisional
    expect(computeBranchRevenueKurus([day('2027-06-15', 'a', 'X', 500), day('2027-06-15', 'a', 'Z', 999, { status: 'cancelled' })]).status).toBe('partial')
  })

  it('a report without a business date is its own day (shift-only callers)', () => {
    const reports = [report({ shiftId: 'a', reportType: 'X', grossRevenue: 300 }), report({ shiftId: 'b', reportType: 'Z', grossRevenue: 500 })]
    expect(computeBranchRevenueBreakdown(reports)).toMatchObject({ finalizedKurus: 50000, provisionalKurus: 30000 })
  })

  it('zero reports is a real, available zero, not unavailable', () => {
    expect(computeBranchRevenueKurus([])).toEqual(available(0))
  })
})

describe('dashboard aggregates use the business-day revenue (no X + Z, no provisional in totals)', () => {
  it('the branch row and the organization total follow the Z rule and expose the provisional X separately', () => {
    const a = raw({
      branchId: 'a',
      period: { reports: [day('2027-06-15', 'm', 'X', 6000), day('2027-06-15', 'e', 'Z', 9600)], shifts: [shift({ id: 'm' }), shift({ id: 'e' })] },
    })
    const b = raw({ branchId: 'b', period: { reports: [day('2027-06-15', 'm2', 'X', 2000)], shifts: [shift({ id: 'm2' })] } })
    const { organization, branches } = buildDashboard(PERIOD, [a, b])
    expect(branches.find((r) => r.branchId === 'a')!.revenue).toEqual(available(960000))
    expect(branches.find((r) => r.branchId === 'b')!.revenue.status).toBe('partial')
    expect(organization.totalRevenue).toMatchObject({ status: 'partial', value: 960000 })
    expect(organization.provisionalRevenueKurus).toBe(200000)
    expect(organization.provisionalDays).toBe(1)
  })

  it('flags Z below X on the organization summary', () => {
    const a = raw({ period: { reports: [day('2027-06-15', 'm', 'X', 9600), day('2027-06-15', 'e', 'Z', 6000)], shifts: [] } })
    const { organization } = buildDashboard(PERIOD, [a])
    expect(organization.totalRevenue).toEqual(available(600000))
    expect(organization.zBelowXDays).toBe(1)
  })
})

describe('computeShiftStats', () => {
  it('counts each status and derives completed = submitted + closed', () => {
    const shifts = [
      shift({ status: 'scheduled' }),
      shift({ status: 'scheduled' }),
      shift({ status: 'in_progress' }),
      shift({ status: 'submitted' }),
      shift({ status: 'closed' }),
      shift({ status: 'closed' }),
      shift({ status: 'cancelled' }),
    ]
    expect(computeShiftStats(shifts)).toEqual({
      scheduled: 2,
      inProgress: 1,
      submitted: 1,
      closed: 2,
      cancelled: 1,
      completed: 3,
    })
  })
})

describe('computeReconciliationCounts', () => {
  it('tallies OK/WARNING/ERROR from non-cancelled reports only', () => {
    const reports = [
      report({ reconciliationStatus: 'OK' }),
      report({ reconciliationStatus: 'WARNING' }),
      report({ reconciliationStatus: 'ERROR' }),
      report({ reconciliationStatus: 'ERROR', status: 'cancelled' }), // excluded
    ]
    expect(computeReconciliationCounts(reports)).toEqual({ OK: 1, WARNING: 1, ERROR: 1 })
  })
})

describe('computeReconciliationCounts: historical imported findings', () => {
  it('are kept out of the operational tally while native ones stay counted', () => {
    const reports = [
      report({ reconciliationStatus: 'ERROR' }),
      report({ reconciliationStatus: 'ERROR', origin: 'legacy_import' }),
      report({ reconciliationStatus: 'WARNING', origin: 'legacy_import' }),
      report({ reconciliationStatus: 'OK', origin: 'native' }),
    ]
    expect(computeReconciliationCounts(reports)).toEqual({ OK: 1, WARNING: 0, ERROR: 1 })
  })
})

describe('computeGrossProfitCard', () => {
  const line = (over: Partial<GrossProfitLineFact>): GrossProfitLineFact => ({
    inventoryItemId: 'i1',
    code: 'A',
    name: 'A',
    unit: 'kg',
    soldQuantity: 10,
    productRevenue: 1000,
    cogs: 400,
    costedQuantity: 10,
    uncostedQuantity: 0,
    ...over,
  })

  it('is not_applicable when the branch does not track inventory, regardless of data', () => {
    expect(computeGrossProfitCard({ lines: [line({})], unmappedCategoryRevenue: 0 }, false).status).toBe(
      'not_applicable',
    )
  })

  it('is unavailable when tracked but no gross-profit result exists at all', () => {
    expect(computeGrossProfitCard(null, true).status).toBe('unavailable')
  })

  it('is available with a complete card when every line is fully costed and nothing is unmapped', () => {
    const state = computeGrossProfitCard({ lines: [line({})], unmappedCategoryRevenue: 0 }, true)
    expect(state.status).toBe('available')
    if (state.status === 'available') {
      expect(state.value.status).toBe('complete')
      expect(state.value.amountKurus).toBe(60000) // (1000-400) TL -> 60000 kuruş
      expect(state.value.uncoveredRevenueKurus).toBe(0)
    }
  })

  it('is partial and discloses uncovered revenue when one line is fully costed and another has uncosted quantity', () => {
    const state = computeGrossProfitCard(
      {
        lines: [line({ inventoryItemId: 'complete' }), line({ inventoryItemId: 'partial', costedQuantity: 5, uncostedQuantity: 5 })],
        unmappedCategoryRevenue: 0,
      },
      true,
    )
    expect(state.status).toBe('partial')
    if (state.status === 'partial') expect(state.value.uncoveredRevenueKurus).toBeGreaterThan(0)
  })

  it('is unavailable when nothing at all is costed', () => {
    const state = computeGrossProfitCard(
      { lines: [line({ costedQuantity: 0, uncostedQuantity: 10 })], unmappedCategoryRevenue: 0 },
      true,
    )
    expect(state.status).toBe('unavailable')
  })

  it('never uses the words "Net Kâr" anywhere in its messages', () => {
    const messages = [
      computeGrossProfitCard(null, false),
      computeGrossProfitCard(null, true),
      computeGrossProfitCard({ lines: [line({ costedQuantity: 5, uncostedQuantity: 5 })], unmappedCategoryRevenue: 0 }, true),
    ]
      .map((s) => ('reason' in s ? s.reason : 'note' in s ? s.note : ''))
      .join(' ')
    expect(messages).not.toMatch(/net kâr/i)
  })
})

describe('buildBranchComparisonRow / buildDashboard: identical rules across branches', () => {
  it('two branches over the same period use the same status/cancellation rules and their shares sum to 1', () => {
    const a = raw({
      branchId: 'a',
      branchKey: 'a',
      branchName: 'A',
      period: {
        reports: [
          report({ shiftId: 's1', reportType: 'Z', grossRevenue: 600 }),
          report({ shiftId: 's1', reportType: 'Z', grossRevenue: 999999, status: 'cancelled' }),
        ],
        shifts: [shift({ id: 's1', status: 'submitted' })],
      },
    })
    const b = raw({
      branchId: 'b',
      branchKey: 'b',
      branchName: 'B',
      period: {
        reports: [report({ shiftId: 's2', reportType: 'Z', grossRevenue: 400 })],
        shifts: [shift({ id: 's2', status: 'closed' })],
      },
    })
    const { organization, branches } = buildDashboard(PERIOD, [a, b])
    expect(organization.totalRevenue).toEqual(available(100000)) // 600 + 400 TL, cancelled ignored
    const rowA = branches.find((r) => r.branchId === 'a')!
    const rowB = branches.find((r) => r.branchId === 'b')!
    expect(rowA.revenueShare.status).toBe('available')
    expect(rowB.revenueShare.status).toBe('available')
    if (rowA.revenueShare.status === 'available' && rowB.revenueShare.status === 'available') {
      expect(rowA.revenueShare.value + rowB.revenueShare.value).toBeCloseTo(1, 10)
    }
  })

  it('a branch with no data in the period is handled explicitly (available zero), not silently dropped', () => {
    const a = raw({ branchId: 'a', period: { reports: [report({ shiftId: 's1', reportType: 'Z', grossRevenue: 100 })], shifts: [] } })
    const empty = raw({ branchId: 'empty', branchName: 'Boş Şube', period: { reports: [], shifts: [] } })
    const { branches } = buildDashboard(PERIOD, [a, empty])
    const row = branches.find((r) => r.branchId === 'empty')!
    expect(row.revenue).toEqual(available(0))
    expect(row.revenueShare).toEqual(available(0))
    expect(row.reportCount).toBe(0)
  })

  it('when the organization total is zero, revenue share is unavailable rather than NaN or 0-as-100%', () => {
    const a = raw({ branchId: 'a', period: { reports: [], shifts: [] } })
    const { branches } = buildDashboard(PERIOD, [a])
    expect(branches[0]!.revenueShare.status).toBe('unavailable')
  })

  it('an untracked branch reports not_applicable for every inventory-only metric, never a misleading zero', () => {
    const row = buildBranchComparisonRow(raw({ inventoryTracked: false }), available(0))
    expect(row.inventoryAlertCount.status).toBe('not_applicable')
    expect(row.wasteEntryCount.status).toBe('not_applicable')
    expect(row.countsSubmittedInPeriod.status).toBe('not_applicable')
    expect(row.grossProfit.status).toBe('not_applicable')
  })
})

describe('buildOrganizationSummary: gross profit combination never fabricates a total', () => {
  const completeRow = buildBranchComparisonRow(
    raw({
      branchId: 'complete',
      inventoryTracked: true,
      grossProfit: {
        lines: [
          {
            inventoryItemId: 'i',
            code: 'A',
            name: 'A',
            unit: 'kg',
            soldQuantity: 1,
            productRevenue: 100,
            cogs: 40,
            costedQuantity: 1,
            uncostedQuantity: 0,
          },
        ],
        unmappedCategoryRevenue: 0,
      },
    }),
    available(0),
  )
  const untrackedRow = buildBranchComparisonRow(raw({ branchId: 'untracked', inventoryTracked: false }), available(0))

  it('is not_applicable when no branch tracks inventory', () => {
    expect(buildOrganizationSummary(PERIOD, [untrackedRow]).grossProfit.status).toBe('not_applicable')
  })

  it('is available (complete) when every tracked branch is complete', () => {
    expect(buildOrganizationSummary(PERIOD, [completeRow, untrackedRow]).grossProfit.status).toBe('available')
  })

  it('downgrades to partial when a tracked branch is unavailable, but still sums the known amount', () => {
    const unavailableRow = buildBranchComparisonRow(
      raw({ branchId: 'unavailable', inventoryTracked: true, grossProfit: null }),
      available(0),
    )
    const summary = buildOrganizationSummary(PERIOD, [completeRow, unavailableRow])
    expect(summary.grossProfit.status).toBe('partial')
    if (summary.grossProfit.status === 'partial') expect(summary.grossProfit.value.amountKurus).toBe(6000)
  })
})

describe('buildOperationalSummary', () => {
  it('sums reconciliation, shift and inventory-operational counts across branches', () => {
    const a = buildBranchComparisonRow(
      raw({
        branchId: 'a',
        period: {
          reports: [report({ reconciliationStatus: 'WARNING' })],
          shifts: [shift({ status: 'closed' })],
        },
        inventoryTracked: true,
        countsSubmittedInPeriod: 2,
        wasteEntryCountInPeriod: 1,
      }),
      available(0),
    )
    const b = buildBranchComparisonRow(
      raw({
        branchId: 'b',
        period: { reports: [report({ reconciliationStatus: 'ERROR' })], shifts: [shift({ status: 'submitted' })] },
      }),
      available(0),
    )
    const op = buildOperationalSummary([a, b])
    expect(op.reconciliation).toEqual({ OK: 0, WARNING: 1, ERROR: 1 })
    expect(op.shifts.completed).toBe(2)
    expect(op.reportsSubmitted).toBe(2)
    expect(op.countsSubmittedInPeriod).toBe(2)
    expect(op.wasteEntryCountInPeriod).toBe(1)
  })
})

describe('buildBranchDetail', () => {
  it('carries the row plus the raw period reports/shifts for drill-down', () => {
    const r = raw({ period: { reports: [report({ shiftId: 's1' })], shifts: [shift({ id: 's1' })] } })
    const row = buildBranchComparisonRow(r, available(0))
    const detail = buildBranchDetail(row, r)
    expect(detail.row).toBe(row)
    expect(detail.recentReports).toHaveLength(1)
    expect(detail.recentShifts).toHaveLength(1)
  })
})
