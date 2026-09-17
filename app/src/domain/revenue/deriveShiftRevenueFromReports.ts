import { calculateDailyRevenue } from './calculateShiftRevenue'

export interface ShiftReportSummary {
  reportType: 'X' | 'Z'
  grossRevenue: number
  status: 'submitted' | 'edited' | 'cancelled'
}

/**
 * Bridges the sales_reports table shape (a flat list of X/Z rows for one
 * shift) to calculateDailyRevenue's (morningX, eveningZ) input. Cancelled
 * reports are excluded — a cancelled X/Z must not silently count as "only
 * one reading exists" when in fact zero valid readings exist for that side.
 *
 * Never guesses when both an X and a Z are present for the same side
 * (shouldn't happen — 009's partial unique indexes prevent two active X or
 * two active Z rows per shift/register) but if it ever does due to a data
 * bug, the LAST one in submission order wins rather than silently summing
 * both, since summing would double count.
 */
export function deriveShiftRevenueFromReports(reports: ShiftReportSummary[]): number {
  const active = reports.filter((r) => r.status !== 'cancelled')
  const morningX = active.filter((r) => r.reportType === 'X').at(-1)?.grossRevenue ?? null
  const eveningZ = active.filter((r) => r.reportType === 'Z').at(-1)?.grossRevenue ?? null
  return calculateDailyRevenue({ morningX, eveningZ })
}
