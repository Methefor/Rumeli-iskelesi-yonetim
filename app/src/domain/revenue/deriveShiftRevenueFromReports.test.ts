import { describe, expect, test } from 'vitest'
import {
  deriveShiftRevenueFromReports,
  type ShiftReportSummary,
} from './deriveShiftRevenueFromReports'

function report(overrides: Partial<ShiftReportSummary>): ShiftReportSummary {
  return { reportType: 'X', grossRevenue: 0, status: 'submitted', ...overrides }
}

describe('deriveShiftRevenueFromReports', () => {
  test('computes X + max(0, Z - X) when both an X and a Z report exist', () => {
    const total = deriveShiftRevenueFromReports([
      report({ reportType: 'X', grossRevenue: 1000 }),
      report({ reportType: 'Z', grossRevenue: 1800 }),
    ])
    expect(total).toBe(1800) // 1000 + max(0, 1800-1000) = 1800
  })

  test('uses the X total alone when only a morning report exists', () => {
    const total = deriveShiftRevenueFromReports([
      report({ reportType: 'X', grossRevenue: 650.5 }),
    ])
    expect(total).toBe(650.5)
  })

  test('uses the Z total alone when only an evening report exists', () => {
    const total = deriveShiftRevenueFromReports([
      report({ reportType: 'Z', grossRevenue: 1200 }),
    ])
    expect(total).toBe(1200)
  })

  test('returns 0 when there are no reports at all', () => {
    expect(deriveShiftRevenueFromReports([])).toBe(0)
  })

  test('ignores cancelled reports entirely', () => {
    const total = deriveShiftRevenueFromReports([
      report({ reportType: 'X', grossRevenue: 999, status: 'cancelled' }),
      report({ reportType: 'Z', grossRevenue: 500 }),
    ])
    expect(total).toBe(500)
  })

  test('a Z lower than X still yields the X total, not a negative increment', () => {
    const total = deriveShiftRevenueFromReports([
      report({ reportType: 'X', grossRevenue: 900 }),
      report({ reportType: 'Z', grossRevenue: 800 }), // data-entry problem, not negative revenue
    ])
    expect(total).toBe(900)
  })
})
