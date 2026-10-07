import { describe, expect, it } from 'vitest'
import { buildDailyFactPack, renderDailyNarrative, validateNarrative, type DailyFactPack } from '.'
import { FACT_PACK_SCHEMA_VERSION } from './types'
import {
  BASE_NOW,
  dailyEnvelope,
  dailyReportInputs,
  dashboardFor,
  emptyCounts,
  emptyProcurement,
  FIXTURE_BRANCHES,
  noWaste,
  signalsFor,
  type BranchSpec,
} from './fixtures'
import type { BranchSignals } from '../commandCenter'

const TODAY = '2026-10-08'
const [B1, B2] = FIXTURE_BRANCHES as [(typeof FIXTURE_BRANCHES)[number], (typeof FIXTURE_BRANCHES)[number]]

function pack(
  date: string,
  specs: Record<string, BranchSpec>,
  opts: { branches?: typeof FIXTURE_BRANCHES; signals?: Record<string, BranchSignals | null> | null; report?: Parameters<typeof dailyReportInputs>[3]; alerts?: number } = {},
): DailyFactPack {
  const branches = opts.branches ?? FIXTURE_BRANCHES
  const d = dashboardFor(branches, date, specs, { alertCount: opts.alerts })
  return buildDailyFactPack({
    businessDate: date,
    now: BASE_NOW,
    branches,
    rows: d.branches,
    organization: d.organization,
    signals: opts.signals === undefined ? Object.fromEntries(branches.map((b) => [b.id, signalsFor(b.id, TODAY)])) : opts.signals,
    report: dailyReportInputs(branches, date, specs, opts.report),
  })
}

const z = (rev: number, tx: number | null = 40) => ({ x: [Math.round(rev / 2), tx === null ? null : Math.round(tx / 2)] as [number, number | null], z: [rev, tx] as [number, number | null], costed: true })
const both = (a: BranchSpec[string], b: BranchSpec[string]) => ({ [B1.id]: { [TODAY]: a }, [B2.id]: { [TODAY]: b } })

describe('daily fact pack — revenue rule (Z = finalized exactly Z, X-only = provisional, never X+Z)', () => {
  it('finalized clean day: organization revenue is the sum of the Z readings, never X+Z', () => {
    const p = pack(TODAY, both(z(2200), z(1800)))
    expect(p.schemaVersion).toBe(FACT_PACK_SCHEMA_VERSION)
    expect(p.reportType).toBe('daily')
    expect(p.organization.finalizedRevenue).toMatchObject({ support: 'complete', value: 4000, ref: 'org.revenue.final' })
    expect(p.organization.provisionalRevenue).toMatchObject({ support: 'unsupported', value: null })
    expect(p.organization.reportingCompleteness).toMatchObject({ finalizedBranches: 2, total: 2 })
    expect(p.branches.every((b) => b.finalization === 'finalized')).toBe(true)
    expect(p.completeness.overall).toBe('complete')
  })

  it('an X-only day is provisional: no finalized revenue, the X reading is exposed separately and partial', () => {
    const p = pack(TODAY, both({ x: [900, 20] }, { x: [700, 15] }))
    expect(p.organization.finalizedRevenue).toMatchObject({ support: 'unsupported', value: null, ref: null })
    expect(p.organization.finalizedRevenue.reasons).toContain('missing_z')
    expect(p.organization.provisionalRevenue).toMatchObject({ support: 'partial', value: 1600 })
    expect(p.branches.map((b) => b.finalization)).toEqual(['provisional', 'provisional'])
    expect(p.limitations.map((l) => l.code)).toContain('missing_z')
    expect(p.completeness.overall).toBe('partial')
    // a provisional day contributes no transactions / basket / final claims
    expect(p.branches[0]!.transactions.support).toBe('unsupported')
    expect(p.branches[0]!.finalizedRevenue.ref).toBeNull()
  })

  it('one branch finalized and one waiting for Z: the organization figure is partial and covers only the finalized branch', () => {
    const p = pack(TODAY, both(z(2200), { x: [700, 15] }))
    expect(p.organization.finalizedRevenue).toMatchObject({ support: 'partial', value: 2200 })
    expect(p.organization.provisionalRevenue).toMatchObject({ support: 'partial', value: 700 })
    expect(p.organization.reportingCompleteness).toMatchObject({ finalizedBranches: 1, provisionalBranches: 1, total: 2 })
    expect(p.evidence['org.revenue.final']!.support).toBe('partial')
  })

  it('Z below X: Z is used and the anomaly is surfaced', () => {
    const p = pack(TODAY, both({ x: [1500, 30], z: [1400, 30], costed: true }, z(1800)))
    expect(p.branches[0]!.finalizedRevenue.value).toBe(1400)
    expect(p.branches[0]!.anomalies.map((a) => a.code)).toEqual(['z_below_x'])
    const text = JSON.stringify(renderDailyNarrative(p))
    expect(text).toContain('Z değeri X değerinden küçük')
  })

  it('no reports: no data, nothing is reported as 0', () => {
    const p = pack(TODAY, {})
    expect(p.completeness.overall).toBe('no_data')
    expect(p.organization.finalizedRevenue.value).toBeNull()
    expect(p.organization.transactions.value).toBeNull()
    expect(p.branches.every((b) => b.finalizedRevenue.value === null)).toBe(true)
  })

  it('a real zero stays 0 and complete (zero is not unavailable)', () => {
    const p = pack(TODAY, both({ z: [0, 0] }, { z: [0, 0] }))
    expect(p.organization.finalizedRevenue).toMatchObject({ support: 'complete', value: 0 })
    expect(p.evidence['org.revenue.final']!.value).toBe(0)
  })

  it('is deterministic and versioned: the same inputs give the same pack', () => {
    const a = pack(TODAY, both(z(2200), z(1800)))
    const b = pack(TODAY, both(z(2200), z(1800)))
    expect(a).toEqual(b)
    expect(a.provenance.factSchemaVersion).toBe('manager_fact_pack.v1')
  })
})

describe('daily fact pack — supported metrics and limitations', () => {
  it('legacy (imported) data does not support transactions: transactions/basket stay unsupported and the limitation is carried', () => {
    const p = pack(TODAY, both({ ...z(2000, null), legacy: true }, { ...z(1000, null), legacy: true }))
    expect(p.organization.transactions).toMatchObject({ support: 'unsupported', value: null })
    expect(p.organization.averageBasket.value).toBeNull()
    expect(p.limitations.map((l) => l.code)).toEqual(expect.arrayContaining(['missing_transaction_count', 'legacy_source_limitation']))
    const n = renderDailyNarrative(p)
    expect(JSON.stringify(n)).toContain('İşlem sayısı bu veri kaynağında desteklenmediği için ortalama sepet karşılaştırması yapılmadı.')
    expect(validateNarrative(n, p).ok).toBe(true)
  })

  it('transactions are summed only when every branch supports them; otherwise partial', () => {
    const p = pack(TODAY, both(z(2200, 44), { ...z(1000, null) }))
    expect(p.organization.transactions.support).toBe('partial')
    expect(p.organization.transactions.value).toBe(44)
    expect(p.organization.averageBasket).toMatchObject({ support: 'unsupported', reasons: ['organization_aggregate_not_defined'] })
  })

  it('a missing snapshot / a stale snapshot withholds analytics-derived measures but keeps the live revenue', () => {
    const missing = pack(TODAY, both(z(2200), z(1800)), { report: { [B1.id]: { daily: { envelope: { state: 'missing' }, insights: [] } } } })
    expect(missing.branches[0]!.finalizedRevenue.value).toBe(2200)
    expect(missing.branches[0]!.transactions).toMatchObject({ support: 'unsupported', reasons: ['snapshot_missing'] })
    expect(missing.limitations.some((l) => l.code === 'snapshot_missing' && l.branchKey === B1.key)).toBe(true)

    const specs = both(z(2200), z(1800))
    const stale = pack(TODAY, specs, { report: { [B1.id]: { daily: { envelope: dailyEnvelope(B1.id, TODAY, specs[B1.id]!, 'stale'), insights: [] } } } })
    expect(stale.branches[0]!.transactions.reasons).toContain('snapshot_stale')
    expect(stale.limitations.some((l) => l.code === 'snapshot_stale')).toBe(true)
  })

  it('a snapshot that disagrees with the live finalized revenue is treated as stale (never mixed with it)', () => {
    const specs = both(z(2200), z(1800))
    const lagging = { [B1.id]: { [TODAY]: z(2000) } } // snapshot computed from an older Z
    const p = pack(TODAY, specs, { report: { [B1.id]: { daily: { envelope: dailyEnvelope(B1.id, TODAY, lagging[B1.id]!), insights: [] } } } })
    expect(p.branches[0]!.finalizedRevenue.value).toBe(2200)
    expect(p.branches[0]!.transactions.reasons).toContain('snapshot_stale')
  })

  it('same-weekday comparison is carried only when the analytics engine says ok', () => {
    const lastWeek = '2026-10-01'
    const specs: Record<string, BranchSpec> = { [B1.id]: { [TODAY]: z(2200), [lastWeek]: z(2000) }, [B2.id]: { [TODAY]: z(1800) } }
    const p = pack(TODAY, specs)
    const c = p.branches[0]!.vsSameWeekdayLastWeek
    expect(c?.state).toBe('ok')
    expect(c?.pct).toBe(10)
    expect(p.evidence[c!.ref!]).toMatchObject({ value: 10, unit: 'pct' })
    expect(p.branches[1]!.vsSameWeekdayLastWeek?.pct).toBeNull()
  })

  it('an unreadable branch is a limitation, never an all-clear', () => {
    const p = pack(TODAY, both(z(2200), z(1800)), { report: { [B2.id]: null } })
    expect(p.limitations.some((l) => l.code === 'source_unavailable' && l.branchKey === B2.key)).toBe(true)
    // the unreadable branch contributes nothing, and the organization total is partial because the scope is still 2 branches
    expect(p.branches.map((x) => x.branchKey)).toEqual([B1.key])
    expect(p.organization.finalizedRevenue).toMatchObject({ support: 'partial', value: 2200 })
    expect(p.organization.reportingCompleteness).toMatchObject({ finalizedBranches: 1, total: 2 })
  })

  it('gross profit: complete when fully costed, unsupported/partial (with the limitation) when products are uncosted, always gross', () => {
    const full = pack(TODAY, both(z(2200), z(1800)))
    expect(full.organization.grossProfit).toMatchObject({ support: 'complete', value: 2400 })
    expect(full.evidence['org.grossProfit']!.label).toContain('net kâr değil')
    expect(full.limitations.some((l) => l.code === 'missing_cost')).toBe(false)

    const uncosted = pack(TODAY, both({ ...z(2200), costed: false }, { ...z(1800), costed: false }))
    expect(uncosted.organization.grossProfit.support).not.toBe('complete')
    expect(uncosted.limitations.some((l) => l.code === 'missing_cost')).toBe(true)
    expect(uncosted.completeness.overall).toBe('complete') // the revenue picture is complete; only the gross-profit metric is limited
    expect(JSON.stringify(renderDailyNarrative(uncosted))).not.toMatch(/Brüt kâr [0-9]/)
  })
})

describe('daily fact pack — operations, inventory, procurement, weather', () => {
  const specs = both(z(2200), { ...z(1800), recon: 'ERROR' })

  it('reuses the existing attention feed: a reconciliation ERROR is critical and cited by evidence id', () => {
    const p = pack(TODAY, specs)
    expect(p.attention.state).toBe('available')
    const err = p.attention.items.find((i) => i.reasonCode === 'reconciliation_error')
    expect(err).toMatchObject({ severity: 'critical', branchKey: B2.key })
    expect(p.evidence[err!.ref]).toBeDefined()
    expect(p.attention.counts!.critical).toBeGreaterThanOrEqual(1)
    expect(p.operations.reconciliationError.value).toBe(2) // the X and the Z report of the day both carry the error
  })

  it('count shortage, missing closing count and timing-uncertain are facts from the count read model', () => {
    const counts = {
      ...emptyCounts(B1.id, TODAY),
      todayStatus: 'submitted' as const,
      latestCountId: 'c1',
      latestSummary: null,
      recent: [
        {
          id: 'c1',
          businessDate: TODAY,
          status: 'submitted' as const,
          submittedAt: `${TODAY}T20:00:00Z`,
          shiftId: null,
          submittedBy: null,
          employeeCode: null,
          voidReason: null,
          summary: { lines: 10, balancedLines: 6, shortageLines: 4, surplusLines: 0, timingUncertainLines: 1, unexplainedLines: 3, unexplainedQuantityByUnit: [], timingUncertainQuantityByUnit: [], shortageQuantityByUnit: [], surplusQuantityByUnit: [], varianceValue: { state: 'unavailable' as const } },
        },
      ],
    }
    const missing = { ...emptyCounts(B2.id, TODAY), recent: [{ ...counts.recent[0]!, id: 'c0', businessDate: '2026-10-07' }] }
    const p = pack(TODAY, specs, { report: { [B1.id]: { counts: { state: 'available', data: counts } }, [B2.id]: { counts: { state: 'available', data: missing } } } })
    expect(p.branches[0]!.closingCount).toBe('submitted')
    expect(p.branches[0]!.countOutcome?.unexplainedLines.value).toBe(3)
    expect(p.branches[0]!.countOutcome?.timingUncertainLines.value).toBe(1)
    expect(p.branches[1]!.closingCount).toBe('missing')
    expect(p.inventory.unexplainedShortageBranches).toEqual([B1.name])
    expect(p.inventory.timingUncertainBranches).toEqual([B1.name])
    expect(p.inventory.countsMissingBranches).toEqual([B2.name])
    const n = JSON.stringify(renderDailyNarrative(p))
    expect(n).toContain('fire zamanı belirsiz; nedeni doğrulanmadı')
    expect(n).not.toMatch(/fire.*(açıkladı|sebep)/)
  })

  it('procurement: counts come from the existing attention read model', () => {
    const brief = { id: 'o1', orderNumber: 'PO-1', status: 'SUBMITTED' as const, supplierName: 'Tedarikçi', expectedDeliveryDate: '2026-10-06', submittedAt: null, lineCount: 2, receivedLineCount: 0 }
    const sig = signalsFor(B1.id, TODAY, { procurement: { state: 'available', data: { ...emptyProcurement(B1.id, TODAY), overdueDelivery: [brief], awaitingApproval: [brief, brief] } } })
    const p = pack(TODAY, specs, { signals: { [B1.id]: sig, [B2.id]: signalsFor(B2.id, TODAY) } })
    expect(p.procurement.state).toBe('available')
    expect(p.procurement.overdue).toMatchObject({ support: 'complete', value: 1 })
    expect(p.procurement.awaitingApproval.value).toBe(2)
    expect(p.procurement.dueToday.value).toBe(0)
  })

  it('stale weather forecast: limitation carried, forecast labelled and never historical', () => {
    const stale: BranchSignals = signalsFor(B1.id, TODAY, {
      weather: {
        state: 'available',
        data: {
          status: 'stale',
          staleReason: 'expired',
          isForecast: true,
          provider: 'test',
          timezone: 'Europe/Istanbul',
          fetchedAt: '2026-10-08T05:00:00Z',
          generatedAt: null,
          validUntil: '2026-10-08T06:00:00Z',
          ageMinutes: 240,
          location: { label: null },
          current: { time: '2026-10-08T05:00:00Z', temperatureC: 18, apparentTemperatureC: null, weatherCode: null, precipitationMm: null, windKmh: null, windGustKmh: null },
          hourly: [{ time: '2026-10-08T10:00:00Z', temperatureC: 17, apparentTemperatureC: null, precipitationProbability: 80, precipitationMm: 2, weatherCode: null, windKmh: null, windGustKmh: null }],
          daily: [],
        },
      },
    })
    const p = pack(TODAY, specs, { signals: { [B1.id]: stale, [B2.id]: signalsFor(B2.id, TODAY) } })
    expect(p.weather.forecast[0]).toMatchObject({ status: 'stale', ageMinutes: 240, rainExpected: true })
    expect(p.limitations.some((l) => l.code === 'stale_weather')).toBe(true)
    expect(p.weather.historical).toEqual([]) // a forecast is never presented as historical context
    const n = JSON.stringify(renderDailyNarrative(p))
    expect(n).toContain('tahmin')
    expect(n).not.toMatch(/ölçüldü|gözlemlendi/)
  })

  it('a past date has no live sources: attention/procurement/forecast are unavailable and limited, the date stays reproducible', () => {
    const past = '2026-10-07'
    const specsPast: Record<string, BranchSpec> = { [B1.id]: { [past]: z(2200) }, [B2.id]: { [past]: z(1800) } }
    const p = pack(past, specsPast)
    expect(p.isCurrentDate).toBe(false)
    expect(p.attention).toMatchObject({ state: 'unavailable', reason: 'not_current_date', items: [] })
    expect(p.procurement.state).toBe('unavailable')
    expect(p.weather.forecast).toEqual([])
    expect(p.limitations.some((l) => l.code === 'not_current_date')).toBe(true)
    expect(p.inventory.stockAlertBranches.support).toBe('unsupported')
    expect(p.reproducibility.state).toBe('partial') // snapshots are pinned, but revenue/waste/counts are ordinary tables that can still change
    expect(p.provenance.snapshots).toHaveLength(2)
  })

  it('historical context of a completed date keeps its provenance (reanalysis is modelled, not observed)', () => {
    const past = '2026-10-07'
    const ctx = { state: 'present' as const, temperatureC: 18.25, precipitationMm: 0, isWeekend: false, provenance: 'reanalysis' as const, source: 'open-meteo' }
    const specsPast: Record<string, BranchSpec> = { [B1.id]: { [past]: { ...z(2200), context: ctx } }, [B2.id]: { [past]: z(1800) } }
    const p = pack(past, specsPast)
    const h = p.weather.historical.find((x) => x.branchKey === B1.key)!
    expect(h).toMatchObject({ state: 'present', provenance: 'reanalysis', temperatureC: 18.3 })
    expect(p.weather.historical.find((x) => x.branchKey === B2.key)!.state).toBe('missing')
    expect(p.limitations.some((l) => l.code === 'missing_context' && l.branchKey === B2.key)).toBe(true)
    const n = JSON.stringify(renderDailyNarrative(p))
    expect(n).toContain('modellenmiş geçmiş veri, doğrudan ölçüm değil')
    expect(n).not.toContain('gözlem')
  })
})

describe('daily narrative (deterministic renderer)', () => {
  it('renders the 8 daily sections in order and passes the validator for every scenario', () => {
    const scenarios = [pack(TODAY, both(z(2200), z(1800))), pack(TODAY, both({ x: [900, 20] }, { x: [700, 15] })), pack(TODAY, both(z(2200), { x: [700, 15] })), pack(TODAY, {}), pack(TODAY, both({ ...z(2000, null), legacy: true }, { ...z(1000, null), legacy: true }))]
    for (const p of scenarios) {
      const n = renderDailyNarrative(p)
      const v = validateNarrative(n, p)
      expect(v.ok, JSON.stringify(v)).toBe(true)
      expect(n.sections.map((s) => s.code).slice(0, 2)).toEqual(['result', 'attention'])
      expect(n.reportType).toBe('daily')
    }
    const full = renderDailyNarrative(scenarios[0]!)
    expect(full.sections.map((s) => s.code)).toEqual(['result', 'attention', 'branches', 'operations', 'inventory', 'procurement', 'weather', 'tomorrow'])
    expect(full.headline).toContain('4.000,00 ₺')
  })

  it('an X-only day never reads as finalized revenue', () => {
    const n = renderDailyNarrative(pack(TODAY, both({ x: [900, 20] }, { x: [700, 15] })))
    const text = JSON.stringify(n)
    expect(n.headline).toContain('henüz kesinleşmedi')
    expect(text).toContain('Geçici (yalnızca X) ciro 1.600,00 ₺')
    expect(text).not.toContain('kesinleşmiş ciro 1.600')
  })

  it('carries every limitation and states unavailable sources honestly', () => {
    const p = pack(TODAY, both(z(2200), z(1800)), { report: { [B2.id]: null } })
    const n = renderDailyNarrative(p)
    expect(new Set(n.limitations.map((l) => l.code))).toEqual(new Set(p.limitations.map((l) => l.code)))
  })

  it('is deterministic', () => {
    const p = pack(TODAY, both(z(2200), z(1800)))
    expect(renderDailyNarrative(p)).toEqual(renderDailyNarrative(p))
  })

  it('uses no causal language', () => {
    const p = pack(TODAY, both(z(2200), { ...z(1800), recon: 'ERROR' }))
    expect(JSON.stringify(renderDailyNarrative(p))).not.toMatch(/nedeniyle|yüzünden|çünkü|sebebiyle/i)
  })

  it('does not name a no-data day as a result', () => {
    const p = pack(TODAY, {}, { branches: [B1] })
    const n = renderDailyNarrative(p)
    expect(n.headline).toContain('henüz rapor yok')
    expect(noWaste(B1.id, TODAY).entries).toBe(0)
  })
})
