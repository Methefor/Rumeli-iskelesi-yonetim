import { describe, expect, it } from 'vitest'
import {
  buildDailyFactPack,
  buildWeeklyFactPack,
  renderDailyNarrative,
  renderWeeklyNarrative,
  validateNarrative,
  type DailyFactPack,
  type Narrative,
  type ReportAccess,
  type WeeklyFactPack,
} from '.'
import { reproducibilityOf } from './support'
import type { BranchSignals } from '../commandCenter'
import type { WeatherDay } from '../analytics'
import { addDaysIso } from '../../utils/dates'
import {
  ALL_ACCESS,
  BASE_NOW,
  cleanWeekSpec,
  dailyReportInputs,
  dashboardFor,
  emptyProcurement,
  FIXTURE_BRANCHES,
  signalsFor,
  weeklyReportInputs,
  type BranchSpec,
} from './fixtures'

const [B1, B2] = FIXTURE_BRANCHES as [(typeof FIXTURE_BRANCHES)[number], (typeof FIXTURE_BRANCHES)[number]]
const TODAY = '2026-10-08'
const PAST = '2026-10-05'
const WEEK = '2026-09-28'
const CURRENT = '2026-10-05'
const NONE: ReportAccess = { financial: false, reports: false, stock: false, weather: false }

const z = (rev: number, tx = 40) => ({ x: [Math.round(rev / 2), Math.round(tx / 2)] as [number, number], z: [rev, tx] as [number, number], costed: true })
const both = (date: string, a: BranchSpec[string], b: BranchSpec[string]): Record<string, BranchSpec> => ({ [B1.id]: { [date]: a }, [B2.id]: { [date]: b } })
const brief = { id: 'o1', orderNumber: 'PO-1', status: 'SUBMITTED' as const, supplierName: 'Tedarikçi', expectedDeliveryDate: '2026-10-01', submittedAt: null, lineCount: 2, receivedLineCount: 0 }
const richSignals = (date: string): Record<string, BranchSignals> =>
  Object.fromEntries(
    FIXTURE_BRANCHES.map((b) => [
      b.id,
      signalsFor(b.id, date, {
        procurement: { state: 'available', data: { ...emptyProcurement(b.id, date), overdueDelivery: [brief], awaitingApproval: [brief], lowStockNoOpenOrder: [] } },
        weather: {
          state: 'available',
          data: {
            status: 'fresh',
            staleReason: null,
            isForecast: true,
            provider: 'test',
            timezone: 'Europe/Istanbul',
            fetchedAt: '2026-10-08T08:30:00Z',
            generatedAt: null,
            validUntil: '2026-10-08T09:30:00Z',
            ageMinutes: 30,
            location: { label: null },
            current: { time: '2026-10-08T08:00:00Z', temperatureC: 18, apparentTemperatureC: null, weatherCode: null, precipitationMm: null, windKmh: null, windGustKmh: null },
            hourly: [{ time: '2026-10-08T10:00:00Z', temperatureC: 17, apparentTemperatureC: null, precipitationProbability: 80, precipitationMm: 2, weatherCode: null, windKmh: null, windGustKmh: null }],
            daily: [],
          },
        },
      }),
    ]),
  )

type Over = Parameters<typeof dailyReportInputs>[3]
function daily(date: string, specs: Record<string, BranchSpec>, o: { over?: Over; signals?: Record<string, BranchSignals> | null; alerts?: number } = {}): DailyFactPack {
  const d = dashboardFor(FIXTURE_BRANCHES, date, specs, { alertCount: o.alerts })
  return buildDailyFactPack({
    businessDate: date,
    now: BASE_NOW,
    branches: FIXTURE_BRANCHES,
    rows: d.branches,
    signals: o.signals === undefined ? richSignals(TODAY) : o.signals,
    report: dailyReportInputs(FIXTURE_BRANCHES, date, specs, o.over),
  })
}
function weekly(weekStart: string, specs: Record<string, BranchSpec>, o: { over?: Over; signals?: boolean; weatherDays?: WeatherDay[] } = {}): WeeklyFactPack {
  return buildWeeklyFactPack({
    weekStart,
    now: BASE_NOW,
    branches: FIXTURE_BRANCHES,
    report: weeklyReportInputs(FIXTURE_BRANCHES, weekStart, TODAY, specs, o.over, o.weatherDays),
    signals: o.signals ? richSignals(TODAY) : null,
  })
}
const weekSpecs = (): Record<string, BranchSpec> => ({ [B1.id]: { ...cleanWeekSpec('2026-09-21', [900, 1000, 900, 1000, 1400, 1800, 1600]), ...cleanWeekSpec(WEEK, [1000, 1200, 900, 1100, 1500, 2000, 1800]) }, [B2.id]: { ...cleanWeekSpec('2026-09-21', [800, 700, 600, 900, 1000, 1400, 1300]), ...cleanWeekSpec(WEEK, [800, 700, 600, 900, 1000, 1400, 1300]) } })
const noWasteParts = { state: 'unavailable', reason: 'no_permission' } as const
const weatherDays = (n: number): WeatherDay[] => Array.from({ length: n }, (_, i) => ({ date: addDaysIso('2026-09-03', i), revenue: 1000 + (i % 7) * 100 + (i % 3 === 0 ? -150 : 150), temperatureC: 10 + i * 0.5, precipitationMm: i % 4 === 0 ? 3 : 0 }))
const text = (v: unknown) => JSON.stringify(v)
const clone = <T,>(n: T): T => JSON.parse(JSON.stringify(n)) as T

describe('PERMISSION INTERSECTION — analytics.read is an entry permission, never an umbrella (daily)', () => {
  const specs = both(TODAY, z(2200), z(1800))

  it('financial metrics need the financial permission: nothing of the branch revenue, transactions, basket or gross profit leaks', () => {
    const p = daily(TODAY, specs, { over: { [B1.id]: { access: { ...ALL_ACCESS, financial: false } } }, alerts: 2 })
    const b1 = p.branches.find((b) => b.branchKey === B1.key)!
    for (const f of [b1.finalizedRevenue, b1.provisionalRevenue, b1.transactions, b1.averageBasket, b1.grossProfit]) {
      expect(f).toMatchObject({ support: 'unsupported', value: null, ref: null })
      expect(f.reasons).toContain('no_permission')
    }
    expect(Object.keys(p.evidence).some((k) => k.startsWith(`branch.${B1.key}.revenue`) || k.startsWith(`branch.${B1.key}.transactions`) || k.startsWith(`branch.${B1.key}.grossProfit`))).toBe(false)
    // the organization total covers only what the caller may see, and says it is partial
    expect(p.organization.finalizedRevenue).toMatchObject({ support: 'partial', value: 1800 })
    expect(p.limitations.some((l) => l.code === 'no_permission' && l.branchKey === B1.key)).toBe(true)
    const n = renderDailyNarrative(p)
    expect(text(n)).not.toContain('2.200,00')
    expect(validateNarrative(n, p)).toMatchObject({ ok: true })
  })

  it('a branch whose reports the caller may not read contributes nothing (not even to the attention feed) and is named as a missing part', () => {
    const p = daily(TODAY, specs, { over: { [B1.id]: { access: { ...ALL_ACCESS, reports: false } } }, alerts: 3 })
    expect(p.branches.map((b) => b.branchKey)).toEqual([B2.key])
    expect(p.limitations.some((l) => l.code === 'no_permission' && l.branchKey === B1.key)).toBe(true)
    expect(p.attention.items.some((i) => i.branchKey === B1.key)).toBe(false)
    expect(p.organization.reportingCompleteness).toMatchObject({ total: 2, finalizedBranches: 1 })
    expect(p.organization.finalizedRevenue.support).toBe('partial')
    expect(p.completeness.overall).toBe('partial')
  })

  it('stock alerts need inventory.read: without it the count is withheld as no_permission, never an all-clear', () => {
    const open = daily(TODAY, specs, { alerts: 3 })
    expect(open.attention.items.some((i) => i.reasonCode === 'stock_alert')).toBe(true)
    const p = daily(TODAY, specs, { alerts: 3, over: { [B1.id]: { access: { ...ALL_ACCESS, stock: false } }, [B2.id]: { access: { ...ALL_ACCESS, stock: false } } } })
    expect(p.attention.items.some((i) => i.reasonCode === 'stock_alert')).toBe(false)
    expect(p.inventory.stockAlertBranches).toMatchObject({ support: 'unsupported', value: null })
    expect(p.branches.every((b) => b.stockAlerts.reasons.includes('no_permission'))).toBe(true)
    expect(p.limitations.some((l) => l.code === 'no_permission')).toBe(true)
  })

  it('waste / count / procurement / forecast keep their OWN permission: analytics.read alone exposes none of them', () => {
    const denied = { state: 'unavailable', reason: 'no_permission' } as const
    const signals = Object.fromEntries(FIXTURE_BRANCHES.map((b) => [b.id, signalsFor(b.id, TODAY, { counts: denied, waste: denied, procurement: denied, weather: denied })]))
    const analyticsOnly: ReportAccess = { financial: true, reports: true, stock: false, weather: false }
    const p = daily(TODAY, specs, { signals, over: { [B1.id]: { access: analyticsOnly, waste: denied, counts: denied }, [B2.id]: { access: analyticsOnly, waste: denied, counts: denied } } })
    expect(p.procurement).toMatchObject({ state: 'unavailable', reason: 'no_permission' })
    expect(p.procurement.overdue).toMatchObject({ support: 'unsupported', value: null })
    expect(p.inventory.wasteEntries.value).toBeNull()
    expect(p.inventory.wasteCost.value).toBeNull()
    expect(p.branches.every((b) => b.waste === null && b.countOutcome === null && b.closingCount === 'unknown')).toBe(true)
    expect(p.weather.forecast).toEqual([])
    expect(Object.keys(p.evidence).some((k) => k.startsWith('procurement.') || k.startsWith('inventory.waste') || k.startsWith('weather.forecast'))).toBe(false)
    expect(p.limitations.some((l) => l.code === 'no_permission')).toBe(true)
    expect(validateNarrative(renderDailyNarrative(p), p)).toMatchObject({ ok: true })
  })

  it('weather needs weather.read: historical context of a past date is withheld without it', () => {
    const ctx = { state: 'present' as const, temperatureC: 18.25, precipitationMm: 0, isWeekend: false, provenance: 'reanalysis' as const, source: 'open-meteo' }
    const specsPast = both(PAST, { ...z(2200), context: ctx }, z(1800))
    const allowed = daily(PAST, specsPast, { signals: null })
    expect(allowed.weather.historical.some((h) => h.state === 'present')).toBe(true)
    const p = daily(PAST, specsPast, { signals: null, over: { [B1.id]: { access: { ...ALL_ACCESS, weather: false } }, [B2.id]: { access: { ...ALL_ACCESS, weather: false } } } })
    expect(p.weather.historical).toEqual([])
    expect(Object.keys(p.evidence).some((k) => k.startsWith('weather.daily'))).toBe(false)
    expect(p.limitations.some((l) => l.code === 'no_permission')).toBe(true)
  })

  it('no access at all (caller reachable but with no domain permission) yields no business fact and no all-clear', () => {
    const p = daily(TODAY, specs, { over: { [B1.id]: { access: NONE }, [B2.id]: { access: NONE } } })
    expect(p.branches).toEqual([])
    expect(p.completeness.overall).toBe('no_data')
    expect(p.organization.finalizedRevenue).toMatchObject({ support: 'unsupported', value: null })
    expect(p.attention.items).toEqual([])
    expect(p.limitations.filter((l) => l.code === 'no_permission')).toHaveLength(2)
    expect(text(p)).not.toMatch(/2200|1800|2\.200|1\.800/)
  })
})

describe('PERMISSION INTERSECTION (weekly)', () => {
  it('without the financial permission no revenue, comparison or recurrence of revenue leaks (the payload is withheld)', () => {
    const p = weekly(WEEK, weekSpecs(), { over: { [B1.id]: { access: { ...ALL_ACCESS, financial: false } } } })
    const b1 = p.branches.find((b) => b.branchKey === B1.key)
    expect(b1).toBeUndefined()
    expect(p.limitations.some((l) => l.code === 'no_permission' && l.branchKey === B1.key)).toBe(true)
    expect(p.organization.finalizedRevenue.support).toBe('partial')
    expect(p.organization.finalizedRevenue.value).toBe(6700) // only the permitted branch
    expect(p.organization.vsPreviousWeek.support).toBe('unsupported')
    expect(validateNarrative(renderWeeklyNarrative(p), p).ok).toBe(true)
  })

  it('without report access the daily history (recurrence, reconciliation, Z<X) is withheld', () => {
    const specs = weekSpecs()
    specs[B1.id]!['2026-09-29'] = { ...specs[B1.id]!['2026-09-29']!, recon: 'WARNING' }
    const open = weekly(WEEK, specs)
    expect(open.recurrence.items.some((r) => r.code === 'reconciliation_warning')).toBe(true)
    const p = weekly(WEEK, specs, { over: { [B1.id]: { access: { ...ALL_ACCESS, reports: false } } } })
    expect(p.recurrence.items.some((r) => r.branchKey === B1.key)).toBe(false)
    expect(p.limitations.some((l) => l.code === 'no_permission' && l.branchKey === B1.key)).toBe(true)
  })

  it('without weather.read the historical weather and the weather relationship are withheld', () => {
    const open = weekly(WEEK, weekSpecs(), { weatherDays: weatherDays(30) })
    expect(open.weather.relationships.length).toBeGreaterThan(0)
    const p = weekly(WEEK, weekSpecs(), { weatherDays: weatherDays(30), over: { [B1.id]: { access: { ...ALL_ACCESS, weather: false } }, [B2.id]: { access: { ...ALL_ACCESS, weather: false } } } })
    expect(p.weather.relationships).toEqual([])
    expect(p.weather.historical).toEqual([])
    expect(Object.keys(p.evidence).some((k) => k.startsWith('weather.'))).toBe(false)
  })

  it('waste and counts keep their own permission in the weekly report', () => {
    const p = weekly(WEEK, weekSpecs(), { over: { [B1.id]: { waste: noWasteParts, counts: noWasteParts }, [B2.id]: { waste: noWasteParts, counts: noWasteParts } } })
    expect(p.inventory.wasteEntries).toMatchObject({ support: 'unsupported', value: null })
    expect(p.inventory.countShortageBranches).toEqual([])
  })
})

describe('REPRODUCIBILITY — a report is exact / partial / live, derived from where its evidence comes from', () => {
  it('daily TODAY is live (live attention/procurement/forecast, open period) and says so', () => {
    const p = daily(TODAY, both(TODAY, z(2200), z(1800)))
    expect(p.reproducibility.state).toBe('live')
    expect(p.reproducibility.reasons).toEqual(expect.arrayContaining(['period_open', 'live_evidence']))
    expect(p.reproducibility.evidence.live).toBeGreaterThan(0)
    expect(p.limitations.map((l) => l.code)).toContain('live_state')
    const n = renderDailyNarrative(p)
    expect(n.limitations.map((l) => l.code)).toContain('live_state')
  })

  it('a HISTORICAL daily report is partial, never exact: the pinned snapshots are exact but revenue/waste/counts are mutable reads', () => {
    const p = daily(PAST, both(PAST, z(2200), z(1800)), { signals: null })
    expect(p.reproducibility.state).toBe('partial')
    expect(p.reproducibility.reasons).toEqual(['mutable_evidence'])
    expect(p.reproducibility.evidence.live).toBe(0)
    expect(p.limitations.map((l) => l.code)).toContain('mutable_sources')
    expect(p.limitations.map((l) => l.code)).not.toContain('live_state')
    // the snapshot-derived facts are immutable, the report-table facts are mutable
    expect(p.evidence[p.branches[0]!.transactions.ref!]!.origin).toBe('immutable')
    expect(p.evidence['org.revenue.final']!.origin).toBe('mutable')
  })

  it('the CURRENT week is live (open period) even when no live source is attached; with signals it also has live evidence', () => {
    const specs: Record<string, BranchSpec> = { [B1.id]: { [CURRENT]: z(1000) }, [B2.id]: { [CURRENT]: z(800) } }
    const noSignals = weekly(CURRENT, specs)
    expect(noSignals.reproducibility.state).toBe('live')
    expect(noSignals.reproducibility.reasons).toEqual(expect.arrayContaining(['period_open']))
    const withSignals = weekly(CURRENT, specs, { signals: true })
    expect(withSignals.reproducibility.state).toBe('live')
    expect(withSignals.reproducibility.evidence.live).toBeGreaterThan(0)
    expect(withSignals.limitations.map((l) => l.code)).toContain('live_state')
  })

  it('a COMPLETED historical week is EXACT only when every cited fact is snapshot-backed; mutable reads (waste/counts) make it partial', () => {
    const snapshotOnly = weekly(WEEK, weekSpecs(), { over: { [B1.id]: { waste: noWasteParts, counts: noWasteParts }, [B2.id]: { waste: noWasteParts, counts: noWasteParts } } })
    expect(snapshotOnly.reproducibility).toMatchObject({ state: 'exact', reasons: [] })
    expect(snapshotOnly.reproducibility.evidence.mutable + snapshotOnly.reproducibility.evidence.live).toBe(0)
    expect(snapshotOnly.limitations.map((l) => l.code)).not.toContain('live_state')
    expect(snapshotOnly.limitations.map((l) => l.code)).not.toContain('mutable_sources')

    const withWaste = weekly(WEEK, weekSpecs())
    expect(withWaste.reproducibility.state).toBe('partial')
    expect(withWaste.limitations.map((l) => l.code)).toContain('mutable_sources')
  })

  it('any live evidence prevents exact, whatever else is immutable', () => {
    const imm = { kind: 'fact', origin: 'immutable', support: 'complete', value: 1, unit: 'count', label: 'a' } as const
    const live = { ...imm, origin: 'live' } as const
    const mut = { ...imm, origin: 'mutable' } as const
    expect(reproducibilityOf({ a: imm }, false).state).toBe('exact')
    expect(reproducibilityOf({ a: imm, b: mut }, false).state).toBe('partial')
    expect(reproducibilityOf({ a: imm, b: mut, c: live }, false).state).toBe('live')
    expect(reproducibilityOf({ a: imm }, true).state).toBe('live')
  })

  it('the narrative carries the reproducibility limitation, and dropping it is rejected', () => {
    const p = daily(TODAY, both(TODAY, z(2200), z(1800)))
    const bad: Narrative = clone(renderDailyNarrative(p))
    bad.limitations = bad.limitations.filter((l) => l.code !== 'live_state')
    const v = validateNarrative(bad, p)
    expect(v.ok).toBe(false)
    expect(!v.ok && v.issues.map((i) => i.code)).toContain('missing_limitation')
  })
})

describe('HISTORICAL / LIVE BOUNDARY — a past report never borrows today\'s state', () => {
  it('a past daily report excludes today\'s attention, procurement, forecast, low-stock state and the tomorrow section even if live signals are handed in', () => {
    const p = daily(PAST, both(PAST, z(2200), z(1800)), { signals: richSignals(TODAY), alerts: 4 })
    expect(p.isCurrentDate).toBe(false)
    expect(p.attention).toMatchObject({ state: 'unavailable', reason: 'not_current_date', items: [], counts: null })
    expect(p.procurement).toMatchObject({ state: 'unavailable', reason: 'not_current_date' })
    expect(p.weather.forecast).toEqual([])
    expect(p.inventory.stockAlertBranches).toMatchObject({ support: 'unsupported' })
    expect(p.operations.openReconciliationBacklog.support).toBe('unsupported')
    expect(Object.keys(p.evidence).filter((k) => /^(attention\.|procurement\.|weather\.forecast)|stockAlert|backlog/.test(k))).toEqual([])
    const n = renderDailyNarrative(p)
    expect(n.sections.map((s) => s.code)).not.toContain('tomorrow')
    expect(text(n)).not.toContain('Yarın için takip')
    expect(text(n)).not.toMatch(/geciken|onay bekleyen|yağış tahmin/)
    expect(validateNarrative(n, p).ok).toBe(true)
  })

  it('a future date is refused', () => {
    expect(() => daily('2026-10-09', {}, {})).toThrow(/future/)
  })

  it('a completed historical week does not use today\'s procurement, low stock, forecast or attention, even if live signals are handed in', () => {
    const p = weekly(WEEK, weekSpecs(), { signals: true })
    expect(p.procurement).toMatchObject({ state: 'unavailable', reason: 'no_daily_history' })
    expect(Object.keys(p.evidence).filter((k) => /^(attention\.|procurement\.|weather\.forecast)/.test(k))).toEqual([])
    expect(p.recurrence.unsupported.map((u) => u.code)).toEqual(['low_stock', 'overdue_order'])
    expect(text(p)).not.toMatch(/forecast|isForecast|rainExpected/)
    const n = renderWeeklyNarrative(p)
    // (the static sentence that low stock / overdue orders are not stored per day is allowed; a COUNT of today's orders is not)
    expect(text(n)).not.toMatch(/\d+ (siparişin teslim tarihi geçti|sipariş onay bekliyor|sipariş bugün teslim)|yağış tahmin/)
    expect(validateNarrative(n, p).ok).toBe(true)
  })
})

describe('AI VALIDATOR — live / mutable evidence is never worded as an immutable historical fact', () => {
  it('rejects pinned/archived wording on a section citing live evidence', () => {
    const p = daily(TODAY, both(TODAY, z(2200), z(1800)))
    const bad = clone(renderDailyNarrative(p))
    const att = bad.sections.find((s) => s.code === 'attention')!
    expect(att.evidenceRefs.some((r) => p.evidence[r]!.origin === 'live')).toBe(true)
    att.body += '\nBu uyarılar arşivlenmiş, değişmez kayıtlardır.'
    const v = validateNarrative(bad, p)
    expect(!v.ok && v.issues.map((i) => i.code)).toContain('live_stated_as_historical')
  })

  it('rejects an exact-reproducibility claim in a report that is live or partial', () => {
    const p = daily(PAST, both(PAST, z(2200), z(1800)), { signals: null })
    expect(p.reproducibility.state).toBe('partial')
    const bad = clone(renderDailyNarrative(p))
    bad.executiveSummary += ' Bu özet yeniden üretilebilir.'
    const v = validateNarrative(bad, p)
    expect(!v.ok && v.issues.map((i) => i.code)).toContain('live_stated_as_historical')
  })

  it('rejects pinned wording on a mutable-evidence section even in an otherwise exact-looking report', () => {
    const p = weekly(WEEK, weekSpecs()) // partial: waste is a mutable read
    const bad = clone(renderWeeklyNarrative(p))
    const inv = bad.sections.find((s) => s.code === 'inventory')!
    inv.body += '\nFire kayıtları arşivlenmiş verilerdir.'
    expect(inv.evidenceRefs.some((r) => p.evidence[r]!.origin === 'mutable')).toBe(true)
    const v = validateNarrative(bad, p)
    expect(!v.ok && v.issues.map((i) => i.code)).toContain('live_stated_as_historical')
  })

  it('does not block ordinary wording on an exact, snapshot-only report', () => {
    const p = weekly(WEEK, weekSpecs(), { over: { [B1.id]: { waste: noWasteParts, counts: noWasteParts }, [B2.id]: { waste: noWasteParts, counts: noWasteParts } } })
    expect(p.reproducibility.state).toBe('exact')
    expect(validateNarrative(renderWeeklyNarrative(p), p).ok).toBe(true)
    const n = clone(renderWeeklyNarrative(p))
    const perf = n.sections.find((s) => s.code === 'performance')!
    expect(perf.evidenceRefs.every((r) => p.evidence[r]!.origin === 'immutable')).toBe(true)
    perf.body += '\nBu değerler kayıtlı anlık görüntülerden gelir ve değişmezdir.'
    expect(validateNarrative(n, p).ok).toBe(true)
  })
})
