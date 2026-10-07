import { describe, expect, it } from 'vitest'
import { buildWeeklyFactPack, renderWeeklyNarrative, validateNarrative, type WeeklyFactPack } from '.'
import type { WeatherDay } from '../analytics'
import { addDaysIso } from '../../utils/dates'
import { BASE_NOW, cleanWeekSpec, FIXTURE_BRANCHES, signalsFor, weeklyReportInputs, type BranchSpec } from './fixtures'

const [B1, B2] = FIXTURE_BRANCHES as [(typeof FIXTURE_BRANCHES)[number], (typeof FIXTURE_BRANCHES)[number]]
const TODAY = '2026-10-08' // Thursday
const WEEK = '2026-09-28' // Monday; complete (ends 2026-10-04)
const PREV = '2026-09-21'
const CURRENT = '2026-10-05'

function weekly(
  weekStart: string,
  specs: Record<string, BranchSpec>,
  opts: { branches?: typeof FIXTURE_BRANCHES; over?: Parameters<typeof weeklyReportInputs>[4]; weatherDays?: WeatherDay[]; signals?: boolean } = {},
): WeeklyFactPack {
  const branches = opts.branches ?? FIXTURE_BRANCHES
  return buildWeeklyFactPack({
    weekStart,
    now: BASE_NOW,
    branches,
    report: weeklyReportInputs(branches, weekStart, TODAY, specs, opts.over, opts.weatherDays),
    signals: opts.signals ? Object.fromEntries(branches.map((b) => [b.id, signalsFor(b.id, TODAY)])) : null,
  })
}

const REV1 = [1000, 1200, 900, 1100, 1500, 2000, 1800] // 9500
const REV2 = [800, 700, 600, 900, 1000, 1400, 1300] // 6700
const PREV1 = [900, 1000, 900, 1000, 1400, 1800, 1600] // 8600
const PREV2 = [800, 700, 600, 900, 1000, 1400, 1300] // 6700
const clean = (): Record<string, BranchSpec> => ({
  [B1.id]: { ...cleanWeekSpec(PREV, PREV1), ...cleanWeekSpec(WEEK, REV1) },
  [B2.id]: { ...cleanWeekSpec(PREV, PREV2), ...cleanWeekSpec(WEEK, REV2) },
})

describe('weekly fact pack — complete week (Monday..Sunday, finalized revenue only)', () => {
  const p = weekly(WEEK, clean())

  it('covers Monday..Sunday and is complete', () => {
    expect(p.reportType).toBe('weekly')
    expect(p.weekStart).toBe('2026-09-28')
    expect(p.weekEnd).toBe('2026-10-04')
    expect(p.weekComplete).toBe(true)
    expect(p.completeness.overall).toBe('complete')
    expect(p.branches[0]!.days.map((d) => d.date)).toEqual(Array.from({ length: 7 }, (_, i) => addDaysIso(WEEK, i)))
  })

  it('weekly revenue is the sum of finalized Z days (never X+Z)', () => {
    expect(p.branches[0]!.finalizedRevenue).toMatchObject({ support: 'complete', value: 9500 })
    expect(p.branches[1]!.finalizedRevenue.value).toBe(6700)
    expect(p.organization.finalizedRevenue).toMatchObject({ support: 'complete', value: 16200, ref: 'org.revenue.final' })
    expect(p.organization.provisionalRevenue.value).toBeNull()
  })

  it('compares with the previous supported week from the snapshot comparison (no recomputation of revenue)', () => {
    // (16200 - 15300) / 15300 = 5.9 %
    expect(p.organization.vsPreviousWeek).toMatchObject({ support: 'complete', baseline: 15300, delta: 900, pct: 5.9 })
    expect(p.branches[0]!.vsPreviousWeek).toMatchObject({ state: 'ok', baseline: 8600, delta: 900 })
    expect(p.branches[1]!.vsPreviousWeek.pct).toBe(0)
  })

  it('finds the strongest and the weakest finalized day (organization and branch level)', () => {
    expect(p.organization.dailySeries).toHaveLength(7)
    expect(p.organization.strongestDay).toMatchObject({ date: '2026-10-03', revenue: 3400 })
    expect(p.organization.weakestDay).toMatchObject({ date: '2026-09-30', revenue: 1500 })
    expect(p.branches[0]!.strongestDay?.date).toBe('2026-10-03')
    expect(p.branches[1]!.weakestDay?.date).toBe('2026-09-30')
  })

  it('renders the 9 weekly sections and passes the validator', () => {
    const n = renderWeeklyNarrative(p)
    expect(validateNarrative(n, p)).toMatchObject({ ok: true })
    expect(n.sections.map((s) => s.code)).toEqual(['summary', 'performance', 'branches', 'issues', 'inventory', 'procurement', 'weather', 'quality'])
    const text = JSON.stringify(n)
    expect(text).toContain('16.200,00 ₺')
    expect(text).toContain('%5,9 artış')
    expect(text).toContain('En güçlü gün 3 Ekim 2026')
  })

  it('is deterministic', () => {
    expect(weekly(WEEK, clean())).toEqual(p)
    expect(renderWeeklyNarrative(p)).toEqual(renderWeeklyNarrative(weekly(WEEK, clean())))
  })

  it('refuses a week that does not start on a Monday', () => {
    expect(() => weekly('2026-09-29', clean())).toThrow(/Monday/)
  })

  it('pins the snapshot versions it was built from', () => {
    expect(p.provenance.snapshots).toHaveLength(2)
    expect(p.reproducibility.state).toBe('partial') // the weekly/daily snapshots are exact; the waste report and counts are mutable reads
    expect(p.provenance.factSchemaVersion).toBe('manager_fact_pack.v1')
  })
})

describe('weekly fact pack — incomplete (current) week', () => {
  const specs = (): Record<string, BranchSpec> => ({
    [B1.id]: { ...cleanWeekSpec(PREV, PREV1), [CURRENT]: { z: [1000, 40], costed: true }, [addDaysIso(CURRENT, 1)]: { z: [1200, 40], costed: true }, [addDaysIso(CURRENT, 2)]: { z: [900, 40], costed: true }, [TODAY]: { x: [400, 10] } },
    [B2.id]: { ...cleanWeekSpec(PREV, PREV2), [CURRENT]: { z: [800, 40], costed: true } },
  })

  it('is partial, labelled in-progress, and today\'s X-only reading is not a missing Z', () => {
    const p = weekly(CURRENT, specs(), { signals: true })
    expect(p.weekComplete).toBe(false)
    expect(p.completeness.overall).toBe('partial')
    expect(p.limitations.map((l) => l.code)).toContain('incomplete_week')
    expect(p.organization.finalizedRevenue.support).toBe('partial')
    expect(p.organization.finalizedRevenue.reasons).toContain('week_in_progress')
    expect(p.operations.missingZDays.value).toBe(0)
    // strongest / weakest day exist only for a completed week
    expect(p.organization.strongestDay).toBeNull()
    expect(p.branches[0]!.weakestDay).toBeNull()
    expect(JSON.stringify(renderWeeklyNarrative(p))).toContain('hafta tamamlandığında belirlenir')
    // no comparison is made with an unfinished week
    expect(p.organization.vsPreviousWeek.support).toBe('unsupported')
    const n = renderWeeklyNarrative(p)
    expect(n.headline).toContain('hafta sürüyor')
    expect(JSON.stringify(n)).toContain('hafta henüz bitmedi')
    expect(validateNarrative(n, p).ok).toBe(true)
  })

  it('procurement (current-state) is included only for the week containing today', () => {
    expect(weekly(CURRENT, specs(), { signals: true }).procurement.state).toBe('available')
    const past = weekly(WEEK, clean(), { signals: true })
    expect(past.procurement).toMatchObject({ state: 'unavailable', reason: 'no_daily_history' })
    expect(past.limitations.map((l) => l.code)).toContain('no_daily_history')
  })

  it('has no forecast at all: weekly weather is historical context only', () => {
    const p = weekly(CURRENT, specs(), { signals: true })
    expect(JSON.stringify(p)).not.toMatch(/forecast|isForecast|rainExpected/)
  })
})

describe('weekly fact pack — comparisons across origins', () => {
  it('native week vs legacy previous week: revenue comparison is flagged mixed, transactions/basket comparisons are refused', () => {
    const legacyPrev = (rev: number[]): BranchSpec => {
      const s = cleanWeekSpec(PREV, rev)
      for (const d of Object.keys(s)) s[d] = { ...s[d]!, legacy: true, x: undefined, z: [s[d]!.z![0], null] }
      return s
    }
    const p = weekly(WEEK, { [B1.id]: { ...legacyPrev(PREV1), ...cleanWeekSpec(WEEK, REV1) }, [B2.id]: { ...legacyPrev(PREV2), ...cleanWeekSpec(WEEK, REV2) } })
    expect(p.branches[0]!.vsPreviousWeek.state).toBe('ok')
    expect(p.branches[0]!.vsPreviousWeek.mixedOrigin).toBe(true)
    expect(p.organization.vsPreviousWeek.reasons).toContain('mixed_origin')
    expect(p.branches[0]!.transactionsVsPreviousWeek.state).not.toBe('ok')
    expect(p.branches[0]!.basketVsPreviousWeek.state).not.toBe('ok')
    expect(p.limitations.map((l) => l.code)).toContain('mixed_origin')
    const n = renderWeeklyNarrative(p)
    expect(JSON.stringify(n)).toContain('eski ve yeni sistem verisini birlikte içerir')
    expect(validateNarrative(n, p).ok).toBe(true)
  })

  it('transactions unsupported (legacy source): the comparison is never made silently', () => {
    const legacy = (rev: number[], week: string): BranchSpec => {
      const s = cleanWeekSpec(week, rev)
      for (const d of Object.keys(s)) s[d] = { ...s[d]!, legacy: true, x: undefined, z: [s[d]!.z![0], null] }
      return s
    }
    const p = weekly(WEEK, { [B1.id]: { ...legacy(PREV1, PREV), ...legacy(REV1, WEEK) }, [B2.id]: { ...legacy(PREV2, PREV), ...legacy(REV2, WEEK) } })
    expect(p.organization.transactions.support).toBe('unsupported')
    expect(p.limitations.map((l) => l.code)).toEqual(expect.arrayContaining(['missing_transaction_count', 'legacy_source_limitation']))
    const n = renderWeeklyNarrative(p)
    expect(JSON.stringify(n)).toContain('İşlem sayısı bu veri kaynağında desteklenmediği için ortalama sepet karşılaştırması yapılmadı.')
    expect(validateNarrative(n, p).ok).toBe(true)
  })

  it('one branch without a usable previous week: no organization-level comparison (reason kept)', () => {
    const specs = clean()
    specs[B2.id] = cleanWeekSpec(WEEK, REV2) // no previous week for B2
    const p = weekly(WEEK, specs)
    expect(p.organization.vsPreviousWeek).toMatchObject({ support: 'unsupported', pct: null })
    expect(p.limitations.map((l) => l.code)).toContain('no_comparison_baseline')
    expect(JSON.stringify(renderWeeklyNarrative(p))).toContain('Önceki haftayla karşılaştırma yapılamadı')
  })
})

describe('weekly fact pack — recurrence (frequency only, no invented thresholds)', () => {
  const specs = (): Record<string, BranchSpec> => {
    const s = clean()
    const b1 = s[B1.id]!
    // missing Z on 3 days (X only), reconciliation warning on 2 days, Z below X on 1 day
    for (const d of ['2026-09-28', '2026-09-30', '2026-10-02']) b1[d] = { x: [500, 10], costed: true }
    for (const d of ['2026-09-29', '2026-10-01']) b1[d] = { ...b1[d]!, recon: 'WARNING' }
    b1['2026-10-03'] = { x: [2200, 40], z: [2000, 40], costed: true }
    return s
  }
  const p = weekly(WEEK, specs())

  it('counts the days an issue occurred instead of labelling it', () => {
    const missing = p.recurrence.items.find((i) => i.code === 'missing_z' && i.branchKey === B1.key)!
    expect(missing).toMatchObject({ days: 3, dates: ['2026-09-28', '2026-09-30', '2026-10-02'] })
    expect(p.recurrence.items.find((i) => i.code === 'reconciliation_warning')).toMatchObject({ days: 2, branchKey: B1.key })
    expect(p.recurrence.items.find((i) => i.code === 'z_below_x')).toMatchObject({ days: 1 })
    expect(p.operations.missingZDays.value).toBe(3)
    expect(p.operations.reconciliationWarningDays.value).toBe(2)
    expect(p.recurrence.items[0]!.days).toBeGreaterThanOrEqual(p.recurrence.items.at(-1)!.days)
  })

  it('a week with provisional days is not final and is worded with the frequency', () => {
    expect(p.branches[0]!.finalizedRevenue.support).toBe('partial')
    expect(p.limitations.map((l) => l.code)).toContain('missing_z')
    const n = renderWeeklyNarrative(p)
    const text = JSON.stringify(n)
    expect(text).toContain('Z raporu eksikliği bu hafta 3 gün görüldü')
    expect(text).not.toMatch(/sürekli|tekrarlayan sorun|kritik tekrar/)
    expect(validateNarrative(n, p).ok).toBe(true)
  })

  it('low stock and overdue orders are explicitly unsupported (no daily history), never invented', () => {
    expect(p.recurrence.unsupported.map((u) => u.code)).toEqual(['low_stock', 'overdue_order'])
    expect(JSON.stringify(renderWeeklyNarrative(p))).toContain('geçmişe dönük saklanmadığı için haftalık tekrar sayımı yapılamadı')
  })

  it('days without a stored daily snapshot make the counts partial', () => {
    const incomplete = clean()
    const over = { [B1.id]: { days: weeklyReportInputs([B1], WEEK, TODAY, incomplete)[B1.id]!.days!.map((d) => (d.date === '2026-09-30' ? { date: d.date, state: 'missing' as const } : d)) } }
    const q = weekly(WEEK, incomplete, { over })
    expect(q.operations.reconciliationWarningDays.support).toBe('partial')
    expect(q.limitations.some((l) => l.code === 'no_daily_history' && l.branchKey === B1.key)).toBe(true)
  })
})

describe('weekly fact pack — weather context and relationships', () => {
  const ctx = (_date: string, t: number, mm: number) => ({ state: 'present' as const, temperatureC: t, precipitationMm: mm, isWeekend: false, provenance: 'reanalysis' as const, source: 'open-meteo' })
  const days = (n: number): WeatherDay[] =>
    Array.from({ length: n }, (_, i) => ({ date: addDaysIso('2026-09-03', i), revenue: 1000 + (i % 7) * 100 + (i % 3 === 0 ? -150 : 150), temperatureC: 10 + i * 0.5, precipitationMm: i % 4 === 0 ? 3 : 0 }))

  it('weekly historical context keeps provenance; reanalysis is never described as observed', () => {
    const specs = clean()
    specs[B1.id]![WEEK] = { ...specs[B1.id]![WEEK]!, context: ctx(WEEK, 17.46, 0) }
    const p = weekly(WEEK, specs)
    const h = p.weather.historical.find((x) => x.date === WEEK && x.branchKey === B1.key)!
    expect(h).toMatchObject({ provenance: 'reanalysis', temperatureC: 17.5 })
    expect(p.evidence[h.ref!]!.label).toContain('modellenmiş geçmiş veri')
    const text = JSON.stringify(renderWeeklyNarrative(p))
    expect(text).toContain('modellenmiş geçmiş veri; doğrudan ölçüm değildir')
    expect(text).not.toMatch(/gözlem|ölçüldü/)
  })

  it('a supported relationship is an association with its sample, never a cause', () => {
    const p = weekly(WEEK, clean(), { weatherDays: days(30) })
    const rel = p.weather.relationships.find((r) => r.branchKey === B1.key)!
    expect(rel.state).toBe('ok')
    expect(rel.sample).toBeGreaterThanOrEqual(14)
    expect(p.evidence[rel.refs.sample!]).toMatchObject({ kind: 'relationship', support: 'complete' })
    const n = renderWeeklyNarrative(p)
    const section = n.sections.find((s) => s.code === 'weather')!
    expect(section.body).toContain('ilişki')
    expect(section.body).toContain('neden-sonuç iddiası değildir')
    expect(JSON.stringify(n)).not.toMatch(/nedeniyle|yüzünden|çünkü|sebebiyle/i)
    expect(validateNarrative(n, p).ok, JSON.stringify(validateNarrative(n, p))).toBe(true)
  })

  it('insufficient sample: stated explicitly, no relationship is claimed', () => {
    const p = weekly(WEEK, clean(), { weatherDays: days(6) })
    const rel = p.weather.relationships[0]!
    expect(rel.state).toBe('insufficient_sample')
    expect(rel.rainDifferencePct).toBeNull()
    expect(p.limitations.map((l) => l.code)).toContain('insufficient_sample')
    const n = renderWeeklyNarrative(p)
    expect(n.sections.find((s) => s.code === 'weather')!.body).toContain('yeterli örnek yok')
    expect(validateNarrative(n, p).ok).toBe(true)
  })

  it('no weather context at all: a limitation, not a statement', () => {
    const p = weekly(WEEK, clean())
    expect(p.weather.relationships[0]!.state).toBe('no_context')
    expect(p.limitations.map((l) => l.code)).toContain('missing_context')
  })
})

describe('weekly fact pack — cost, waste, counts and unavailable sources', () => {
  it('partial / unavailable cost is carried as partial / unsupported, never as zero', () => {
    const specs: Record<string, BranchSpec> = { [B1.id]: cleanWeekSpec(WEEK, REV1, 40, false), [B2.id]: cleanWeekSpec(WEEK, REV2, 40, false) }
    // even fully costed Z-only lines stay partial: the analytics engine does not yet verify that Z lines are the whole day
    const base = weekly(WEEK, specs)
    expect(base.organization.grossProfit.support).toBe('partial')
    expect(base.limitations.map((l) => l.code)).toContain('line_semantics_unverified')
    for (const d of ['2026-09-28', '2026-09-29']) specs[B1.id]![d] = { ...specs[B1.id]![d]!, costed: false }
    const p = weekly(WEEK, specs)
    expect(p.branches[0]!.grossProfit.support).not.toBe('complete')
    expect(p.organization.grossProfit.support).not.toBe('complete')
    expect(p.limitations.map((l) => l.code)).toContain('missing_cost')
    expect(JSON.stringify(renderWeeklyNarrative(p))).not.toMatch(/Brüt kâr 0,00/)
  })

  it('waste of the week and count findings come from the inventory-control read models', () => {
    const waste = {
      branchId: B1.id,
      from: WEEK,
      to: '2026-10-04',
      entries: 4,
      reversedEntries: 0,
      cost: { state: 'partial' as const, value: 120.5 },
      costCoverage: { state: 'partial' as const, costedEntries: 3, entries: 4 },
      quantityByUnit: [],
      byItem: [],
      byReason: [],
      byEmployee: [],
      byShift: [],
    }
    const counts = {
      branchId: B2.id,
      today: TODAY,
      todayStatus: 'missing' as const,
      latestCountId: 'c1',
      latestSummary: null,
      recent: [{ id: 'c1', businessDate: '2026-10-01', status: 'submitted' as const, submittedAt: '2026-10-01T20:00:00Z', shiftId: null, submittedBy: null, employeeCode: null, voidReason: null, summary: { lines: 5, balancedLines: 3, shortageLines: 2, surplusLines: 0, timingUncertainLines: 1, unexplainedLines: 1, unexplainedQuantityByUnit: [], timingUncertainQuantityByUnit: [], shortageQuantityByUnit: [], surplusQuantityByUnit: [], varianceValue: { state: 'unavailable' as const } } }],
    }
    const p = weekly(WEEK, clean(), { over: { [B1.id]: { waste: { state: 'available', data: waste } }, [B2.id]: { counts: { state: 'available', data: counts } } } })
    expect(p.inventory.wasteEntries).toMatchObject({ value: 4 })
    expect(p.inventory.wasteCost).toMatchObject({ support: 'partial', value: 120.5 })
    expect(p.inventory.countShortageBranches).toEqual([B2.name])
    expect(p.inventory.timingUncertainBranches).toEqual([B2.name])
    expect(p.recurrence.items.some((r) => r.code === 'count_unexplained_shortage' && r.branchKey === B2.key && r.days === 1)).toBe(true)
    const n = renderWeeklyNarrative(p)
    expect(JSON.stringify(n)).toContain('fire zamanı belirsiz; nedeni doğrulanmadı')
    expect(validateNarrative(n, p).ok, JSON.stringify(validateNarrative(n, p))).toBe(true)
  })

  it('a missing weekly snapshot or an unreadable branch is a limitation, the pack still builds', () => {
    const p = weekly(WEEK, clean(), { over: { [B1.id]: { weekly: { envelope: { state: 'missing' }, insights: [] } }, [B2.id]: null } })
    expect(p.limitations.map((l) => `${l.code}:${l.branchKey}`)).toEqual(expect.arrayContaining([`snapshot_missing:${B1.key}`, `source_unavailable:${B2.key}`]))
    expect(p.organization.finalizedRevenue.support).toBe('unsupported')
    expect(p.completeness.overall).toBe('no_data')
    expect(validateNarrative(renderWeeklyNarrative(p), p).ok).toBe(true)
  })
})
