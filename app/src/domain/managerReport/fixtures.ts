import {
  buildDailyAnalytics,
  buildWeeklyAnalytics,
  computeDay,
  weekDates,
  type AnalyticsReportFact,
  type DailyAnalyticsPayload,
  type DayFacts,
  type ExternalContext,
  type SnapshotEnvelope,
  type WeatherDay,
  type WeeklyAnalyticsPayload,
} from '../analytics'
import type { BranchSignals, SignalPart } from '../commandCenter'
import { buildDashboard, resolveCustomPeriod, type BranchRawData, type BranchReportFact } from '../dashboard'
import type { BranchCountOverview, CostMetric, WasteReport } from '../inventory/control'
import type { ProcurementAttention } from '../procurement'
import type { BranchWeather } from '../weather'
import { addDaysIso } from '../../utils/dates'
import type { DayProjection, ManagerReportBranchInput, ManagerReportInputs } from './inputs'
import type { BranchRef, ReportAccess } from './types'

export const ALL_ACCESS: ReportAccess = { financial: true, reports: true, stock: true, weather: true }

/**
 * Synthetic scenario builder for tests, demo/QA and screenshots. It runs the REAL deterministic engines (domain/analytics,
 * domain/dashboard) over invented numbers, so a Fact Pack built from it exercises exactly the production code path. Nothing here is
 * business data.
 */

export interface DaySpec {
  x?: [revenue: number, transactions: number | null]
  z?: [revenue: number, transactions: number | null]
  legacy?: boolean
  recon?: 'OK' | 'WARNING' | 'ERROR'
  /** unit cost for product P1 (a costed sale); absent = the product is uncosted */
  costed?: boolean
  context?: ExternalContext
}

export type BranchSpec = Record<string, DaySpec>

export const FIXTURE_BRANCHES: BranchRef[] = [
  { id: 'b-1', key: 'sube-1', name: 'Merkez Şube' },
  { id: 'b-2', key: 'sube-2', name: 'Sahil Şube' },
]

let seq = 0
function reportsOf(date: string, spec: DaySpec | undefined): AnalyticsReportFact[] {
  if (!spec) return []
  const mk = (type: 'X' | 'Z', v: [number, number | null]): AnalyticsReportFact => {
    seq += 1
    const lines = [{ categoryId: 'cat-gida', categoryKey: 'gida', categoryName: 'Gıda', amount: v[0], quantity: v[1], inventoryItemId: 'P1', inventoryQuantity: Math.max(1, Math.round(v[0] / 100)) }]
    return {
      id: `fx-${seq}`,
      shiftId: type === 'X' ? `${date}-morning` : `${date}-evening`,
      reportType: type,
      status: 'submitted',
      grossRevenue: v[0],
      transactionCount: v[1],
      reconciliationStatus: spec.recon ?? 'OK',
      submittedAt: `${date}T${type === 'X' ? '09' : '20'}:00:00Z`,
      updatedAt: `${date}T${type === 'X' ? '09' : '20'}:00:00Z`,
      isLegacy: spec.legacy ?? false,
      lines,
    }
  }
  return [...(spec.x ? [mk('X', spec.x)] : []), ...(spec.z ? [mk('Z', spec.z)] : [])]
}

const PRODUCTS = [{ id: 'P1', code: 'P1', name: 'Ürün Bir', unit: 'adet' }]

function dayFacts(date: string, spec: DaySpec | undefined): DayFacts {
  return { date, reports: reportsOf(date, spec), products: PRODUCTS, unitCosts: spec?.costed ? { P1: 20 } : {} }
}

const missingContext = (date: string): ExternalContext => ({ state: 'missing', isWeekend: [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) })

export const BASE_NOW = new Date('2026-10-08T09:00:00Z') // Thursday 2026-10-08 12:00 Istanbul

export function dailyEnvelope(branchId: string, date: string, spec: BranchSpec, state: 'current' | 'stale' | 'missing' = 'current'): SnapshotEnvelope<DailyAnalyticsPayload> {
  if (state === 'missing') return { state: 'missing' }
  const payload = buildDailyAnalytics({
    branchId,
    date,
    dayFor: (d) => computeDay(dayFacts(d, spec[d])),
    context: spec[date]?.context ?? missingContext(date),
  })
  return { state, snapshotId: `snap-d-${branchId}-${date}`, version: 1, generatedAt: `${date}T22:00:00Z`, payload }
}

export function weeklyEnvelope(
  branchId: string,
  weekStart: string,
  spec: BranchSpec,
  today: string,
  opts: { state?: 'current' | 'stale' | 'missing'; weatherDays?: WeatherDay[] } = {},
): SnapshotEnvelope<WeeklyAnalyticsPayload> {
  if (opts.state === 'missing') return { state: 'missing' }
  const payload = buildWeeklyAnalytics({
    branchId,
    weekStart,
    today,
    dayFor: (d) => computeDay(dayFacts(d, spec[d])),
    weatherDays: opts.weatherDays ?? [],
    sourceLatestAt: null,
  })
  return { state: opts.state ?? 'current', snapshotId: `snap-w-${branchId}-${weekStart}`, version: 1, generatedAt: `${today}T05:00:00Z`, weekComplete: payload.weekComplete, payload }
}

export function dayProjections(weekStart: string, spec: BranchSpec, today: string): DayProjection[] {
  return weekDates(weekStart).map((date): DayProjection => {
    if (date >= today) return { date, state: 'missing' }
    const core = computeDay(dayFacts(date, spec[date]))
    const ctx = spec[date]?.context ?? missingContext(date)
    return {
      date,
      state: 'present',
      snapshotVersion: 1,
      finalization: core.finalization,
      origin: core.origin,
      reconciliation: core.reports.reconciliation,
      zBelowX: core.warnings.some((w) => w.code === 'z_below_x'),
      multipleReadings: core.warnings.some((w) => w.code === 'multiple_active_readings'),
      context: { state: ctx.state, provenance: ctx.provenance ?? null, temperatureC: ctx.temperatureC ?? null, temperatureMinC: ctx.temperatureMinC ?? null, temperatureMaxC: ctx.temperatureMaxC ?? null, precipitationMm: ctx.precipitationMm ?? null },
    }
  })
}

const avail = <T>(data: T): SignalPart<T> => ({ state: 'available', data })

export const noWaste = (branchId: string, date: string): WasteReport => ({
  branchId,
  from: date,
  to: date,
  entries: 0,
  reversedEntries: 0,
  cost: { state: 'available', value: 0 } as CostMetric,
  costCoverage: { state: 'available', costedEntries: 0, entries: 0 },
  quantityByUnit: [],
  byItem: [],
  byReason: [],
  byEmployee: [],
  byShift: [],
})

export const emptyCounts = (branchId: string, today: string): BranchCountOverview => ({ branchId, today, todayStatus: 'missing', latestCountId: null, latestSummary: null, recent: [] })

export const emptyProcurement = (branchId: string, today: string): ProcurementAttention => ({
  branchId,
  today,
  awaitingApproval: [],
  dueToday: [],
  overdueDelivery: [],
  partiallyReceived: [],
  nextDeliveries: [],
  lowStockNoOpenOrder: [],
  reconciliationWarnings: [],
})

export function signalsFor(branchId: string, today: string, over: Partial<BranchSignals> = {}): BranchSignals {
  return {
    branchId,
    businessDate: today,
    timezone: 'Europe/Istanbul',
    location: { state: 'set' },
    counts: avail(emptyCounts(branchId, today)),
    waste: avail(noWaste(branchId, today)),
    procurement: avail(emptyProcurement(branchId, today)),
    weather: avail<BranchWeather>({ status: 'unavailable', reason: 'no_forecast_loaded', timezone: 'Europe/Istanbul' }),
    analytics: { state: 'unavailable', reason: 'no_snapshot' },
    ...over,
  }
}

/** Dashboard rows (the real X/Z model) for one date across branches. */
export function dashboardFor(branches: readonly BranchRef[], date: string, specs: Record<string, BranchSpec>, opts: { inventoryTracked?: boolean; alertCount?: number } = {}) {
  const raws: BranchRawData[] = branches.map((b) => {
    const spec = specs[b.id]?.[date]
    const reports: BranchReportFact[] = reportsOf(date, spec).map((r) => ({
      shiftId: r.shiftId,
      businessDate: date,
      submittedAt: r.submittedAt,
      reportType: r.reportType,
      grossRevenue: r.grossRevenue,
      status: r.status,
      reconciliationStatus: r.reconciliationStatus,
      origin: r.isLegacy ? 'legacy_import' : 'native',
    }))
    const tracked = opts.inventoryTracked ?? true
    return {
      branchId: b.id,
      branchKey: b.key,
      branchName: b.name,
      period: { reports, shifts: reports.length > 0 ? [{ id: `${b.id}-${date}`, businessDate: date, status: 'closed' }] : [] },
      openReconciliationCount: 0,
      inventoryTracked: tracked,
      inventoryAlertCount: opts.alertCount ?? 0,
      wasteEntryCountInPeriod: 0,
      countsSubmittedInPeriod: 0,
      grossProfit: spec?.z
        ? {
            lines: [
              spec.costed
                ? { inventoryItemId: 'P1', code: 'P1', name: 'Ürün Bir', unit: 'adet', soldQuantity: 10, productRevenue: spec.z[0], cogs: spec.z[0] * 0.4, costedQuantity: 10, uncostedQuantity: 0 }
                : { inventoryItemId: 'P1', code: 'P1', name: 'Ürün Bir', unit: 'adet', soldQuantity: 10, productRevenue: spec.z[0], cogs: 0, costedQuantity: 0, uncostedQuantity: 10 },
            ],
            unmappedCategoryRevenue: 0,
          }
        : null,
    }
  })
  return buildDashboard(resolveCustomPeriod(date, date), raws)
}

export function dailyReportInputs(branches: readonly BranchRef[], date: string, specs: Record<string, BranchSpec>, over: Partial<Record<string, Partial<ManagerReportBranchInput> | null>> = {}): ManagerReportInputs {
  const out: ManagerReportInputs = {}
  for (const b of branches) {
    const o = over[b.id]
    if (o === null) {
      out[b.id] = null
      continue
    }
    out[b.id] = {
      branchId: b.id,
      daily: { envelope: dailyEnvelope(b.id, date, specs[b.id] ?? {}), insights: [] },
      waste: avail(noWaste(b.id, date)),
      counts: avail(emptyCounts(b.id, date)),
      ...o,
      access: o?.access ?? ALL_ACCESS,
    }
  }
  return out
}

export function weeklyReportInputs(branches: readonly BranchRef[], weekStart: string, today: string, specs: Record<string, BranchSpec>, over: Partial<Record<string, Partial<ManagerReportBranchInput> | null>> = {}, weatherDays: WeatherDay[] = []): ManagerReportInputs {
  const out: ManagerReportInputs = {}
  for (const b of branches) {
    const o = over[b.id]
    if (o === null) {
      out[b.id] = null
      continue
    }
    out[b.id] = {
      branchId: b.id,
      weekly: { envelope: weeklyEnvelope(b.id, weekStart, specs[b.id] ?? {}, today, { weatherDays }), insights: [] },
      days: dayProjections(weekStart, specs[b.id] ?? {}, today),
      waste: avail(noWaste(b.id, weekStart)),
      counts: avail(emptyCounts(b.id, today)),
      ...o,
      access: o?.access ?? ALL_ACCESS,
    }
  }
  return out
}

/** A complete, clean synthetic week of finalized days for both branches (Mon 2026-09-28 .. Sun 2026-10-04). */
export function cleanWeekSpec(weekStart: string, revenues: number[], tx = 40, withX = true): BranchSpec {
  const spec: BranchSpec = {}
  weekDates(weekStart).forEach((d, i) => {
    spec[d] = { ...(withX ? { x: [Math.round((revenues[i] ?? 1000) / 2), Math.round(tx / 2)] as [number, number] } : {}), z: [revenues[i] ?? 1000, tx], costed: true }
  })
  return spec
}

export const prevDate = (d: string, n = 1) => addDaysIso(d, -n)
