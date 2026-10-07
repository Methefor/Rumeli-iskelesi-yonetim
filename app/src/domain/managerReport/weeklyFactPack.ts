import { isMonday, type MetricValue } from '../analytics'
import type { BranchSignals } from '../commandCenter'
import { istanbulDate, addDaysIso } from '../../utils/dates'
import type { DayProjection, ManagerReportInputs } from './inputs'
import { buildProcurementFacts } from './procurementFacts'
import { BLOCKING_LIMITATIONS, EvidenceBook, LimitationBook, limitationFromReason, mondayToSunday, reproducibilityOf, round1, round2, unsupportedFact } from './support'
import type {
  BranchRef,
  DayExtreme,
  Fact,
  LimitationCode,
  RecurrenceItem,
  ReportAccess,
  RelationshipFact,
  SnapshotRef,
  Support,
  WeatherDayContext,
  WeeklyBranchFacts,
  WeeklyDay,
  WeeklyFactPack,
} from './types'
import { FACT_PACK_GENERATOR, FACT_PACK_SCHEMA_VERSION } from './types'

export interface WeeklyPackInput {
  /** Monday (Europe/Istanbul business date) */
  weekStart: string
  now: Date
  branches: BranchRef[]
  report: ManagerReportInputs
  /** existing Command Center signals; only used when the week contains today (current-state procurement) */
  signals: Record<string, BranchSignals | null> | null
}

const NO_ACCESS: ReportAccess = { financial: false, reports: false, stock: false, weather: false }

type CompareLike = { state: string; pct?: number; delta?: number; baseline?: number; mixedOrigin?: boolean }

export function buildWeeklyFactPack(input: WeeklyPackInput): WeeklyFactPack {
  const { weekStart, now, branches, report, signals } = input
  if (!isMonday(weekStart)) throw new Error('weekStart must be a Monday (analytics weeks are Monday..Sunday, Europe/Istanbul business dates)')
  const weekEnd = addDaysIso(weekStart, 6)
  const dates = mondayToSunday(weekStart)
  const today = istanbulDate(now)
  const weekComplete = weekEnd < today
  const containsToday = weekStart <= today && today <= weekEnd
  /** completed business days of the week: the only days whose operational outcome is final */
  const doneDates = dates.filter((d) => d < today)
  const book = new EvidenceBook('weekly')
  const limits = new LimitationBook()
  const snapshots: SnapshotRef[] = []
  if (!weekComplete) limits.add('incomplete_week')

  const branchFacts: WeeklyBranchFacts[] = []
  const recurrence: RecurrenceItem[] = []
  const historical: WeeklyFactPack['weather']['historical'] = []
  const relationships: RelationshipFact[] = []
  const missingZByBranch: Array<{ b: BranchRef; dates: string[] }> = []
  let reconWarnDays = 0
  let reconErrDays = 0
  let zBelowXDays = 0
  let observableComplete = true
  let wasteEntries = 0
  let wasteCostKnown = 0
  let wasteCostSupport: Support = 'complete'
  let wasteBranches = 0
  let wasteCostBranches = 0
  const countShortage: string[] = []
  const countTiming: string[] = []

  for (const b of branches) {
    const inputs = report[b.id] ?? null
    const k = `branch.${b.key}`
    if (!inputs) {
      limits.add('source_unavailable', b)
      observableComplete = false
      continue
    }
    const env = inputs.weekly?.envelope
    const payload = env?.payload
    const access = inputs.access ?? NO_ACCESS
    // the caller's access per domain: withheld domains are said so (no_permission), never shown as an all-clear
    const days: DayProjection[] = access.reports ? (inputs.days ?? []) : []
    if (!access.reports || !access.financial || !access.weather) limits.add('no_permission', b)
    if (!access.reports) observableComplete = false

    // ---- the week's analytics snapshot (immutable, versioned): nothing is recomputed ------------------------------------------
    if (!access.financial) {
      observableComplete = false
    } else if (!env || env.state === 'missing' || !payload || !env.snapshotId) {
      limits.add('snapshot_missing', b)
      observableComplete = false
    } else if (payload.redacted || !payload.financial) {
      limits.add('source_unavailable', b)
      observableComplete = false
    } else if (env.state === 'stale') {
      limits.add('snapshot_stale', b)
      observableComplete = false
    } else {
      snapshots.push({ kind: 'weekly_analytics', branchKey: b.key, snapshotId: env.snapshotId, version: env.version ?? 0, generatedAt: env.generatedAt ?? null, state: 'current' })
      const final = payload.weekComplete && payload.provisionalDays === 0
      const reasonsOf = (): string[] => [...(payload.weekComplete ? [] : ['week_in_progress']), ...(payload.provisionalDays > 0 ? ['missing_z'] : [])]
      const metric = (m: MetricValue, ref: string, unit: 'TRY' | 'count', label: string): Fact => {
        if ((m.state === 'available' || m.state === 'partial') && m.value !== undefined) {
          return book.fact(ref, m.value, unit, label, m.state === 'available' && final ? 'complete' : 'partial', [...reasonsOf(), ...(m.reason ? [m.reason] : [])])
        }
        return unsupportedFact(m.reason ?? m.state)
      }
      const finalizedRevenue = metric(payload.financial.grossRevenue, `${k}.revenue.final`, 'TRY', `${b.name} haftalık kesinleşmiş ciro (Z)`)
      const provisionalRevenue =
        payload.financial.provisionalRevenue !== null
          ? book.fact(`${k}.revenue.provisional`, payload.financial.provisionalRevenue, 'TRY', `${b.name} haftalık geçici ciro (yalnızca X)`, 'partial', ['missing_z'])
          : unsupportedFact('no_x_only_reading')
      const transactions = metric(payload.volume.transactions, `${k}.transactions`, 'count', `${b.name} haftalık işlem sayısı`)
      const averageBasket = metric(payload.financial.averageBasket, `${k}.averageBasket`, 'TRY', `${b.name} haftalık ortalama sepet`)
      const gpm = payload.financial.grossProfit.metric
      const grossProfit = metric(gpm, `${k}.grossProfit`, 'TRY', `${b.name} haftalık brüt kâr (maliyet düşülmüş brüt, net kâr değil)`)
      for (const r of payload.completeness.reasons) {
        const code = limitationFromReason(r)
        if (code && !['incomplete_week', 'missing_z'].includes(code)) limits.add(code, b)
      }
      if (payload.provisionalDays > 0) limits.add('missing_z', b)
      if (grossProfit.reasons.includes('missing_cost') || gpm.reason === 'missing_cost') limits.add('missing_cost', b)
      if (payload.origin === 'mixed') limits.add('mixed_origin', b)
      if (transactions.support === 'unsupported' && payload.completeness.reasons.includes('missing_transaction_count')) limits.add('missing_transaction_count', b)

      const weekDays: WeeklyDay[] = payload.days.map((d) => ({
        date: d.date,
        finalization: d.finalization,
        finalizedRevenue:
          d.finalization === 'finalized' && d.grossRevenue !== null
            ? book.fact(`${k}.day.${d.date}.revenue`, d.grossRevenue, 'TRY', `${b.name} ${d.date} kesinleşmiş ciro (Z)`, 'complete')
            : unsupportedFact(d.finalization === 'provisional' ? 'missing_z' : 'no_reports'),
      }))
      const fin = weekDays.filter((d) => d.finalizedRevenue.value !== null)
      // strongest / weakest day only for a COMPLETED week: among the days of an unfinished week the "strongest" is just the best so far
      const extreme = (pick: 'max' | 'min'): DayExtreme | null => {
        if (!payload.weekComplete || fin.length < 2) return null
        let best = fin[0]!
        for (const d of fin) {
          const v = d.finalizedRevenue.value as number
          const bv = best.finalizedRevenue.value as number
          if (pick === 'max' ? v > bv : v < bv) best = d
        }
        return { date: best.date, revenue: best.finalizedRevenue.value as number, ref: best.finalizedRevenue.ref as string }
      }

      const cmp = (c: CompareLike, ref: string, label: string) => ({
        state: c.state,
        pct: c.state === 'ok' && c.pct !== undefined ? c.pct : null,
        delta: c.state === 'ok' && c.delta !== undefined ? c.delta : null,
        baseline: c.state === 'ok' && c.baseline !== undefined ? c.baseline : null,
        ref: c.state === 'ok' && c.pct !== undefined ? book.add(ref, c.pct, 'pct', label) : null,
      })
      const rev = payload.financialComparisons.grossRevenue
      const vs = cmp(rev, `${k}.revenue.vsPreviousWeek.pct`, `${b.name} önceki haftaya göre ciro değişimi`)
      if (rev.state === 'mixed_origin' || rev.mixedOrigin) limits.add('mixed_origin', b)
      if (rev.state === 'no_baseline' || rev.state === 'baseline_not_final' || rev.state === 'insufficient_samples') limits.add('no_comparison_baseline', b)
      const tx = cmp(payload.volumeComparisons.transactions, `${k}.transactions.vsPreviousWeek.pct`, `${b.name} önceki haftaya göre işlem sayısı değişimi`)
      const bk = cmp(payload.financialComparisons.averageBasket, `${k}.averageBasket.vsPreviousWeek.pct`, `${b.name} önceki haftaya göre ortalama sepet değişimi`)

      branchFacts.push({
        branchKey: b.key,
        branchName: b.name,
        weekComplete: payload.weekComplete,
        finalization: payload.finalization,
        origin: payload.origin,
        finalizedRevenue,
        provisionalRevenue,
        transactions,
        averageBasket,
        grossProfit,
        finalizedDays: payload.finalizedDays,
        provisionalDays: payload.provisionalDays,
        daysWithData: payload.daysWithData,
        days: weekDays,
        vsPreviousWeek: { state: vs.state as never, pct: vs.pct, delta: vs.delta, baseline: vs.baseline, mixedOrigin: Boolean(rev.mixedOrigin), ref: vs.ref },
        transactionsVsPreviousWeek: { state: tx.state as never, pct: tx.pct, ref: tx.ref },
        basketVsPreviousWeek: { state: bk.state as never, pct: bk.pct, ref: bk.ref },
        strongestDay: extreme('max'),
        weakestDay: extreme('min'),
      })

      // missing Z: only COMPLETED days (today's X-only reading is a day in progress, not a missing Z)
      const mz = payload.days.filter((d) => d.finalization === 'provisional' && d.date < today).map((d) => d.date)
      if (mz.length > 0) missingZByBranch.push({ b, dates: mz })
    }

    // ---- per-day recurrence from stored daily snapshots (completed days only) -------------------------------------------------
    const observed = days.filter((d) => d.state === 'present' && d.date < today && dates.includes(d.date))
    if (observed.length < doneDates.length) {
      observableComplete = false
      if (access.reports && doneDates.length > 0) limits.add('no_daily_history', b)
    }
    const warnDates = observed.filter((d) => (d.reconciliation?.WARNING ?? 0) > 0).map((d) => d.date)
    const errDates = observed.filter((d) => (d.reconciliation?.ERROR ?? 0) > 0).map((d) => d.date)
    const zxDates = observed.filter((d) => d.zBelowX).map((d) => d.date)
    reconWarnDays += warnDates.length
    reconErrDays += errDates.length
    zBelowXDays += zxDates.length
    const addRec = (code: RecurrenceItem['code'], list: string[], observable: number) => {
      if (list.length === 0) return
      const ref = book.add(`recurrence.${code}.${b.key}`, list.length, 'count', `${b.name}: ${code} (haftada tekrar eden gün sayısı)`)
      recurrence.push({ code, branchKey: b.key, branchName: b.name, days: list.length, dates: [...list].sort(), observableDays: observable, ref })
    }
    addRec('reconciliation_error', errDates, observed.length)
    addRec('reconciliation_warning', warnDates, observed.length)
    addRec('z_below_x', zxDates, observed.length)

    // ---- weather: historical (reanalysis) context of completed days only; never a forecast ---------------------------------------
    let missingCtx = false
    for (const d of access.weather ? observed : []) {
      const c = d.context
      if (!c || c.state !== 'present') {
        missingCtx = true
        continue
      }
      const ref = typeof c.temperatureC === 'number' ? book.add(`weather.daily.${b.key}.${d.date}`, c.temperatureC, 'celsius', `${b.name} ${d.date} günlük ortalama sıcaklık (${c.provenance === 'reanalysis' ? 'modellenmiş geçmiş veri' : 'geçmiş bağlam'})`) : null
      const ctx: WeatherDayContext = { date: d.date, state: 'present', provenance: c.provenance ?? null, temperatureC: typeof c.temperatureC === 'number' ? round1(c.temperatureC) : null, temperatureMinC: c.temperatureMinC ?? null, temperatureMaxC: c.temperatureMaxC ?? null, precipitationMm: c.precipitationMm ?? null, ref }
      historical.push({ ...ctx, branchKey: b.key, branchName: b.name })
    }
    if (missingCtx) limits.add('missing_context', b)
    const we = access.weather && access.financial && payload && !payload.redacted ? payload.weatherEffect : null
    if (we) {
      const base = `weather.relationship.${b.key}`
      const rel: RelationshipFact = {
        state: we.state,
        sample: we.sample,
        required: we.required ?? null,
        ref: null,
        rainDifferencePct: null,
        rainyDays: null,
        dryDays: null,
        temperatureCorrelation: null,
        branchKey: b.key,
        branchName: b.name,
        refs: { sample: null, required: null, rainyDays: null, dryDays: null, rainDifferencePct: null, temperatureCorrelation: null },
      }
      rel.refs.sample = book.add(`${base}.sample`, we.sample, 'count', `${b.name} hava ilişkisi örnek sayısı (gün)`, { kind: 'relationship' })
      if (we.required !== undefined) rel.refs.required = book.add(`${base}.required`, we.required, 'count', `${b.name} hava ilişkisi için gereken en az örnek (gün)`, { kind: 'relationship' })
      if (we.state === 'ok') {
        rel.ref = rel.refs.sample
        if (we.temperatureCorrelation) {
          rel.temperatureCorrelation = round2(we.temperatureCorrelation.r)
          rel.refs.temperatureCorrelation = book.add(`${base}.temperature.r`, we.temperatureCorrelation.r, 'ratio', `${b.name} sıcaklık ile ciro ilişkisi (korelasyon, neden-sonuç değil)`, { kind: 'relationship' })
        }
        if (we.rainEffect && 'rainyIndex' in we.rainEffect && we.rainEffect.differencePct !== undefined) {
          rel.rainyDays = we.rainEffect.rainyDays
          rel.dryDays = we.rainEffect.dryDays
          rel.refs.rainyDays = book.add(`${base}.rain.rainyDays`, we.rainEffect.rainyDays, 'count', `${b.name} yağışlı gün sayısı`, { kind: 'relationship' })
          rel.refs.dryDays = book.add(`${base}.rain.dryDays`, we.rainEffect.dryDays, 'count', `${b.name} kuru gün sayısı`, { kind: 'relationship' })
          rel.rainDifferencePct = round1(we.rainEffect.differencePct)
          rel.refs.rainDifferencePct = book.add(`${base}.rain.differencePct`, we.rainEffect.differencePct, 'pct', `${b.name} yağışlı ve kuru günlerin ciro farkı (ilişki, neden-sonuç değil)`, { kind: 'relationship' })
        }
      } else if (we.state === 'insufficient_sample') limits.add('insufficient_sample', b)
      else limits.add('missing_context', b)
      relationships.push(rel)
    }

    // ---- inventory control: waste of the week + closing counts of the week ------------------------------------------------------
    if (inputs.waste.state === 'available') {
      wasteBranches += 1
      wasteEntries += inputs.waste.data.entries
      const c = inputs.waste.data.cost
      if (c.state === 'unavailable' && inputs.waste.data.entries > 0) wasteCostSupport = 'unsupported'
      else if (c.state === 'partial' && wasteCostSupport === 'complete') wasteCostSupport = 'partial'
      if (c.state !== 'unavailable') {
        wasteCostKnown += c.value ?? 0
        wasteCostBranches += 1
      }
      if (inputs.waste.data.entries > 0 && c.state !== 'available') limits.add('missing_cost', b)
    }
    if (inputs.counts.state === 'available') {
      const inWeek = inputs.counts.data.recent.filter((c) => c.status === 'submitted' && dates.includes(c.businessDate))
      const shortDates = inWeek.filter((c) => (c.summary?.unexplainedLines ?? 0) > 0).map((c) => c.businessDate)
      const timingDates = inWeek.filter((c) => (c.summary?.timingUncertainLines ?? 0) > 0).map((c) => c.businessDate)
      if (shortDates.length > 0) countShortage.push(b.name)
      if (timingDates.length > 0) countTiming.push(b.name)
      addRec('count_unexplained_shortage', shortDates, inWeek.length)
      addRec('count_timing_uncertain', timingDates, inWeek.length)
    }
  }

  for (const { b, dates: mz } of missingZByBranch) {
    const ref = book.add(`recurrence.missing_z.${b.key}`, mz.length, 'count', `${b.name}: Z raporu eksik gün sayısı`)
    recurrence.push({ code: 'missing_z', branchKey: b.key, branchName: b.name, days: mz.length, dates: mz, observableDays: doneDates.length, ref })
  }
  recurrence.sort((a, c) => c.days - a.days || a.branchName.localeCompare(c.branchName, 'tr') || a.code.localeCompare(c.code))

  // ---- organization aggregation of the branch facts (sums only) ------------------------------------------------------------------
  const total = branches.length
  const sumFact = (ref: string, unit: 'TRY' | 'count', label: string, pick: (b: WeeklyBranchFacts) => Fact): Fact => {
    const facts = branchFacts.map(pick)
    const known = facts.filter((f) => f.value !== null)
    if (known.length === 0) return unsupportedFact(...facts.flatMap((f) => f.reasons))
    const complete = known.length === total && known.every((f) => f.support === 'complete')
    return book.fact(ref, round2(known.reduce((s, f) => s + (f.value as number), 0)), unit, label, complete ? 'complete' : 'partial', [...facts.flatMap((f) => f.reasons), ...(known.length < total ? ['not_all_branches'] : [])])
  }
  const finalizedRevenue = sumFact('org.revenue.final', 'TRY', 'Haftalık kesinleşmiş ciro (Z)', (b) => b.finalizedRevenue)
  const provisionalKnown = branchFacts.filter((b) => b.provisionalRevenue.value !== null)
  const provisionalRevenue: Fact = provisionalKnown.length === 0 ? unsupportedFact('no_x_only_reading') : sumFact('org.revenue.provisional', 'TRY', 'Haftalık geçici ciro (yalnızca X)', (b) => b.provisionalRevenue)
  const transactions = sumFact('org.transactions', 'count', 'Haftalık işlem sayısı', (b) => b.transactions)
  const grossProfit = sumFact('org.grossProfit', 'TRY', 'Haftalık brüt kâr (maliyet düşülmüş brüt, net kâr değil)', (b) => b.grossProfit)
  const averageBasket: Fact = total === 1 && branchFacts[0] ? branchFacts[0].averageBasket : unsupportedFact('organization_aggregate_not_defined')

  const orgVs = ((): WeeklyFactPack['organization']['vsPreviousWeek'] => {
    const none = (reasons: string[]) => ({ support: 'unsupported' as const, reasons: [...new Set(reasons)], pct: null, delta: null, baseline: null, refs: { pct: null, delta: null, baseline: null } })
    if (branchFacts.length === 0 || branchFacts.length < total) return none(['source_unavailable'])
    const bad = branchFacts.filter((b) => b.vsPreviousWeek.state !== 'ok')
    if (bad.length > 0) return none(bad.map((b) => b.vsPreviousWeek.state))
    const baseline = round2(branchFacts.reduce((s, b) => s + (b.vsPreviousWeek.baseline ?? 0), 0))
    const delta = round2(branchFacts.reduce((s, b) => s + (b.vsPreviousWeek.delta ?? 0), 0))
    if (baseline <= 0) return none(['zero_base'])
    const pct = round1((delta / baseline) * 100)
    return {
      support: 'complete' as const,
      reasons: branchFacts.some((b) => b.vsPreviousWeek.mixedOrigin) ? ['mixed_origin'] : [],
      pct,
      delta,
      baseline,
      refs: {
        pct: book.add('org.revenue.vsPreviousWeek.pct', pct, 'pct', 'Önceki haftaya göre ciro değişimi'),
        delta: book.add('org.revenue.vsPreviousWeek.delta', delta, 'TRY', 'Önceki haftaya göre ciro farkı'),
        baseline: book.add('org.revenue.vsPreviousWeek.baseline', baseline, 'TRY', 'Önceki hafta kesinleşmiş ciro'),
      },
    }
  })()
  if (orgVs.support === 'unsupported' && branchFacts.length > 0) limits.add('no_comparison_baseline')

  // finalized org-level daily series: only for dates where EVERY branch has a finalized day
  const dailySeries: WeeklyFactPack['organization']['dailySeries'] = []
  if (branchFacts.length === total && total > 0) {
    for (const d of dates) {
      const rows = branchFacts.map((b) => b.days.find((x) => x.date === d))
      if (rows.every((r) => r && r.finalizedRevenue.value !== null)) {
        const revenue = round2(rows.reduce((s, r) => s + (r!.finalizedRevenue.value as number), 0))
        dailySeries.push({ date: d, revenue, ref: book.add(`org.day.${d}.revenue`, revenue, 'TRY', `${d} tüm şubeler kesinleşmiş ciro (Z)`) })
      }
    }
  }
  const orgExtreme = (pick: 'max' | 'min'): DayExtreme | null => {
    if (!weekComplete || dailySeries.length < 2) return null
    let best = dailySeries[0]!
    for (const d of dailySeries) if (pick === 'max' ? d.revenue > best.revenue : d.revenue < best.revenue) best = d
    return { date: best.date, revenue: best.revenue, ref: best.ref }
  }

  const finalizedDays = branchFacts.reduce((s, b) => s + b.finalizedDays, 0)
  const provisionalDays = branchFacts.reduce((s, b) => s + b.provisionalDays, 0)
  book.add('org.reporting.finalizedDays', finalizedDays, 'count', 'Z raporu tamamlanan şube-günü')
  if (provisionalDays > 0) book.add('org.reporting.provisionalDays', provisionalDays, 'count', 'Yalnızca X raporu olan şube-günü')

  const obs = (ref: string, label: string, n: number): Fact => book.fact(ref, n, 'count', label, observableComplete ? 'complete' : 'partial', observableComplete ? [] : ['days_without_snapshot'])
  const missingZTotal = missingZByBranch.reduce((s, m) => s + m.dates.length, 0)

  const wasteFacts = ((): { entries: Fact; cost: Fact } => {
    if (wasteBranches === 0) return { entries: unsupportedFact('source_unavailable'), cost: unsupportedFact('source_unavailable') }
    const sup: Support = wasteBranches === total ? 'complete' : 'partial'
    return {
      entries: book.fact('inventory.waste.entries', wasteEntries, 'count', 'Haftalık fire kaydı', sup, sup === 'partial' ? ['not_all_branches'] : []),
      cost: wasteCostSupport === 'unsupported' || wasteCostBranches === 0 ? unsupportedFact('missing_cost') : book.fact('inventory.waste.cost', round2(wasteCostKnown), 'TRY', 'Haftalık fire maliyeti', wasteCostSupport === 'complete' && sup === 'complete' ? 'complete' : 'partial', wasteCostSupport === 'complete' ? [] : ['missing_cost']),
    }
  })()

  const procurement = buildProcurementFacts(book, limits, branches, signals, containsToday, weekComplete ? 'no_daily_history' : 'not_current_week')
  if (!containsToday) limits.add('no_daily_history')

  const reproducibility = reproducibilityOf(book.entries, !weekComplete || containsToday)
  if (reproducibility.state === 'live') limits.add('live_state')
  else if (reproducibility.state === 'partial') limits.add('mutable_sources')
  const reasons = [...new Set(limits.list().map((l) => l.code))] as LimitationCode[]
  const anyData = branchFacts.some((b) => b.daysWithData > 0)
  const overall: WeeklyFactPack['completeness']['overall'] = !anyData ? 'no_data' : weekComplete && branchFacts.length === total && !reasons.some((r) => BLOCKING_LIMITATIONS.includes(r)) ? 'complete' : 'partial'

  return {
    schemaVersion: FACT_PACK_SCHEMA_VERSION,
    reportType: 'weekly',
    weekStart,
    weekEnd,
    generatedAt: now.toISOString(),
    scope: { kind: branches.length === 1 ? 'branch' : 'organization', branches },
    weekComplete,
    reproducibility,
    completeness: { overall, reasons },
    organization: {
      finalizedRevenue,
      provisionalRevenue,
      transactions,
      averageBasket,
      grossProfit,
      vsPreviousWeek: orgVs,
      dailySeries,
      strongestDay: orgExtreme('max'),
      weakestDay: orgExtreme('min'),
      reportingCompleteness: { finalizedDays, provisionalDays, branches: total, ref: 'org.reporting.finalizedDays' },
    },
    branches: branchFacts,
    operations: {
      missingZDays: book.fact('ops.missingZDays', missingZTotal, 'count', 'Z raporu eksik şube-günü', 'complete'),
      reconciliationWarningDays: obs('ops.reconciliationWarningDays', 'Mutabakat uyarısı olan şube-günü', reconWarnDays),
      reconciliationErrorDays: obs('ops.reconciliationErrorDays', 'Mutabakat hatası olan şube-günü', reconErrDays),
      zBelowXDays: obs('ops.zBelowXDays', 'Z değerinin X değerinden küçük olduğu şube-günü', zBelowXDays),
    },
    recurrence: {
      items: recurrence,
      unsupported: [
        { code: 'low_stock', reason: 'no_daily_history' },
        { code: 'overdue_order', reason: 'no_daily_history' },
      ],
    },
    inventory: { wasteEntries: wasteFacts.entries, wasteCost: wasteFacts.cost, countShortageBranches: countShortage, timingUncertainBranches: countTiming },
    procurement,
    weather: { historical, relationships },
    limitations: limits.list(),
    evidence: book.entries,
    provenance: {
      generator: FACT_PACK_GENERATOR,
      factSchemaVersion: FACT_PACK_SCHEMA_VERSION,
      readModels: ['get_manager_report_inputs', ...(containsToday ? ['get_command_center_signals'] : [])],
      snapshots,
    },
  }
}
