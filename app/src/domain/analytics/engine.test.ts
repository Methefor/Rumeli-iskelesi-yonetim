import { describe, expect, it } from 'vitest'
import {
  buildDailyAnalytics,
  buildWeeklyAnalytics,
  compare,
  computeDay,
  originMixed,
  redactAnalytics,
  weatherEffect,
  type AnalyticsLineFact,
  type AnalyticsReportFact,
  type DayFacts,
  type WeatherDay,
} from './engine'
import { DEFAULT_ANALYTICS_SETTINGS, resolveAnalyticsSettings } from './settings'
import { addDaysIso } from '../../utils/dates'
import { weekStartOf } from './week'

// The same fixture numbers as supabase/tests/analytics_engine.test.sql, so the TS twin and the
// authoritative SQL are checked against identical expectations.
// Business-day rule: morning = X, evening = Z, Z already includes X (never two independent revenues).

let seq = 0
const cat = (key: string) => ({ categoryId: `cat-${key}`, categoryKey: key, categoryName: key })
const line = (key: string, amount: number, quantity: number | null, item: string | null = null, iqty: number | null = null): AnalyticsLineFact => ({
  ...cat(key),
  amount,
  quantity,
  inventoryItemId: item,
  inventoryQuantity: iqty,
})
function rep(
  type: 'X' | 'Z',
  revenue: number,
  tx: number | null,
  opts: { status?: AnalyticsReportFact['status']; lines?: AnalyticsLineFact[]; submittedAt?: string; updatedAt?: string; legacy?: boolean; shift?: string } = {},
): AnalyticsReportFact {
  seq += 1
  return {
    id: `r-${String(seq).padStart(4, '0')}`,
    shiftId: opts.shift ?? (type === 'X' ? 'morning' : 'evening'),
    reportType: type,
    status: opts.status ?? 'submitted',
    grossRevenue: revenue,
    transactionCount: tx,
    reconciliationStatus: 'OK',
    submittedAt: opts.submittedAt ?? '2026-10-01T10:00:00Z',
    updatedAt: opts.updatedAt ?? '2026-10-01T10:00:00Z',
    isLegacy: opts.legacy ?? false,
    lines: opts.lines ?? [],
  }
}

const PRODUCTS = [
  { id: 'P1', code: 'P1', name: 'Product One', unit: 'kg' },
  { id: 'P2', code: 'P2', name: 'Product Two', unit: 'adet' },
]
const day = (date: string, reports: AnalyticsReportFact[], unitCosts: Record<string, number> = {}): DayFacts => ({ date, reports, products: PRODUCTS, unitCosts })
const z = (date: string, revenue: number, tx: number | null, extra: Parameters<typeof rep>[3] = {}) => day(date, [rep('Z', revenue, tx, extra)])
const empty = (date: string): DayFacts => day(date, [])

function rumeliFixture(): Record<string, DayFacts> {
  return {
    // both readings, plus a cancelled Z: X 1000/20, Z 2200/44 -> 2200 (never 3200)
    '2026-09-30': day(
      '2026-09-30',
      [
        rep('X', 1000, 20, { lines: [line('gida', 600, 12), line('kahve', 400, 8)] }),
        rep('Z', 2200, 44, { lines: [line('gida', 1500, 30), line('kahve', 500, 10), line('gida', 200, null, 'P1', 4)] }),
        rep('Z', 9999, 99, { status: 'cancelled', shift: 'morning', lines: [line('gida', 9999, 99)] }),
      ],
      { P1: 20 },
    ),
    // Z only with lines + a costed product
    '2026-09-29': day(
      '2026-09-29',
      [rep('Z', 1000, 20, { submittedAt: '2026-09-29T22:30:00Z', lines: [line('gida', 600, 12), line('kahve', 250, 5), line('gida', 150, null, 'P1', 3)] })],
      { P1: 20 },
    ),
    '2026-09-23': z('2026-09-23', 1600, 32),
    '2026-09-24': z('2026-09-24', 800, 16),
    '2026-09-16': z('2026-09-16', 1500, 30),
    '2026-09-09': z('2026-09-09', 1700, 34),
    // an X-only day is provisional and never a baseline sample
    '2026-09-02': day('2026-09-02', [rep('X', 300, 6)]),
    '2026-09-17': day('2026-09-17', [rep('X', 600, 12, { lines: [line('gida', 400, 8), line('kahve', 200, 4)] })]),
    '2026-09-27': z('2026-09-27', 300, 6),
    '2026-09-28': z('2026-09-28', 700, 14),
    '2026-09-26': day('2026-09-26', [rep('X', 123, 3, { status: 'cancelled' })]),
    '2026-09-11': z('2026-09-11', 800, null),
    // inherited multi-register behaviour: two active X readings, latest wins
    '2026-09-08': day('2026-09-08', [
      rep('X', 500, 10, { submittedAt: '2026-09-08T10:00:00Z' }),
      rep('X', 700, 14, { submittedAt: '2026-09-08T12:00:00Z' }),
      rep('X', 400, 8, { submittedAt: '2026-09-08T09:00:00Z' }),
    ]),
  }
}

describe('computeDay: business-day revenue (X / Z)', () => {
  const fx = rumeliFixture()
  const d = computeDay(fx['2026-09-30']!)

  it('finalized revenue is Z-derived: X and Z are never summed as two revenues', () => {
    expect(d.finalization).toBe('finalized')
    expect(d.financial.grossRevenue).toEqual({ state: 'available', value: 2200 })
    expect(d.financial.provisionalRevenue).toBeNull()
    expect(d.volume.transactions).toEqual({ state: 'available', value: 44 })
    expect(d.reports).toMatchObject({ active: 2, cancelled: 1, x: 1, z: 1 })
    expect(d.readings.x).toMatchObject({ present: true, revenue: 1000 })
    expect(d.readings.z).toMatchObject({ present: true, revenue: 2200 })
  })

  it('derives the average basket from revenue / transactions', () => {
    expect(d.financial.averageBasket).toEqual({ state: 'available', value: 50 })
  })

  it('an X-only day is PROVISIONAL: partial, X exposed separately, never silently final', () => {
    const p = computeDay(fx['2026-09-17']!)
    expect(p.finalization).toBe('provisional')
    expect(p.financial.grossRevenue).toEqual({ state: 'unavailable', reason: 'missing_z' })
    expect(p.financial.provisionalRevenue).toBe(600)
    expect(p.volume.transactions).toMatchObject({ state: 'partial', value: 12 })
    expect(p.capabilities.revenue).toEqual({ status: 'partial', reasons: ['missing_z'] })
  })

  it('a Z-only day is finalized', () => {
    expect(computeDay(fx['2026-09-29']!).finalization).toBe('finalized')
  })

  it('treats a day with only cancelled reports as no data', () => {
    const c = computeDay(fx['2026-09-26']!)
    expect(c).toMatchObject({ hasData: false, finalization: 'no_data' })
    expect(c.reports.cancelled).toBe(1)
    expect(c.financial.averageBasket.state).toBe('unavailable')
  })

  it('missing transaction count: unavailable and named', () => {
    const c = computeDay(fx['2026-09-11']!)
    expect(c.volume.transactions).toEqual({ state: 'unavailable', reason: 'transaction_count_missing' })
    expect(c.capabilities.transactions!.reasons).toContain('missing_transaction_count')
    expect(c.financial.grossRevenue.value).toBe(800)
  })

  it('zero transactions never divide by zero', () => {
    const c = computeDay(z('2026-09-30', 0, 0))
    expect(c.volume.transactions).toEqual({ state: 'available', value: 0 })
    expect(c.financial.averageBasket).toEqual({ state: 'unavailable', reason: 'zero_transactions' })
    expect(c.hasData).toBe(true)
  })

  it('INHERITED multi-register behaviour: the LATEST active X wins, readings are never summed, and a warning says so', () => {
    const c = computeDay(fx['2026-09-08']!)
    expect(c.readings.x.revenue).toBe(700)
    expect(c.financial.provisionalRevenue).toBe(700)
    expect(c.warnings).toContainEqual({ code: 'multiple_active_readings', type: 'X', count: 3 })
  })

  it('a newer Z replaces the older one (latest wins) and is flagged', () => {
    const c = computeDay(
      day('2026-09-30', [
        rep('X', 1000, 20),
        rep('Z', 2200, 44, { submittedAt: '2026-10-01T10:00:00Z' }),
        rep('Z', 2400, 48, { submittedAt: '2026-10-01T11:00:00Z', shift: 'morning' }),
      ]),
    )
    expect(c.financial.grossRevenue.value).toBe(2400)
    expect(c.warnings).toContainEqual({ code: 'multiple_active_readings', type: 'Z', count: 2 })
  })

  it('flags a Z below its X without leaking money', () => {
    const c = computeDay(day('2026-09-30', [rep('X', 900, 9), rep('Z', 800, 8)]))
    expect(c.warnings).toContainEqual({ code: 'z_below_x' })
  })
})

describe('computeDay: Z is the final revenue (never normalized by X)', () => {
  const only = (reports: AnalyticsReportFact[]) => computeDay(day('2026-09-30', reports))

  it('1. X=6000, Z=9600 => finalized revenue 9600', () => {
    const d = only([rep('X', 6000, 60), rep('Z', 9600, 96)])
    expect(d.finalization).toBe('finalized')
    expect(d.financial.grossRevenue).toEqual({ state: 'available', value: 9600 })
    expect(d.volume.transactions).toEqual({ state: 'available', value: 96 })
    expect(d.warnings).toEqual([])
  })

  it('2. X=9600, Z=6000 => finalized revenue 6000 + z_below_x (not 9600, not max(X, Z))', () => {
    const d = only([rep('X', 9600, 96), rep('Z', 6000, 60)])
    expect(d.finalization).toBe('finalized')
    expect(d.financial.grossRevenue).toEqual({ state: 'available', value: 6000 })
    expect(d.volume.transactions).toEqual({ state: 'available', value: 60 })
    expect(d.warnings).toEqual([{ code: 'z_below_x' }])
  })

  it('3. X only => no finalized revenue, provisional 9600, missing_z', () => {
    const d = only([rep('X', 9600, 96)])
    expect(d.finalization).toBe('provisional')
    expect(d.financial.grossRevenue).toEqual({ state: 'unavailable', reason: 'missing_z' })
    expect(d.financial.grossRevenue.value).toBeUndefined()
    expect(d.financial.provisionalRevenue).toBe(9600)
    expect(d.capabilities.revenue).toEqual({ status: 'partial', reasons: ['missing_z'] })
    expect(d.financial.averageBasket).toEqual({ state: 'unavailable', reason: 'missing_z' })
  })

  it('4. Z only => finalized revenue = Z', () => {
    const d = only([rep('Z', 9600, 96)])
    expect(d.finalization).toBe('finalized')
    expect(d.financial.grossRevenue).toEqual({ state: 'available', value: 9600 })
  })

  it('5. the weekly aggregate uses finalized Z values only and provisional days never become baselines', () => {
    const wk: Record<string, DayFacts> = {
      '2026-09-14': day('2026-09-14', [rep('X', 6000, 60), rep('Z', 9600, 96)]), // finalized 9600
      '2026-09-15': day('2026-09-15', [rep('X', 9600, 96), rep('Z', 6000, 60)]), // finalized 6000, z_below_x
      '2026-09-16': day('2026-09-16', [rep('X', 9600, 96)]), // provisional: excluded from the sum
      '2026-09-17': day('2026-09-17', [rep('Z', 1000, 10)]), // finalized 1000
      '2026-09-21': day('2026-09-21', [rep('Z', 500, 5)]), // next week, compared with the provisional week
    }
    const dayFor = (date: string) => computeDay(wk[date] ?? empty(date))
    const w = buildWeeklyAnalytics({ branchId: 'BR', weekStart: '2026-09-14', today: '2026-10-06', dayFor, weatherDays: [], sourceLatestAt: null })
    expect(w.financial.grossRevenue).toEqual({ state: 'partial', value: 16600, reason: 'missing_z' })
    expect(w.financial.provisionalRevenue).toBe(9600)
    expect(w.finalizedDays).toBe(3)
    expect(w.provisionalDays).toBe(1)
    expect(w.finalization).toBe('provisional')
    expect(w.days.find((d) => d.date === '2026-09-16')).toMatchObject({ grossRevenue: null, provisionalRevenue: 9600, finalization: 'provisional' })
    expect(w.completeness.metrics.revenue).toEqual({ status: 'partial', reasons: ['missing_z'] })
    const next = buildWeeklyAnalytics({ branchId: 'BR', weekStart: '2026-09-21', today: '2026-10-06', dayFor, weatherDays: [], sourceLatestAt: null })
    expect(next.financialComparisons.grossRevenue).toEqual({ state: 'baseline_not_final' })
    // daily baseline: the provisional Wednesday 09-16 is not a sample for 09-23
    const d23 = buildDailyAnalytics({ branchId: 'BR', date: '2026-09-23', dayFor: (d) => computeDay(d === '2026-09-23' ? day(d, [rep('Z', 800, 8)]) : (wk[d] ?? empty(d))), context: { state: 'missing', isWeekend: false } })
    expect(d23.baselineSamples.sameWeekdayFinalizedDays).toBe(0)
    expect(d23.financialComparisons.grossRevenue.previousWeekSameWeekday).toEqual({ state: 'baseline_not_final' })
  })
})

describe('computeDay: product / category X-Z line semantics are NOT inferred', () => {
  const fx = rumeliFixture()

  it('both X and Z lines with unknown cumulative semantics: unsupported, no values emitted', () => {
    const d = computeDay(fx['2026-09-30']!)
    expect(d.capabilities.categories).toEqual({ status: 'unsupported', reasons: ['xz_line_semantics_unknown'] })
    expect(d.capabilities.products).toEqual({ status: 'unsupported', reasons: ['xz_line_semantics_unknown'] })
    expect(d.financial.categories).toEqual([])
    expect(d.financial.products).toEqual([])
    expect(d.volume.categories).toEqual([])
    expect(d.volume.itemQuantity).toEqual({ state: 'unsupported', reason: 'xz_line_semantics_unknown' })
    expect(d.financial.grossProfit.metric).toEqual({ state: 'unsupported', reason: 'xz_line_semantics_unknown' })
  })

  it('finalized total revenue stays available (complete) while product detail is unsupported', () => {
    const d = computeDay(fx['2026-09-30']!)
    expect(d.capabilities.revenue).toEqual({ status: 'complete', reasons: [] })
    expect(d.financial.grossRevenue.state).toBe('available')
  })

  it('X lines only: provisional category detail (missing_z)', () => {
    const d = computeDay(fx['2026-09-17']!)
    expect(d.capabilities.categories).toEqual({ status: 'partial', reasons: ['missing_z'] })
    expect(Object.fromEntries(d.financial.categories.map((c) => [c.key, c.revenue]))).toEqual({ gida: 400, kahve: 200 })
  })

  it('Z lines only: shown as reported but only partial (z_line_semantics_unverified)', () => {
    const d = computeDay(fx['2026-09-29']!)
    expect(d.capabilities.categories).toEqual({ status: 'partial', reasons: ['z_line_semantics_unverified'] })
    expect(Object.fromEntries(d.financial.categories.map((c) => [c.key, c.revenue]))).toEqual({ gida: 750, kahve: 250 })
    expect(Object.fromEntries(d.volume.categories.map((c) => [c.key, c.quantity]))).toEqual({ gida: 12, kahve: 5 })
    const p1 = d.financial.products.find((p) => p.code === 'P1')
    expect(p1).toMatchObject({ revenue: 150, quantity: 3, averageUnitPrice: 50, costState: 'costed', grossProfit: 90 })
  })

  it('gross profit is never complete: partial with the cost gap named, gross-only', () => {
    const d = computeDay(fx['2026-09-29']!)
    expect(d.financial.grossProfit).toMatchObject({ grossOnly: true, metric: { state: 'partial', value: 90, reason: 'missing_cost' }, coveredRevenue: 150, uncoveredRevenue: 850 })
    const full = computeDay({
      date: '2026-09-26',
      reports: [rep('Z', 200, 5, { lines: [line('dondurma', 200, null, 'D1', 4)] })],
      products: [{ id: 'D1', code: 'D1', name: 'Dondurma', unit: 'kg' }],
      unitCosts: { D1: 30 },
    })
    expect(full.financial.grossProfit.metric).toEqual({ state: 'partial', value: 80, reason: 'line_semantics_unverified' })
  })

  it('no product lines: gross profit unavailable, never 0', () => {
    expect(computeDay(z('2026-09-23', 1600, 32)).financial.grossProfit.metric).toEqual({ state: 'unavailable', reason: 'missing_product_detail' })
  })
})

describe('computeDay: legacy origin capability', () => {
  const legacyDay = (tx: number | null) =>
    day('2026-09-05', [rep('Z', 4000, tx, { legacy: true, lines: [line('dondurma', 4000, null, 'P1', 20)] })], { P1: 30 })

  it('total revenue is supported; product metrics and gross profit are not', () => {
    const d = computeDay(legacyDay(null))
    expect(d.origin).toBe('legacy_import')
    expect(d.capabilities.revenue!.status).toBe('complete')
    expect(d.financial.grossRevenue).toEqual({ state: 'available', value: 4000 })
    expect(d.capabilities.products).toEqual({ status: 'unsupported', reasons: ['legacy_source_limitation'] })
    expect(d.financial.products).toEqual([])
    expect(d.financial.grossProfit.metric).toEqual({ state: 'unsupported', reason: 'legacy_source_limitation' })
    expect(d.capabilities.hourly).toEqual({ status: 'unsupported', reasons: ['no_hourly_source'] })
  })

  it('transactions only where the source has them; the limitation is named', () => {
    expect(computeDay(legacyDay(null)).capabilities.transactions!.reasons).toEqual(['missing_transaction_count', 'legacy_source_limitation'])
    expect(computeDay(legacyDay(100)).volume.transactions).toEqual({ state: 'available', value: 100 })
  })

  it('origin mix detection', () => {
    expect(originMixed('native', 'legacy_import')).toBe(true)
    expect(originMixed('native', 'native')).toBe(false)
    expect(originMixed('none', 'legacy_import')).toBe(false)
    expect(originMixed('mixed', 'native')).toBe(true)
  })
})

describe('compare', () => {
  it('reports ok comparisons with a one-decimal percentage', () => {
    expect(compare(2200, 1600, true, 500)).toEqual({ state: 'ok', baseline: 1600, delta: 600, pct: 37.5 })
  })
  it('does not fabricate a baseline when the baseline period has no data', () => {
    expect(compare(100, 0, false, 500)).toEqual({ state: 'no_baseline' })
  })
  it('refuses a percentage from a zero base', () => {
    expect(compare(300, 0, true, 500)).toEqual({ state: 'zero_base', baseline: 0, delta: 300 })
  })
  it('refuses a percentage from a low-volume base (low-volume growth)', () => {
    const c = compare(900, 100, true, 500)
    expect(c).toEqual({ state: 'low_base', baseline: 100, delta: 800 })
    expect(c.pct).toBeUndefined()
  })
  it('requires a minimum number of baseline samples', () => {
    expect(compare(900, 800, true, 500, { samples: 1, minSamples: 2 })).toEqual({ state: 'insufficient_samples', samples: 1 })
  })
  it('refuses to compare a provisional current or a provisional baseline', () => {
    expect(compare(900, 800, true, 500, { currentFinal: false })).toEqual({ state: 'not_final' })
    expect(compare(900, 800, true, 500, { baselineFinal: false })).toEqual({ state: 'baseline_not_final' })
  })
  it('refuses mixed native + legacy data on blocked metrics, flags it on revenue', () => {
    expect(compare(900, 800, true, 500, { mixed: true, blockMixed: true })).toEqual({ state: 'mixed_origin' })
    expect(compare(900, 800, true, 500, { mixed: true })).toMatchObject({ state: 'ok', mixedOrigin: true })
  })
  it('rounds half away from zero like SQL', () => {
    expect(compare(105, 100, true, 0).pct).toBe(5)
    expect(compare(99.95, 100, true, 0).pct).toBe(-0.1)
  })
})

describe('buildDailyAnalytics', () => {
  const fx = rumeliFixture()
  const dayFor = (date: string) => computeDay(fx[date] ?? empty(date))
  const build = (date: string, ctx = { state: 'missing' as const, isWeekend: false }) => buildDailyAnalytics({ branchId: 'BR', date, dayFor, context: ctx })
  const p = build('2026-09-30')

  it('compares with the previous day, previous week and the 4-week same-weekday baseline', () => {
    expect(p.financialComparisons.grossRevenue.previousDay).toMatchObject({ state: 'ok', pct: 120 })
    expect(p.financialComparisons.grossRevenue.previousWeekSameWeekday).toMatchObject({ state: 'ok', pct: 37.5 })
    expect(p.financialComparisons.grossRevenue.baseline4SameWeekday).toMatchObject({ state: 'ok', baseline: 1600, pct: 37.5, samples: 3 })
    expect(p.volumeComparisons.transactions.baseline4SameWeekday).toMatchObject({ baseline: 32 })
    expect(p.financialComparisons.averageBasket.previousWeekSameWeekday).toMatchObject({ state: 'ok', pct: 0 })
  })

  it('the baseline uses only FINALIZED same-weekday days (the X-only 09-02 is excluded)', () => {
    expect(p.baselineSamples).toEqual({ sameWeekdayFinalizedDays: 3, of: 4 })
  })

  it('a provisional day gets no comparison; a provisional baseline is never compared against', () => {
    expect(build('2026-09-17').financialComparisons.grossRevenue.previousWeekSameWeekday).toEqual({ state: 'not_final' })
    expect(build('2026-09-24').financialComparisons.grossRevenue.previousWeekSameWeekday).toEqual({ state: 'baseline_not_final' })
  })

  it('attributes a report to its business date, not its submission instant', () => {
    expect(dayFor('2026-09-29').financial.grossRevenue.value).toBe(1000)
  })

  it('marks peak hour unsupported and missing weather as missing_context', () => {
    expect(p.peakHour.state).toBe('unsupported')
    expect(p.context.state).toBe('missing')
    expect(p.completeness.metrics.context).toEqual({ status: 'partial', reasons: ['missing_context'] })
  })

  it('completeness: finalized revenue + transactions = complete overall, with the unsupported parts named', () => {
    expect(p.completeness.overall).toBe('complete')
    expect(p.completeness.reasons).toEqual(expect.arrayContaining(['xz_line_semantics_unknown', 'no_hourly_source', 'missing_context']))
    expect(build('2026-09-17').completeness.overall).toBe('partial')
    expect(build('2026-09-17').completeness.reasons).toContain('missing_z')
  })

  it('legacy vs native: transaction and basket comparisons are refused, revenue is flagged', () => {
    const legacyFx: Record<string, DayFacts> = {
      '2026-09-12': z('2026-09-12', 5000, 100, { legacy: true }),
      '2026-09-19': z('2026-09-19', 800, 16),
    }
    const dayFor2 = (date: string) => computeDay(legacyFx[date] ?? empty(date))
    const out = buildDailyAnalytics({ branchId: 'BD', date: '2026-09-19', dayFor: dayFor2, context: { state: 'missing', isWeekend: true } })
    expect(out.volumeComparisons.transactions.previousWeekSameWeekday).toEqual({ state: 'mixed_origin' })
    expect(out.financialComparisons.averageBasket.previousWeekSameWeekday).toEqual({ state: 'mixed_origin' })
    expect(out.financialComparisons.grossRevenue.previousWeekSameWeekday).toMatchObject({ state: 'ok', pct: -84, mixedOrigin: true })
  })

  it('redaction removes every revenue-bearing section (including the X/Z readings) but keeps volume and completeness', () => {
    const r = redactAnalytics(p) as unknown as Record<string, unknown>
    expect(r.financial).toBeUndefined()
    expect(r.financialComparisons).toBeUndefined()
    expect(r.readings).toBeUndefined()
    expect(r.redacted).toBe(true)
    expect((r.volume as { transactions: { value: number } }).transactions.value).toBe(44)
    expect(r.completeness).toBeDefined()
  })
})

describe('buildWeeklyAnalytics', () => {
  const fx = rumeliFixture()
  const dayFor = (date: string) => computeDay(fx[date] ?? empty(date))
  const build = (weekStart: string) => buildWeeklyAnalytics({ branchId: 'BR', weekStart, today: '2026-10-06', dayFor, weatherDays: [], sourceLatestAt: null })

  it('uses Monday..Sunday boundaries: Sunday 09-27 is last week, Monday 09-28 starts this one', () => {
    const w = build('2026-09-28')
    const prev = build('2026-09-21')
    expect(w.financial.grossRevenue).toEqual({ state: 'available', value: 3900 })
    expect(w.volume.transactions.value).toBe(78)
    expect(prev.financial.grossRevenue.value).toBe(2700)
    expect(w.weekEnd).toBe('2026-10-04')
    expect(w.weekComplete).toBe(true)
    expect(w.finalization).toBe('finalized')
    expect(w.days).toHaveLength(7)
  })

  it('computes weekly revenue, transaction and basket changes versus the previous week', () => {
    const w = build('2026-09-28')
    expect(w.financialComparisons.grossRevenue).toMatchObject({ state: 'ok', pct: 44.4 })
    expect(w.volumeComparisons.transactions).toMatchObject({ state: 'ok', pct: 44.4 })
    expect(w.financialComparisons.averageBasket).toMatchObject({ state: 'ok', pct: 0 })
    expect(w.financial.averageBasket.value).toBe(50)
  })

  it('an X-only day makes the week provisional and can never make it complete', () => {
    const w = build('2026-09-14')
    expect(w.finalization).toBe('provisional')
    expect(w.provisionalDays).toBe(1)
    expect(w.financial.grossRevenue).toEqual({ state: 'partial', value: 1500, reason: 'missing_z' })
    expect(w.financial.provisionalRevenue).toBe(600)
    expect(w.completeness.metrics.revenue).toEqual({ status: 'partial', reasons: ['missing_z'] })
    expect(w.completeness.overall).toBe('partial')
    expect(w.financialComparisons.grossRevenue).toEqual({ state: 'not_final' })
  })

  it('a week in progress is not final even without X-only days', () => {
    const w = buildWeeklyAnalytics({ branchId: 'BR', weekStart: '2026-09-28', today: '2026-10-02', dayFor, weatherDays: [], sourceLatestAt: null })
    expect(w.weekComplete).toBe(false)
    expect(w.finalization).toBe('provisional')
    expect(w.completeness.metrics.revenue!.reasons).toContain('week_in_progress')
  })

  it('week start helper agrees with the boundary rule', () => {
    expect(weekStartOf('2026-09-27')).toBe('2026-09-21')
    expect(weekStartOf('2026-09-28')).toBe('2026-09-28')
    expect(addDaysIso(weekStartOf('2026-10-04'), 6)).toBe('2026-10-04')
  })

  it('weekly legacy origin: native vs legacy transaction comparison is refused', () => {
    const legacyFx: Record<string, DayFacts> = {
      '2026-09-08': z('2026-09-08', 5000, 100, { legacy: true }),
      '2026-09-15': z('2026-09-15', 800, 16),
    }
    const dayFor2 = (date: string) => computeDay(legacyFx[date] ?? empty(date))
    const w = buildWeeklyAnalytics({ branchId: 'BD', weekStart: '2026-09-14', today: '2026-10-06', dayFor: dayFor2, weatherDays: [], sourceLatestAt: null })
    expect(w.volumeComparisons.transactions).toEqual({ state: 'mixed_origin' })
    expect(w.financialComparisons.grossRevenue).toMatchObject({ state: 'ok', mixedOrigin: true })
  })
})

describe('central analytics settings', () => {
  it('defaults are the documented technical defaults, pending owner review', () => {
    expect(DEFAULT_ANALYTICS_SETTINGS).toMatchObject({
      lowVolumeBaseRevenue: 500,
      lowVolumeBaseTransactions: 10,
      minBaselineSamples: 2,
      minCorrelationSamples: 14,
      minGroupSamples: 3,
      rainMmThreshold: 1.0,
      weatherWindowDays: 84,
      status: 'defaults_pending_owner_review',
    })
  })
  it('one override changes behaviour everywhere and the rest keep their defaults', () => {
    const s = resolveAnalyticsSettings({ lowVolumeBaseRevenue: 50, status: 'owner_configured' })
    expect(s.lowVolumeBaseRevenue).toBe(50)
    expect(s.minGroupSamples).toBe(3)
    const fx: Record<string, DayFacts> = { '2026-09-21': z('2026-09-21', 100, 4), '2026-09-28': z('2026-09-28', 900, 30) }
    const dayFor = (d: string) => computeDay(fx[d] ?? empty(d))
    const strict = buildDailyAnalytics({ branchId: 'BD', date: '2026-09-28', dayFor, context: { state: 'missing', isWeekend: false } })
    const loose = buildDailyAnalytics({ branchId: 'BD', date: '2026-09-28', dayFor, context: { state: 'missing', isWeekend: false }, settings: s })
    expect(strict.financialComparisons.grossRevenue.previousWeekSameWeekday.state).toBe('low_base')
    expect(loose.financialComparisons.grossRevenue.previousWeekSameWeekday).toMatchObject({ state: 'ok', pct: 800 })
    expect(loose.params.status).toBe('owner_configured')
  })
})

describe('weatherEffect', () => {
  const days = (n: number, rev: (i: number, temp: number) => number): WeatherDay[] =>
    Array.from({ length: n }, (_, i) => {
      const temp = 15 + (i % 10)
      return { date: addDaysIso('2026-08-10', i), revenue: rev(i, temp), temperatureC: temp, precipitationMm: i % 4 === 0 ? 3 : 0 }
    })

  it('reports no_context when there is no weather data', () => {
    expect(weatherEffect([])).toMatchObject({ state: 'no_context', sample: 0 })
  })

  it('refuses a correlation below the minimum sample', () => {
    const w = weatherEffect(days(5, () => 1000))
    expect(w).toMatchObject({ state: 'insufficient_sample', sample: 5, required: 14 })
    expect(w.temperatureCorrelation).toBeUndefined()
  })

  it('reports a weekday-adjusted relationship with a no-causation caveat', () => {
    const w = weatherEffect(days(28, (_, t) => 1000 + 30 * t))
    expect(w.state).toBe('ok')
    expect(w.confidence).toBe('relationship')
    expect(w.sample).toBe(28)
    expect(w.temperatureCorrelation!.r).toBeGreaterThan(0.9)
    expect(w.caveat).toContain('does not show that weather caused')
    expect(w.rainEffect).toMatchObject({ rainyDays: 7, dryDays: 21 })
  })

  it('honours a configured sample threshold', () => {
    const w = weatherEffect(days(8, (_, t) => 1000 + 30 * t), resolveAnalyticsSettings({ minCorrelationSamples: 5 }))
    expect(w.state).toBe('ok')
  })

  it('does not report a rain effect from a tiny group', () => {
    const w = weatherEffect(days(16, (_, t) => 1000 + 30 * t).map((d, i) => ({ ...d, precipitationMm: i < 2 ? 5 : 0 })))
    expect(w.rainEffect).toMatchObject({ state: 'insufficient_group_sample', rainyDays: 2 })
  })
})
