import { describe, expect, it } from 'vitest'
import { resolveDashboardPeriod } from './period'
import {
  buildBranchComparisonRow,
  buildBranchDetail,
  buildDashboard,
  buildOperationalSummary,
  buildOrganizationSummary,
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

describe('computeBranchRevenueKurus', () => {
  it('applies the shared X/Z rule per shift in integer kuruş and sums across shifts exactly', () => {
    const reports = [
      report({ shiftId: 'a', reportType: 'X', grossRevenue: 1000.5 }),
      report({ shiftId: 'a', reportType: 'Z', grossRevenue: 2500.75 }), // a: 1000.50 + (2500.75-1000.50) = 2500.75
      report({ shiftId: 'b', reportType: 'X', grossRevenue: 300.25 }), // b: 300.25 alone
    ]
    const revenue = computeBranchRevenueKurus(reports)
    expect(revenue).toEqual(available(250075 + 30025))
  })

  it('never double-counts: many 0.1-scale reports across many shifts sum exactly in kuruş', () => {
    const reports = Array.from({ length: 500 }, (_, i) =>
      report({ shiftId: `s${i}`, reportType: 'X', grossRevenue: 0.1 }),
    )
    expect(computeBranchRevenueKurus(reports)).toEqual(available(500 * 10))
  })

  it('excludes cancelled reports entirely, including a cancelled report that would otherwise dominate the shift', () => {
    const reports = [
      report({ shiftId: 'a', reportType: 'X', grossRevenue: 999999, status: 'cancelled' }),
      report({ shiftId: 'a', reportType: 'Z', grossRevenue: 500 }),
    ]
    expect(computeBranchRevenueKurus(reports)).toEqual(available(50000))
  })

  it('a Z lower than X never produces a negative shift revenue', () => {
    const reports = [
      report({ shiftId: 'a', reportType: 'X', grossRevenue: 900 }),
      report({ shiftId: 'a', reportType: 'Z', grossRevenue: 800 }),
    ]
    expect(computeBranchRevenueKurus(reports)).toEqual(available(90000))
  })

  it('zero reports is a real, available zero — not "unavailable"', () => {
    const revenue = computeBranchRevenueKurus([])
    expect(revenue.status).toBe('available')
    expect(revenue).toEqual(available(0))
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
          report({ shiftId: 's1', reportType: 'X', grossRevenue: 600 }),
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
        reports: [report({ shiftId: 's2', reportType: 'X', grossRevenue: 400 })],
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
    const a = raw({ branchId: 'a', period: { reports: [report({ shiftId: 's1', grossRevenue: 100 })], shifts: [] } })
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
