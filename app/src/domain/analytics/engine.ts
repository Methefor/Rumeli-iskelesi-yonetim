import { addDaysIso } from '../../utils/dates'
import { DEFAULT_ANALYTICS_SETTINGS, type AnalyticsSettings } from './settings'
import { isoWeekday, weekDates } from './week'
import type {
  AnalyticsOrigin,
  Capability,
  CategoryFinancial,
  CategoryVolume,
  Comparison,
  Completeness,
  DailyAnalyticsPayload,
  DayCore,
  DayWarning,
  ExternalContext,
  Finalization,
  MetricValue,
  PeriodComparisons,
  ProductFinancial,
  ProductVolume,
  WeatherEffect,
  WeekDayRow,
  WeekProductRow,
  WeeklyAnalyticsPayload,
} from './types'

/**
 * Deterministic analytics engine (TypeScript twin of the SQL functions in
 * supabase/migrations/20261006000100_analytics_engine_v1.sql). SQL is
 * authoritative in production; this twin exists for demo mode and so that the
 * formulas are unit-tested against the SAME fixture numbers as the SQL suite.
 * AI is never involved: every number here is arithmetic over the facts.
 *
 * REVENUE (business-day level; morning = X, evening = Z, Z already includes X):
 *   FINALIZED   an active Z exists -> finalized revenue = Z exactly (never normalized or increased by X;
 *               Z < X keeps Z and raises a `z_below_x` warning; X and Z are never two revenues)
 *   PROVISIONAL only an X exists   -> finalized revenue is null; X is exposed as `provisionalRevenue`; not final
 * Inherited behaviour (not changed here): with several active readings of one type (registers/shifts)
 * the LATEST (submittedAt, id) wins, and a `multiple_active_readings` warning is emitted.
 *
 * LINE DETAIL (category / product): the X/Z reconciliation is deliberately NOT applied to lines - whether
 * Z item lines are cumulative of X is an open owner decision. One reading only -> its lines as reported
 * (partial); both readings -> `unsupported` (xz_line_semantics_unknown). Legacy-imported readings never
 * support product detail or gross profit (legacy_source_limitation).
 */

/** Kept for callers that only need the thresholds: the central defaults. */
export const ANALYTICS_PARAMS: AnalyticsSettings = { ...DEFAULT_ANALYTICS_SETTINGS }

// ---------------------------------------------------------------------------
// Input facts
// ---------------------------------------------------------------------------

export interface AnalyticsLineFact {
  categoryId: string
  categoryKey: string
  categoryName: string
  amount: number
  /** Category-level piece count (legacy `quantity`). */
  quantity: number | null
  inventoryItemId: string | null
  inventoryQuantity: number | null
}

export interface AnalyticsReportFact {
  id: string
  shiftId: string
  reportType: 'X' | 'Z'
  status: 'submitted' | 'edited' | 'cancelled'
  grossRevenue: number
  transactionCount: number | null
  reconciliationStatus: 'OK' | 'WARNING' | 'ERROR'
  submittedAt: string
  updatedAt: string
  /** true for a report created by the legacy import. */
  isLegacy?: boolean
  lines: AnalyticsLineFact[]
}

export interface AnalyticsProductFact {
  id: string
  code: string
  name: string
  unit: string
}

export interface DayFacts {
  date: string
  /** Every report of the day's shifts, cancelled ones included. */
  reports: readonly AnalyticsReportFact[]
  products: readonly AnalyticsProductFact[]
  /** Quantity-weighted unit_cost_snapshot of the day's SALE movements, per item. Missing = uncosted. */
  unitCosts: Readonly<Record<string, number>>
}

// ---------------------------------------------------------------------------
// Number helpers
// ---------------------------------------------------------------------------

/** round half away from zero, like SQL numeric round(); 12 significant digits absorb float noise (e.g. -0.04999999999999716) */
function roundTo(n: number, digits: number): number {
  const f = 10 ** digits
  const v = Number((Math.abs(n) * f).toPrecision(12))
  const r = (Math.sign(n) * Math.floor(v + 0.5)) / f
  return r === 0 ? 0 : r
}
const r2 = (n: number) => roundTo(n, 2)

const metric = (state: MetricValue['state'], value?: number, reason?: string): MetricValue => {
  const m: MetricValue = { state }
  if (value !== undefined && value !== null) m.value = value
  if (reason) m.reason = reason
  return m
}
const cap = (status: Capability['status'], ...reasons: string[]): Capability => ({ status, reasons })
const value = (m: MetricValue | undefined): number | null => (m?.value === undefined ? null : m.value)

function latest(reports: readonly AnalyticsReportFact[], type: 'X' | 'Z'): AnalyticsReportFact | undefined {
  return [...reports]
    .filter((r) => r.reportType === type)
    .sort((a, b) => (a.submittedAt === b.submittedAt ? (a.id < b.id ? -1 : 1) : a.submittedAt < b.submittedAt ? -1 : 1))
    .at(-1)
}

// ---------------------------------------------------------------------------
// Day core
// ---------------------------------------------------------------------------

export function computeDay(facts: DayFacts): DayCore {
  const all = facts.reports
  const active = all.filter((r) => r.status !== 'cancelled')
  const x = latest(active, 'X')
  const z = latest(active, 'Z')
  const hasX = Boolean(x)
  const hasZ = Boolean(z)
  const fin: Finalization = hasZ ? 'finalized' : hasX ? 'provisional' : 'no_data'
  // finalized revenue is Z exactly (never normalized by X); an X-only day has no finalized revenue
  const revenue = z ? z.grossRevenue : (x?.grossRevenue ?? 0)
  const tx: number | null = z ? z.transactionCount : x ? x.transactionCount : null

  const used = [x, z].filter((r): r is AnalyticsReportFact => Boolean(r))
  const origin: AnalyticsOrigin =
    used.length === 0 ? 'none' : used.every((r) => r.isLegacy) ? 'legacy_import' : used.some((r) => r.isLegacy) ? 'mixed' : 'native'
  const legacyish = origin === 'legacy_import' || origin === 'mixed'

  // line detail capability (see header)
  const xl = x?.lines ?? []
  const zl = z?.lines ?? []
  const anyLines = xl.length + zl.length > 0
  const anyProductLines = [...xl, ...zl].some((l) => l.inventoryItemId !== null)
  const catState: 'unavailable' | 'unsupported' | 'partial' = !anyLines ? 'unavailable' : hasX && hasZ ? 'unsupported' : 'partial'
  const prodState: 'unavailable' | 'unsupported' | 'partial' = legacyish
    ? 'unsupported'
    : !anyProductLines
      ? 'unavailable'
      : hasX && hasZ
        ? 'unsupported'
        : 'partial'
  const emit = hasX && !hasZ ? xl : hasZ && !hasX ? zl : []
  const lineReason = hasZ ? 'z_line_semantics_unverified' : 'missing_z'

  // categories
  const catMap = new Map<string, { id: string; key: string; name: string; revenue: number; qty: number | null; missing: boolean }>()
  if (catState === 'partial') {
    for (const l of emit) {
      const c = catMap.get(l.categoryId) ?? { id: l.categoryId, key: l.categoryKey, name: l.categoryName, revenue: 0, qty: null, missing: false }
      c.revenue += l.amount
      if (l.inventoryItemId === null) {
        if (l.quantity === null) c.missing = true
        else c.qty = (c.qty ?? 0) + l.quantity
      }
      catMap.set(l.categoryId, c)
    }
  }
  const cats = [...catMap.values()].sort((a, b) => (a.key < b.key ? -1 : 1))

  // products
  const prodMap = new Map<string, { revenue: number; qty: number | null }>()
  if (prodState === 'partial') {
    for (const l of emit) {
      if (!l.inventoryItemId) continue
      const p = prodMap.get(l.inventoryItemId) ?? { revenue: 0, qty: null }
      p.revenue += l.amount
      if (l.inventoryQuantity !== null) p.qty = (p.qty ?? 0) + l.inventoryQuantity
      prodMap.set(l.inventoryItemId, p)
    }
  }
  const prods = [...prodMap.entries()]
    .map(([id, p]) => {
      const meta = facts.products.find((m) => m.id === id)
      return { id, code: meta?.code ?? id, name: meta?.name ?? id, unit: meta?.unit ?? '', ...p, unitCost: facts.unitCosts[id] ?? null }
    })
    .sort((a, b) => (a.code < b.code ? -1 : 1))

  const costed = prods.filter((p) => p.unitCost !== null && p.qty !== null)
  const gpCovered = costed.reduce((s, p) => s + p.revenue, 0)
  const gp = costed.reduce((s, p) => s + (p.revenue - (p.qty as number) * (p.unitCost as number)), 0)

  const volumeCategories: CategoryVolume[] = cats.map((c) => ({ categoryId: c.id, key: c.key, name: c.name, quantity: c.qty, quantityMissing: c.missing }))
  const volumeProducts: ProductVolume[] = prods.map((p) => ({ inventoryItemId: p.id, code: p.code, name: p.name, unit: p.unit, quantity: p.qty }))
  const financialCategories: CategoryFinancial[] = cats.map((c) => ({
    categoryId: c.id,
    key: c.key,
    name: c.name,
    revenue: r2(c.revenue),
    share: revenue > 0 ? roundTo(c.revenue / revenue, 4) : null,
  }))
  const financialProducts: ProductFinancial[] = prods.map((p) => ({
    inventoryItemId: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    quantity: p.qty,
    revenue: r2(p.revenue),
    averageUnitPrice: p.qty !== null && p.qty > 0 ? roundTo(p.revenue / p.qty, 4) : null,
    unitCost: p.unitCost === null ? null : roundTo(p.unitCost, 4),
    costState: p.unitCost === null ? 'uncosted' : 'costed',
    grossProfit: p.unitCost !== null && p.qty !== null ? r2(p.revenue - p.qty * p.unitCost) : null,
  }))

  const txMetric: MetricValue =
    fin === 'no_data'
      ? metric('unavailable', undefined, 'no_reports')
      : tx === null
        ? metric('unavailable', undefined, 'transaction_count_missing')
        : fin === 'provisional'
          ? metric('partial', tx, 'missing_z')
          : metric('available', tx)
  const basket: MetricValue =
    fin === 'no_data'
      ? metric('unavailable', undefined, 'no_reports')
      : fin === 'provisional'
        ? metric('unavailable', undefined, 'missing_z')
        : tx === null
          ? metric('unavailable', undefined, 'transaction_count_missing')
          : tx === 0
            ? metric('unavailable', undefined, 'zero_transactions')
            : metric('available', r2(revenue / tx))
  const revMetric: MetricValue = fin === 'provisional' ? metric('unavailable', undefined, 'missing_z') : metric('available', r2(revenue))

  const anyQty = cats.some((c) => c.qty !== null)
  const itemQty: MetricValue =
    catState === 'unsupported'
      ? metric('unsupported', undefined, 'xz_line_semantics_unknown')
      : !anyQty
        ? metric('unavailable', undefined, 'missing_category_detail')
        : metric('partial', cats.reduce((s, c) => s + (c.qty ?? 0), 0), lineReason)

  const gpMetric: MetricValue =
    prodState === 'unsupported'
      ? metric('unsupported', undefined, legacyish ? 'legacy_source_limitation' : 'xz_line_semantics_unknown')
      : prodState === 'unavailable'
        ? metric('unavailable', undefined, 'missing_product_detail')
        : gpCovered <= 0
          ? metric('unavailable', undefined, 'missing_cost')
          : metric('partial', r2(gp), gpCovered + 0.005 < revenue ? 'missing_cost' : 'line_semantics_unverified')

  const warnings: DayWarning[] = []
  const xn = active.filter((r) => r.reportType === 'X').length
  const zn = active.filter((r) => r.reportType === 'Z').length
  if (xn > 1) warnings.push({ code: 'multiple_active_readings', type: 'X', count: xn })
  if (zn > 1) warnings.push({ code: 'multiple_active_readings', type: 'Z', count: zn })
  if (x && z && z.grossRevenue < x.grossRevenue) warnings.push({ code: 'z_below_x' })

  const txCapReasons = ['missing_transaction_count', ...(legacyish ? ['legacy_source_limitation'] : [])]
  const capabilities: Record<string, Capability> = {
    revenue: fin === 'finalized' ? cap('complete') : fin === 'provisional' ? cap('partial', 'missing_z') : cap('partial', 'no_reports'),
    transactions:
      fin === 'no_data'
        ? cap('partial', 'no_reports')
        : tx === null
          ? cap('partial', ...txCapReasons)
          : fin === 'provisional'
            ? cap('partial', 'missing_z')
            : cap('complete'),
    averageBasket:
      fin === 'no_data'
        ? cap('partial', 'no_reports')
        : tx === null
          ? cap('partial', ...txCapReasons)
          : tx === 0
            ? cap('partial', 'zero_transactions')
            : fin === 'provisional'
              ? cap('partial', 'missing_z')
              : cap('complete'),
    categories:
      catState === 'unavailable'
        ? cap('partial', 'missing_category_detail')
        : catState === 'unsupported'
          ? cap('unsupported', 'xz_line_semantics_unknown')
          : cap('partial', lineReason),
    products:
      prodState === 'unavailable'
        ? cap('partial', 'missing_product_detail')
        : prodState === 'unsupported'
          ? cap('unsupported', legacyish ? 'legacy_source_limitation' : 'xz_line_semantics_unknown')
          : cap('partial', lineReason),
    grossProfit: cap(gpMetric.state === 'unsupported' ? 'unsupported' : 'partial', gpMetric.reason ?? ''),
    hourly: cap('unsupported', 'no_hourly_source'),
  }

  return {
    date: facts.date,
    hasData: fin !== 'no_data',
    finalization: fin,
    origin,
    sourceLatestAt: [...all.map((r) => r.updatedAt)].sort().at(-1) ?? null,
    reports: {
      active: active.length,
      cancelled: all.length - active.length,
      x: xn,
      z: zn,
      reconciliation: {
        OK: active.filter((r) => r.reconciliationStatus === 'OK').length,
        WARNING: active.filter((r) => r.reconciliationStatus === 'WARNING').length,
        ERROR: active.filter((r) => r.reconciliationStatus === 'ERROR').length,
      },
    },
    readings: {
      x: { present: hasX, revenue: x?.grossRevenue ?? null, transactions: x?.transactionCount ?? null },
      z: { present: hasZ, revenue: z?.grossRevenue ?? null, transactions: z?.transactionCount ?? null },
    },
    warnings,
    volume: { transactions: txMetric, itemQuantity: itemQty, categories: volumeCategories, products: volumeProducts },
    financial: {
      grossRevenue: revMetric,
      provisionalRevenue: fin === 'provisional' ? r2(x?.grossRevenue ?? 0) : null,
      averageBasket: basket,
      categories: financialCategories,
      products: financialProducts,
      grossProfit: {
        grossOnly: true,
        metric: gpMetric,
        coveredRevenue: r2(gpCovered),
        uncoveredRevenue: r2(Math.max(revenue - gpCovered, 0)),
      },
    },
    capabilities,
  }
}

// ---------------------------------------------------------------------------
// Comparisons
// ---------------------------------------------------------------------------

export interface CompareOptions {
  samples?: number
  minSamples?: number
  currentFinal?: boolean
  baselineFinal?: boolean
  mixed?: boolean
  blockMixed?: boolean
}

/**
 * Current value against a baseline value. A percentage is only produced from a real, FINAL, comparable,
 * non-trivial base: `not_final` (provisional current), `no_baseline` (no data - never a fabricated 0),
 * `baseline_not_final`, `mixed_origin` (blocked metrics), `insufficient_samples`, `zero_base`, `low_base`
 * (delta only), `no_current`, else `ok`.
 */
export function compare(
  current: number | null,
  baseline: number | null,
  baselineHasData: boolean,
  lowBase: number,
  o: CompareOptions = {},
): Comparison {
  const { samples, minSamples, currentFinal = true, baselineFinal = true, mixed = false, blockMixed = false } = o
  const flag = (c: Comparison): Comparison => (mixed ? { ...c, mixedOrigin: true } : c)
  if (!currentFinal) return { state: 'not_final' }
  if (!baselineHasData) return { state: 'no_baseline' }
  if (!baselineFinal) return { state: 'baseline_not_final' }
  if (baseline === null) return { state: 'no_baseline' }
  if (blockMixed && mixed) return { state: 'mixed_origin' }
  const withSamples = (c: Comparison): Comparison => flag(samples === undefined ? c : { ...c, samples })
  if (minSamples !== undefined && (samples ?? 0) < minSamples) return flag({ state: 'insufficient_samples', samples })
  if (current === null) return flag({ state: 'no_current', baseline: r2(baseline) })
  if (baseline === 0) return withSamples({ state: 'zero_base', baseline: 0, delta: r2(current) })
  if (baseline < lowBase) return withSamples({ state: 'low_base', baseline: r2(baseline), delta: r2(current - baseline) })
  return withSamples({
    state: 'ok',
    baseline: r2(baseline),
    delta: r2(current - baseline),
    pct: roundTo(((current - baseline) / baseline) * 100, 1),
  })
}

export function originMixed(a: AnalyticsOrigin, b: AnalyticsOrigin): boolean {
  return a !== 'none' && b !== 'none' && (a === 'mixed' || b === 'mixed' || a !== b)
}

function completeness(caps: Record<string, Capability>, hasData: boolean): Completeness {
  const reasons = [...new Set(Object.values(caps).flatMap((c) => c.reasons))].sort()
  return {
    overall: !hasData ? 'no_data' : caps.revenue?.status === 'complete' && caps.transactions?.status === 'complete' ? 'complete' : 'partial',
    reasons,
    metrics: caps,
  }
}

const availableValue = (m: MetricValue | undefined): number | null => (m?.state === 'available' ? (m.value ?? null) : null)
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null)

export interface DailyBuildInput {
  branchId: string
  date: string
  /** Day cores for any date (the caller loads facts for date, date-1 and date-7k). */
  dayFor: (date: string) => DayCore
  context: ExternalContext
  settings?: AnalyticsSettings
}

export function buildDailyAnalytics({ branchId, date, dayFor, context, settings = DEFAULT_ANALYTICS_SETTINGS }: DailyBuildInput): DailyAnalyticsPayload {
  const p = settings
  const cur = dayFor(date)
  const prev = dayFor(addDaysIso(date, -1))
  const pw = dayFor(addDaysIso(date, -7))
  const curFinal = cur.finalization === 'finalized'

  // baseline: only FINALIZED same-weekday days (a provisional X-only day is never a baseline sample)
  const samples: DayCore[] = []
  for (let k = 1; k <= p.baselineWeeks; k += 1) {
    const d = dayFor(addDaysIso(date, -7 * k))
    if (d.finalization === 'finalized') samples.push(d)
  }
  const revSamples = samples.map((d) => value(d.financial.grossRevenue) as number)
  const txDays = samples.filter((d) => d.volume.transactions.state === 'available')
  const basketDays = samples.filter((d) => d.financial.averageBasket.state === 'available')

  const curRev = value(cur.financial.grossRevenue)
  const curTx = availableValue(cur.volume.transactions)
  const curBasket = availableValue(cur.financial.averageBasket)

  const single = (curValue: number | null, other: DayCore, get: (d: DayCore) => number | null, has: boolean, low: number, block: boolean): Comparison =>
    compare(curValue, get(other), has, low, {
      currentFinal: curFinal,
      baselineFinal: other.finalization === 'finalized',
      mixed: originMixed(cur.origin, other.origin),
      blockMixed: block,
    })

  const triple = (
    curValue: number | null,
    get: (d: DayCore) => number | null,
    hasOf: (d: DayCore) => boolean,
    low: number,
    seriesDays: DayCore[],
    block: boolean,
  ): PeriodComparisons => {
    const series = seriesDays.map((d) => get(d) as number)
    return {
      previousDay: single(curValue, prev, get, hasOf(prev), low, block),
      previousWeekSameWeekday: single(curValue, pw, get, hasOf(pw), low, block),
      baseline4SameWeekday: compare(curValue, mean(series), series.length > 0, low, {
        samples: series.length,
        minSamples: p.minBaselineSamples,
        currentFinal: curFinal,
        baselineFinal: true,
        mixed: seriesDays.some((d) => originMixed(cur.origin, d.origin)),
        blockMixed: block,
      }),
    }
  }

  const caps: Record<string, Capability> = {
    ...cur.capabilities,
    context: context.state === 'present' ? cap('complete') : cap('partial', 'missing_context'),
  }

  return {
    schemaVersion: 2,
    scope: 'daily',
    branchId,
    businessDate: date,
    isoWeekday: isoWeekday(date),
    timezone: 'Europe/Istanbul',
    params: p,
    finalization: cur.finalization,
    origin: cur.origin,
    sourceLatestAt: cur.sourceLatestAt,
    hasData: cur.hasData,
    reports: cur.reports,
    readings: cur.readings,
    warnings: cur.warnings,
    volume: cur.volume,
    financial: cur.financial,
    context,
    completeness: completeness(caps, cur.hasData),
    volumeComparisons: {
      transactions: triple(curTx, (d) => availableValue(d.volume.transactions), (d) => d.volume.transactions.state === 'available', p.lowVolumeBaseTransactions, txDays, true),
    },
    financialComparisons: {
      grossRevenue: {
        previousDay: single(curRev, prev, (d) => value(d.financial.grossRevenue), prev.hasData, p.lowVolumeBaseRevenue, false),
        previousWeekSameWeekday: single(curRev, pw, (d) => value(d.financial.grossRevenue), pw.hasData, p.lowVolumeBaseRevenue, false),
        baseline4SameWeekday: compare(curRev, mean(revSamples), revSamples.length > 0, p.lowVolumeBaseRevenue, {
          samples: revSamples.length,
          minSamples: p.minBaselineSamples,
          currentFinal: curFinal,
          baselineFinal: true,
          mixed: samples.some((d) => originMixed(cur.origin, d.origin)),
        }),
      },
      averageBasket: triple(curBasket, (d) => availableValue(d.financial.averageBasket), (d) => d.financial.averageBasket.state === 'available', 0, basketDays, true),
    },
    baselineSamples: { sameWeekdayFinalizedDays: samples.length, of: p.baselineWeeks },
    peakHour: {
      state: 'unsupported',
      reason: 'sales reports are shift-level readings; no per-transaction or hourly timestamps exist in the source',
    },
  }
}

// ---------------------------------------------------------------------------
// Weather / context relationship (weekday-adjusted, never causal; finalized days only)
// ---------------------------------------------------------------------------

export interface WeatherDay {
  date: string
  revenue: number
  temperatureC: number | null
  precipitationMm: number | null
}

export function weatherEffect(days: readonly WeatherDay[], settings: AnalyticsSettings = DEFAULT_ANALYTICS_SETTINGS): WeatherEffect {
  const p = settings
  if (days.length === 0) return { state: 'no_context', confidence: 'relationship', sample: 0 }

  const byDow = new Map<number, number[]>()
  for (const d of days) {
    const dow = isoWeekday(d.date)
    byDow.set(dow, [...(byDow.get(dow) ?? []), d.revenue])
  }
  const idx = days.map((d) => {
    const list = byDow.get(isoWeekday(d.date)) as number[]
    const m = list.reduce((s, x) => s + x, 0) / list.length
    return { ...d, i: m === 0 ? null : d.revenue / m }
  })
  const withTemp = idx.filter((d) => d.i !== null && d.temperatureC !== null)
  if (withTemp.length < p.minCorrelationSamples) {
    return { state: 'insufficient_sample', confidence: 'relationship', sample: withTemp.length, required: p.minCorrelationSamples, withContext: days.length }
  }
  const xs = withTemp.map((d) => d.temperatureC as number)
  const ys = withTemp.map((d) => d.i as number)
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length
  const my = ys.reduce((s, y) => s + y, 0) / ys.length
  const sxy = xs.reduce((s, x, k) => s + (x - mx) * ((ys[k] as number) - my), 0)
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const syy = ys.reduce((s, y) => s + (y - my) ** 2, 0)
  const r = sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy)

  const rainy = idx.filter((d) => d.i !== null && d.precipitationMm !== null && d.precipitationMm >= p.rainMmThreshold)
  const dry = idx.filter((d) => d.i !== null && d.precipitationMm !== null && d.precipitationMm < p.rainMmThreshold)
  const avg = (xsx: number[]) => xsx.reduce((s, x) => s + x, 0) / xsx.length
  const out: WeatherEffect = {
    state: 'ok',
    confidence: 'relationship',
    sample: withTemp.length,
    required: p.minCorrelationSamples,
    withContext: days.length,
    method: 'revenue index = day revenue / mean revenue of the same ISO weekday in the window (finalized days only)',
    caveat: 'Association between weather and weekday-adjusted revenue; it does not show that weather caused the difference.',
  }
  if (r !== null) out.temperatureCorrelation = { r: roundTo(r, 3), n: withTemp.length }
  out.rainEffect =
    rainy.length >= p.minGroupSamples && dry.length >= p.minGroupSamples
      ? {
          rainyDays: rainy.length,
          dryDays: dry.length,
          rainyIndex: roundTo(avg(rainy.map((d) => d.i as number)), 3),
          dryIndex: roundTo(avg(dry.map((d) => d.i as number)), 3),
          differencePct: roundTo(((avg(rainy.map((d) => d.i as number)) - avg(dry.map((d) => d.i as number))) / avg(dry.map((d) => d.i as number))) * 100, 1),
        }
      : { state: 'insufficient_group_sample', rainyDays: rainy.length, dryDays: dry.length, required: p.minGroupSamples }
  return out
}

// ---------------------------------------------------------------------------
// Weekly
// ---------------------------------------------------------------------------

const uniq = (xs: string[]) => [...new Set(xs)].sort()

function weekTotals(days: readonly DayCore[], weekComplete: boolean) {
  const rows: WeekDayRow[] = []
  let withData = 0
  let finalDays = 0
  let provDays = 0
  let rev = 0
  let provRev = 0
  let tx = 0
  let txAvail = 0
  let txPartial = 0
  let txMissing = 0
  let covRev = 0
  let covTx = 0
  let basketDays = 0
  let items = 0
  let itemsN = 0
  let gp = 0
  let gpCov = 0
  let gpPartial = 0
  let gpUnsupported = 0
  let catPartial = 0
  let catUnsupported = 0
  let prodPartial = 0
  let prodUnsupported = 0
  let hasNative = false
  let hasLegacy = false
  const reasons = { cat: [] as string[], prod: [] as string[], gp: [] as string[] }

  for (const d of days) {
    if (d.hasData) {
      withData += 1
      if (d.finalization === 'finalized') finalDays += 1
      else provDays += 1
      rev += value(d.financial.grossRevenue) ?? 0
      provRev += d.financial.provisionalRevenue ?? 0
      if (d.origin === 'native' || d.origin === 'mixed') hasNative = true
      if (d.origin === 'legacy_import' || d.origin === 'mixed') hasLegacy = true
      const t = value(d.volume.transactions)
      if (d.volume.transactions.state === 'available') {
        txAvail += 1
        tx += t as number
      } else if (d.volume.transactions.state === 'partial') {
        txPartial += 1
        tx += t as number
      } else txMissing += 1
      if (value(d.financial.averageBasket) !== null && t !== null) {
        basketDays += 1
        covRev += value(d.financial.grossRevenue) ?? 0
        covTx += t
      }
      const q = value(d.volume.itemQuantity)
      if (q !== null) {
        items += q
        itemsN += 1
      }
      if (d.capabilities.categories?.status === 'partial') {
        if (d.financial.categories.length > 0) catPartial += 1
      } else if (d.capabilities.categories?.status === 'unsupported') catUnsupported += 1
      if (d.capabilities.products?.status === 'unsupported') prodUnsupported += 1
      else if (d.financial.products.length > 0) prodPartial += 1
      if (d.financial.grossProfit.metric.state === 'partial') {
        gpPartial += 1
        gp += d.financial.grossProfit.metric.value ?? 0
      } else if (d.financial.grossProfit.metric.state === 'unsupported') gpUnsupported += 1
      gpCov += d.financial.grossProfit.coveredRevenue
      reasons.cat.push(...(d.capabilities.categories?.reasons ?? []))
      reasons.prod.push(...(d.capabilities.products?.reasons ?? []))
      reasons.gp.push(...(d.capabilities.grossProfit?.reasons ?? []))
    }
    rows.push({
      date: d.date,
      hasData: d.hasData,
      finalization: d.finalization,
      origin: d.origin,
      grossRevenue: value(d.financial.grossRevenue),
      provisionalRevenue: d.financial.provisionalRevenue,
      transactions: value(d.volume.transactions),
      averageBasket: value(d.financial.averageBasket),
    })
  }

  const origin: AnalyticsOrigin = withData === 0 ? 'none' : hasNative && hasLegacy ? 'mixed' : hasLegacy ? 'legacy_import' : 'native'
  const final = weekComplete && withData > 0 && provDays === 0

  const cats = new Map<string, CategoryFinancial>()
  const prods = new Map<string, WeekProductRow>()
  for (const d of days) {
    for (const c of d.financial.categories) {
      const e = cats.get(c.categoryId) ?? { ...c, revenue: 0, share: null }
      e.revenue += c.revenue
      cats.set(c.categoryId, e)
    }
    for (const pr of d.financial.products) {
      const e = prods.get(pr.inventoryItemId) ?? {
        inventoryItemId: pr.inventoryItemId,
        code: pr.code,
        name: pr.name,
        unit: pr.unit,
        quantity: null,
        revenue: 0,
        grossProfit: null,
        costedDays: 0,
        days: 0,
      }
      if (pr.quantity !== null) e.quantity = (e.quantity ?? 0) + pr.quantity
      e.revenue += pr.revenue
      if (pr.grossProfit !== null) e.grossProfit = (e.grossProfit ?? 0) + pr.grossProfit
      if (pr.costState === 'costed') e.costedDays += 1
      e.days += 1
      prods.set(pr.inventoryItemId, e)
    }
  }
  const categories = [...cats.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((c) => ({ ...c, revenue: r2(c.revenue), share: rev > 0 ? roundTo(c.revenue / rev, 4) : null }))
  const products = [...prods.values()]
    .sort((a, b) => b.revenue - a.revenue || (a.code < b.code ? -1 : 1))
    .map((e) => ({ ...e, revenue: r2(e.revenue), grossProfit: e.grossProfit === null ? null : r2(e.grossProfit) }))

  const txState = withData === 0 ? 'unavailable' : txAvail + txPartial === 0 ? 'unavailable' : txMissing > 0 || txPartial > 0 || !final ? 'partial' : 'available'
  const basketState = basketDays === 0 ? 'unavailable' : basketDays < withData || provDays > 0 || !final ? 'partial' : 'available'
  const legacyish = origin === 'legacy_import' || origin === 'mixed'

  const keep = (xs: Array<string | false | null>) => xs.filter((x): x is string => Boolean(x))
  const caps: Record<string, Capability> = {
    revenue: final ? cap('complete') : cap('partial', ...keep([withData === 0 && 'no_reports', provDays > 0 && 'missing_z', !weekComplete && 'week_in_progress'])),
    transactions:
      txState === 'available'
        ? cap('complete')
        : cap(
            'partial',
            ...keep([
              withData === 0 && 'no_reports',
              provDays > 0 && 'missing_z',
              (txMissing > 0 || (withData > 0 && txAvail + txPartial === 0)) && 'missing_transaction_count',
              legacyish && txMissing > 0 && 'legacy_source_limitation',
              !weekComplete && 'week_in_progress',
            ]),
          ),
    averageBasket:
      basketState === 'available'
        ? cap('complete')
        : cap(
            'partial',
            ...keep([
              withData === 0 && 'no_reports',
              provDays > 0 && 'missing_z',
              basketDays < withData && 'missing_transaction_count',
              legacyish && basketDays < withData && 'legacy_source_limitation',
              !weekComplete && 'week_in_progress',
            ]),
          ),
    categories: catPartial > 0 ? cap('partial', ...uniq(reasons.cat)) : catUnsupported > 0 ? cap('unsupported', ...uniq(reasons.cat)) : cap('partial', 'missing_category_detail'),
    products: prodPartial > 0 ? cap('partial', ...uniq(reasons.prod)) : prodUnsupported > 0 ? cap('unsupported', ...uniq(reasons.prod)) : cap('partial', 'missing_product_detail'),
    grossProfit: gpPartial > 0 ? cap('partial', ...uniq(reasons.gp)) : gpUnsupported > 0 ? cap('unsupported', ...uniq(reasons.gp)) : cap('partial', 'missing_cost'),
    hourly: cap('unsupported', 'no_hourly_source'),
  }

  const basketValue = covTx > 0 ? r2(covRev / covTx) : null
  return {
    daysWithData: withData,
    finalizedDays: finalDays,
    provisionalDays: provDays,
    origin,
    final,
    volume: {
      transactions:
        txState === 'unavailable'
          ? metric('unavailable', undefined, withData === 0 ? 'no_reports' : 'transaction_count_missing')
          : txState === 'partial'
            ? metric('partial', tx, provDays > 0 ? 'missing_z' : txMissing > 0 ? 'missing_transaction_count' : 'week_in_progress')
            : metric('available', tx),
      itemQuantity: itemsN === 0 ? metric('unavailable', undefined, 'missing_category_detail') : metric('partial', items, 'z_line_semantics_unverified'),
    },
    financial: {
      grossRevenue: final ? metric('available', r2(rev)) : withData === 0 ? metric('available', 0) : metric('partial', r2(rev), provDays > 0 ? 'missing_z' : 'week_in_progress'),
      provisionalRevenue: provDays > 0 ? r2(provRev) : null,
      averageBasket:
        basketState === 'unavailable'
          ? metric('unavailable', undefined, 'transaction_count_missing')
          : basketState === 'partial'
            ? metric('partial', basketValue ?? undefined, provDays > 0 ? 'missing_z' : 'missing_transaction_count')
            : metric('available', basketValue ?? undefined),
      categories,
      products,
      grossProfit: {
        grossOnly: true as const,
        metric:
          gpPartial > 0
            ? metric('partial', r2(gp), 'line_semantics_unverified')
            : gpUnsupported > 0
              ? metric('unsupported', undefined, 'xz_line_semantics_unknown')
              : metric('unavailable', undefined, 'missing_cost'),
        coveredRevenue: r2(gpCov),
        uncoveredRevenue: r2(Math.max(rev - gpCov, 0)),
      },
    },
    days: rows,
    capabilities: caps,
    txAvailableValue: txState === 'available' ? tx : null,
    basketAvailableValue: basketState === 'available' ? basketValue : null,
  }
}

export interface WeeklyBuildInput {
  branchId: string
  weekStart: string
  /** Business date "today" in Istanbul (decides whether the week has ended). */
  today: string
  dayFor: (date: string) => DayCore
  /** Finalized days of the trailing weather window that have a context row. */
  weatherDays: readonly WeatherDay[]
  sourceLatestAt: string | null
  settings?: AnalyticsSettings
}

export function buildWeeklyAnalytics({ branchId, weekStart, today, dayFor, weatherDays, sourceLatestAt, settings = DEFAULT_ANALYTICS_SETTINGS }: WeeklyBuildInput): WeeklyAnalyticsPayload {
  const p = settings
  const weekEnd = addDaysIso(weekStart, 6)
  const complete = weekEnd < today
  const w = weekTotals(weekDates(weekStart).map(dayFor), complete)
  const pw = weekTotals(weekDates(addDaysIso(weekStart, -7)).map(dayFor), true)
  const curFinal = w.final
  const prevFinal = pw.provisionalDays === 0
  const mixed = originMixed(w.origin, pw.origin)
  const wx = weatherEffect(weatherDays, p)
  const caps: Record<string, Capability> = {
    ...w.capabilities,
    context: wx.state === 'ok' ? cap('complete') : wx.state === 'insufficient_sample' ? cap('partial', 'insufficient_sample') : cap('partial', 'missing_context'),
  }
  return {
    schemaVersion: 2,
    scope: 'weekly',
    branchId,
    weekStart,
    weekEnd,
    weekComplete: complete,
    finalization: curFinal ? 'finalized' : 'provisional',
    origin: w.origin,
    timezone: 'Europe/Istanbul',
    params: p,
    sourceLatestAt,
    daysWithData: w.daysWithData,
    finalizedDays: w.finalizedDays,
    provisionalDays: w.provisionalDays,
    volume: w.volume,
    financial: w.financial,
    days: w.days,
    completeness: completeness(caps, w.daysWithData > 0),
    previousWeek: { weekStart: addDaysIso(weekStart, -7), daysWithData: pw.daysWithData, provisionalDays: pw.provisionalDays, origin: pw.origin },
    volumeComparisons: {
      transactions: compare(w.txAvailableValue, pw.txAvailableValue, pw.txAvailableValue !== null, p.lowVolumeBaseTransactions, { currentFinal: curFinal, baselineFinal: prevFinal, mixed, blockMixed: true }),
    },
    financialComparisons: {
      grossRevenue: compare(value(w.financial.grossRevenue), value(pw.financial.grossRevenue), pw.daysWithData > 0, p.lowVolumeBaseRevenue, { currentFinal: curFinal, baselineFinal: prevFinal, mixed }),
      averageBasket: compare(w.basketAvailableValue, pw.basketAvailableValue, pw.basketAvailableValue !== null, 0, { currentFinal: curFinal, baselineFinal: prevFinal, mixed, blockMixed: true }),
    },
    weatherEffect: wx,
    peakHour: {
      state: 'unsupported',
      reason: 'sales reports are shift-level readings; no per-transaction or hourly timestamps exist in the source',
    },
  }
}

/** Removes every revenue-bearing section (a caller with analytics.read but not analytics.financial.read). */
export function redactAnalytics<T extends DailyAnalyticsPayload | WeeklyAnalyticsPayload>(payload: T): T {
  const copy = { ...payload } as Record<string, unknown>
  delete copy.financial
  delete copy.financialComparisons
  delete copy.days
  delete copy.weatherEffect
  delete copy.readings
  copy.redacted = true
  return copy as unknown as T
}
