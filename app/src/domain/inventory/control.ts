import { roundMoney, roundQuantity } from './quantity'

/**
 * Inventory control (fire reporting + closing-count classification).
 *
 * TypeScript TWIN of supabase/migrations/20261006000300_inventory_control_reports.sql. The database is the
 * source of truth: the real app only DISPLAYS what the RPCs return. This module defines the payload types and
 * the pure rules so the synthetic demo service and the unit tests compute exactly what SQL does (shared
 * fixture numbers in control.test.ts and supabase/tests/inventory_control.test.sql).
 */

/** available = exact; partial = value covers only the costed part; unavailable = unknown (never read as 0). */
export type CostState = 'available' | 'partial' | 'unavailable'
export interface CostMetric {
  state: CostState
  /** TRY, only for available/partial (costed part). */
  value?: number
  /** Known cost in kurus: the costed part only (partial), exact (available); null when nothing is costed (unavailable). */
  knownCostKurus?: number | null
  costedQuantity?: number
  totalQuantity?: number
  reason?: 'missing_cost' | 'no_permission'
}

/** Mirror of public.inventory_cost_metric(). A missing cost is NEVER a zero and is never estimated. */
export function costMetric(totalQty: number, costedQty: number, costedValue: number, canSee: boolean): CostMetric {
  if (!canSee) return { state: 'unavailable', reason: 'no_permission' }
  if (totalQty === 0) return { state: 'available', value: 0, knownCostKurus: 0, costedQuantity: 0, totalQuantity: 0 }
  if (costedQty === 0) return { state: 'unavailable', reason: 'missing_cost', knownCostKurus: null, costedQuantity: 0, totalQuantity: totalQty }
  const value = roundMoney(costedValue)
  const known = Math.round(costedValue * 100)
  if (costedQty < totalQty) return { state: 'partial', value, reason: 'missing_cost', knownCostKurus: known, costedQuantity: costedQty, totalQuantity: totalQty }
  return { state: 'available', value, knownCostKurus: known, costedQuantity: costedQty, totalQuantity: totalQty }
}

export type VarianceClass = 'balanced' | 'shortage' | 'surplus'
/**
 * Waste timing status of a SHORTAGE. There is deliberately no "explained_by_waste": the ledger stores only the insertion
 * instant of a waste entry (occurred_at = server clock), not when the waste physically happened, so waste recorded after a
 * count can belong to the counted state or to a later one. It is a candidate (timing_uncertain), never a confirmation.
 */
export type WasteExplanation = 'timing_uncertain' | 'unexplained' | 'not_applicable'

export interface ClassifiedLine {
  classification: VarianceClass
  explanation: WasteExplanation
  /** Waste RECORDED after the count inside its window (same item, not reversed). Waste recorded before the count is already in `expected`. */
  candidateWasteQuantity: number
  /** min(shortage, candidate): how much of the shortage the candidate could at most correspond to. Not a confirmation. */
  potentialExplainedQuantity: number
  /** Always 0 with the current ledger (no effective event time). */
  confirmedExplainedQuantity: number
  /** The whole shortage, since nothing is confirmed. */
  unexplainedQuantity: number
}

/** Mirror of inventory_count_classified_lines(). No tolerance. */
export function classifyCountLine(expected: number, physical: number, candidateWaste: number): ClassifiedLine {
  const variance = roundQuantity(physical - expected)
  const classification: VarianceClass = variance < 0 ? 'shortage' : variance > 0 ? 'surplus' : 'balanced'
  if (classification !== 'shortage') {
    return { classification, explanation: 'not_applicable', candidateWasteQuantity: candidateWaste, potentialExplainedQuantity: 0, confirmedExplainedQuantity: 0, unexplainedQuantity: 0 }
  }
  const shortage = -variance
  return {
    classification,
    explanation: candidateWaste > 0 ? 'timing_uncertain' : 'unexplained',
    candidateWasteQuantity: candidateWaste,
    potentialExplainedQuantity: roundQuantity(Math.min(shortage, candidateWaste)),
    confirmedExplainedQuantity: 0,
    unexplainedQuantity: shortage,
  }
}

export interface QuantityByUnit {
  unit: string
  quantity: number
}

export interface WasteReasonRow {
  id: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  sortOrder: number
}

export interface WasteReport {
  branchId: string
  from: string
  to: string
  entries: number
  reversedEntries: number
  cost: CostMetric
  costCoverage: { state: CostState; costedEntries: number; entries: number }
  quantityByUnit: QuantityByUnit[]
  byItem: Array<{ inventoryItemId: string; code: string; name: string; unit: string; entries: number; quantity: number; cost: CostMetric }>
  byReason: Array<{ reasonCode: string; name: string; entries: number; quantityByUnit: QuantityByUnit[]; cost: CostMetric }>
  byEmployee: Array<{ userId: string | null; name: string; employeeCode: string | null; entries: number; cost: CostMetric }>
  byShift: Array<{ shiftId: string | null; label: string; businessDate: string | null; entries: number; cost: CostMetric }>
}

export interface CountReviewLine {
  inventoryItemId: string
  code: string
  name: string
  unit: string
  expectedQuantity: number
  physicalQuantity: number
  varianceQuantity: number
  classification: VarianceClass
  explanation: {
    status: WasteExplanation
    candidateWasteQuantity: number
    potentialExplainedQuantity: number
    confirmedExplainedQuantity: number
    unexplainedQuantity: number
  }
  varianceValue: CostMetric
}

export interface CountSummary {
  lines: number
  balancedLines: number
  shortageLines: number
  surplusLines: number
  timingUncertainLines: number
  unexplainedLines: number
  unexplainedQuantityByUnit: QuantityByUnit[]
  timingUncertainQuantityByUnit: QuantityByUnit[]
  shortageQuantityByUnit: QuantityByUnit[]
  surplusQuantityByUnit: QuantityByUnit[]
  varianceValue: CostMetric
}

export interface CountReview {
  count: {
    id: string
    branchId: string
    shiftId: string | null
    shiftName: string | null
    businessDate: string
    status: 'submitted' | 'voided'
    submittedAt: string
    submittedBy: { userId: string | null; name: string | null; employeeCode: string | null }
    note: string | null
    voidedAt: string | null
    voidReason: string | null
  }
  summary: CountSummary
  lines: CountReviewLine[]
  method: { expected: string; explanation: string; tolerance: string; precision: string }
}

export interface BranchCountOverview {
  branchId: string
  today: string
  todayStatus: 'submitted' | 'voided_only' | 'missing'
  latestCountId: string | null
  latestSummary: CountSummary | null
  recent: Array<{
    id: string
    businessDate: string
    status: 'submitted' | 'voided'
    submittedAt: string
    shiftId: string | null
    submittedBy: string | null
    employeeCode: string | null
    voidReason: string | null
    summary: CountSummary | null
  }>
}

export interface BranchLocation {
  id: string
  key: string
  name: string
  isActive: boolean
  latitude: number | null
  longitude: number | null
  timezone: string
  address: string | null
  locationLabel: string | null
  hasCoordinates: boolean
}

export const COUNT_METHOD: CountReview['method'] = {
  expected: 'server-side theoretical stock snapshot taken when the count was submitted (already net of waste recorded before it)',
  explanation:
    'a shortage is never confirmed as explained: the ledger records only the insertion time of a waste entry, not when the waste happened. Waste recorded after the count inside its window (same shift, or same business date when the shift is unknown) is a timing_uncertain candidate; otherwise the shortage is unexplained',
  tolerance: 'none: exact quantities',
  precision: 'shift or business date, never finer',
}

/** Mirror of the SQL range rule: latitude -90..90, longitude -180..180, both or neither. */
export function validateCoordinates(latitude: number | null, longitude: number | null): string | null {
  if (latitude === null && longitude === null) return null
  if (latitude === null || longitude === null) return 'Enlem ve boylam birlikte girilmelidir.'
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return 'Enlem -90 ile 90 arasında olmalıdır.'
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return 'Boylam -180 ile 180 arasında olmalıdır.'
  return null
}

/**
 * UI-VISIBILITY ONLY (the server re-checks): mirrors the role -> permission seeds of
 * inventory.waste_reason.manage / inventory.waste_report.read / inventory.count_review.read / branch.manage.
 */
export const canManageWasteReasons = (roles: readonly string[]): boolean => roles.includes('owner') || roles.includes('manager')
export const canReviewControl = (roles: readonly string[]): boolean =>
  roles.includes('owner') || roles.includes('manager') || roles.includes('branch_manager')
export const canManageBranchLocation = (roles: readonly string[]): boolean => roles.includes('owner') || roles.includes('manager')

export type ReportPeriod = 'today' | 'week' | 'month' | 'custom'

/** Istanbul calendar dates [from, to] for the quick periods (week = the last 7 days incl. today, month = month to date). */
export function periodRange(period: Exclude<ReportPeriod, 'custom'>, today: string): { from: string; to: string } {
  const [y = '1970', m = '01', d = '01'] = today.split('-')
  if (period === 'today') return { from: today, to: today }
  if (period === 'month') return { from: `${y}-${m}-01`, to: today }
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) - 6))
  return { from: date.toISOString().slice(0, 10), to: today }
}
