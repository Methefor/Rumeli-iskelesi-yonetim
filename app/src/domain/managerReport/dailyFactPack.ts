import type { BranchComparisonRow, OrganizationSummary } from '../dashboard'
import { fromKurus, metricValue, unavailable } from '../dashboard'
import type { BranchSignals } from '../commandCenter'
import { buildAttentionFeed } from '../commandCenter'
import type { CostMetric } from '../inventory/control'
import { rainExpected } from '../weather'
import { istanbulDate } from '../../utils/dates'
import type { ManagerReportInputs } from './inputs'
import { buildProcurementFacts } from './procurementFacts'
import { BLOCKING_LIMITATIONS, EvidenceBook, LimitationBook, limitationFromReason, reproducibilityOf, round1, round2, unsupportedFact } from './support'
import type {
  AttentionSection,
  BranchRef,
  DailyBranchFacts,
  DailyFactPack,
  Fact,
  LimitationCode,
  ReportAccess,
  SnapshotRef,
  Support,
} from './types'
import { FACT_PACK_GENERATOR, FACT_PACK_SCHEMA_VERSION } from './types'

const NO_ACCESS: ReportAccess = { financial: false, reports: false, stock: false, weather: false }

export interface DailyPackInput {
  businessDate: string
  now: Date
  branches: BranchRef[]
  /** rows of the EXISTING dashboard model for businessDate..businessDate (the canonical X/Z engine) */
  rows: readonly BranchComparisonRow[]
  /** kept for callers; the pack aggregates the (permission-gated) branch facts itself so a withheld branch can never leak through a total */
  organization?: OrganizationSummary
  /** existing Command Center signals: only used when businessDate is the branch's today */
  signals: Record<string, BranchSignals | null> | null
  /** the manager-report batch read model (analytics snapshot of the date, waste of the date, recent counts) */
  report: ManagerReportInputs
}

const costFact = (book: EvidenceBook, ref: string, label: string, c: CostMetric): Fact => {
  if (c.state === 'available') return book.fact(ref, c.value ?? 0, 'TRY', label, 'complete')
  if (c.state === 'partial') return book.fact(ref, c.value ?? null, 'TRY', label, 'partial', ['missing_cost'])
  return unsupportedFact(c.reason ?? 'missing_cost')
}

const sumFacts = (book: EvidenceBook, ref: string, unit: 'TRY' | 'count', label: string, facts: readonly Fact[], total: number): Fact => {
  const known = facts.filter((f) => f.value !== null)
  if (known.length === 0) return unsupportedFact(...facts.flatMap((f) => f.reasons))
  const sum = round2(known.reduce((s, f) => s + (f.value as number), 0))
  const support: Support = known.length === total && known.every((f) => f.support === 'complete') ? 'complete' : 'partial'
  return book.fact(ref, sum, unit, label, support, [...facts.flatMap((f) => f.reasons), ...(known.length < total ? ['not_all_branches'] : [])])
}

export function buildDailyFactPack(input: DailyPackInput): DailyFactPack {
  const { businessDate, now, branches, rows, signals, report } = input
  const book = new EvidenceBook('daily')
  const limits = new LimitationBook()
  const snapshots: SnapshotRef[] = []
  const today = istanbulDate(now)
  if (businessDate > today) throw new Error('a daily report can not be built for a future business date')
  const isCurrentDate = businessDate === today
  if (!isCurrentDate) limits.add('not_current_date')
  const accessOf = (id: string): ReportAccess => report[id]?.access ?? NO_ACCESS

  const branchFacts: DailyBranchFacts[] = []
  const unreadable: BranchRef[] = []

  for (const b of branches) {
    const row = rows.find((r) => r.branchId === b.id)
    const inputs = report[b.id] ?? null
    const access = accessOf(b.id)
    const k = `branch.${b.key}`
    if (!row || !inputs || !access.reports) {
      // unreadable (failed call) or the caller has no report permission for this branch: nothing of it is shown, and it is said so
      unreadable.push(b)
      limits.add(inputs && !access.reports ? 'no_permission' : 'source_unavailable', b)
      continue
    }
    const fin = access.financial
    if (!fin) limits.add('no_permission', b)

    // ---- revenue: the existing X/Z business-day engine (Z => finalized exactly Z; X-only => provisional; never X+Z) ----------
    const rb = row.revenueBreakdown
    const finalization: DailyBranchFacts['finalization'] = rb.finalizedDays > 0 ? 'finalized' : rb.provisionalDays > 0 ? 'provisional' : 'no_data'
    const finalizedRevenue = !fin
      ? unsupportedFact('no_permission')
      : finalization === 'finalized'
        ? book.fact(`${k}.revenue.final`, fromKurus(rb.finalizedKurus), 'TRY', `${b.name} kesinleşmiş ciro (Z)`, 'complete')
        : unsupportedFact(finalization === 'provisional' ? 'missing_z' : 'no_reports')
    const provisionalRevenue = !fin
      ? unsupportedFact('no_permission')
      : finalization === 'provisional'
        ? book.fact(`${k}.revenue.provisional`, fromKurus(rb.provisionalKurus), 'TRY', `${b.name} geçici ciro (yalnızca X)`, 'partial', ['missing_z'])
        : unsupportedFact('no_x_only_reading')
    if (finalization === 'provisional') limits.add('missing_z', b)
    if (finalization === 'no_data') limits.add('no_finalized_data', b)

    const anomalies: DailyBranchFacts['anomalies'] = []
    if (rb.zBelowXDays.length > 0) anomalies.push({ code: 'z_below_x', ref: book.add(`${k}.anomaly.z_below_x`, rb.zBelowXDays.length, 'count', `${b.name}: Z, X'ten küçük gün sayısı`) })
    if (rb.multipleReadingDays.length > 0) anomalies.push({ code: 'multiple_readings', ref: book.add(`${k}.anomaly.multiple_readings`, rb.multipleReadingDays.length, 'count', `${b.name}: birden fazla aktif okuması olan gün`) })

    // ---- analytics snapshot of the date (transactions, basket, origin, comparison): never recomputed here -------------------
    let transactions: Fact = unsupportedFact('snapshot_missing')
    let averageBasket: Fact = unsupportedFact('snapshot_missing')
    let origin: DailyBranchFacts['origin'] = 'unknown'
    let vs: DailyBranchFacts['vsSameWeekdayLastWeek'] = null
    const env = inputs?.daily?.envelope
    const payload = env?.payload
    if (!fin) {
      transactions = averageBasket = unsupportedFact('no_permission')
    } else if (!env || env.state === 'missing' || !payload || !env.snapshotId) {
      limits.add('snapshot_missing', b)
    } else if (payload.redacted) {
      transactions = averageBasket = unsupportedFact('no_permission')
      limits.add('source_unavailable', b)
    } else {
      const consistent =
        payload.finalization === finalization &&
        (finalization !== 'finalized' || (payload.financial.grossRevenue.value !== undefined && Math.abs(payload.financial.grossRevenue.value - fromKurus(rb.finalizedKurus)) < 0.005))
      if (env.state === 'stale' || !consistent) {
        // the snapshot lags the live data: its derived measures would contradict the revenue above
        transactions = averageBasket = unsupportedFact('snapshot_stale')
        limits.add('snapshot_stale', b)
      } else {
        snapshots.push({ kind: 'daily_analytics', branchKey: b.key, snapshotId: env.snapshotId, version: env.version ?? 0, generatedAt: env.generatedAt ?? null, state: 'current' })
        origin = payload.origin
        const mv = (m: { state: string; value?: number; reason?: string }, ref: string, unit: 'count' | 'TRY', label: string): Fact => {
          if (finalization !== 'finalized') return unsupportedFact('missing_z')
          if (m.state === 'available') return book.fact(ref, m.value ?? null, unit, label, 'complete')
          if (m.state === 'partial') return book.fact(ref, m.value ?? null, unit, label, 'partial', m.reason ? [m.reason] : [])
          return unsupportedFact(m.reason ?? 'unsupported')
        }
        transactions = mv(payload.volume.transactions, `${k}.transactions`, 'count', `${b.name} işlem sayısı`)
        averageBasket = mv(payload.financial.averageBasket, `${k}.averageBasket`, 'TRY', `${b.name} ortalama sepet`)
        for (const r of payload.completeness.reasons) {
          const code = limitationFromReason(r)
          if (code && ['missing_transaction_count', 'legacy_source_limitation', 'missing_product_detail', 'line_semantics_unverified'].includes(code)) limits.add(code, b)
        }
        if (origin === 'mixed') limits.add('mixed_origin', b)
        const c = payload.financialComparisons.grossRevenue.previousWeekSameWeekday
        vs = {
          state: c.state,
          pct: c.state === 'ok' ? (c.pct ?? null) : null,
          delta: c.state === 'ok' ? (c.delta ?? null) : null,
          baseline: c.state === 'ok' ? (c.baseline ?? null) : null,
          ref: c.state === 'ok' && c.pct !== undefined ? book.add(`${k}.revenue.vsLastWeek.pct`, c.pct, 'pct', `${b.name} geçen haftanın aynı gününe göre ciro değişimi`) : null,
        }
        if (c.state === 'mixed_origin') limits.add('mixed_origin', b)
      }
    }
    if (transactions.support === 'unsupported' && transactions.reasons.includes('missing_transaction_count')) limits.add('missing_transaction_count', b)

    // ---- gross profit: the existing summarizeGrossProfit-based card (never net profit) ----------------------------------------
    const gp = row.grossProfit
    let grossProfit: Fact
    if (!fin) {
      grossProfit = unsupportedFact('no_permission')
    } else if (gp.status === 'available' || gp.status === 'partial') {
      const complete = gp.status === 'available' && finalization === 'finalized'
      grossProfit = book.fact(`${k}.grossProfit`, fromKurus(gp.value.amountKurus), 'TRY', `${b.name} brüt kâr (maliyet düşülmüş brüt, net kâr değil)`, complete ? 'complete' : 'partial', [
        ...(gp.status === 'partial' ? ['missing_cost'] : []),
        ...(finalization !== 'finalized' ? ['missing_z'] : []),
      ])
      if (gp.status === 'partial') limits.add('missing_cost', b)
    } else if (gp.status === 'unavailable') {
      grossProfit = unsupportedFact('missing_cost')
      limits.add('missing_cost', b)
    } else {
      grossProfit = unsupportedFact('inventory_not_tracked')
    }

    // ---- inventory control: closing count of the date + waste of the date --------------------------------------------------
    let closingCount: DailyBranchFacts['closingCount'] = row.inventoryTracked ? 'unknown' : 'not_tracked'
    let countOutcome: DailyBranchFacts['countOutcome'] = null
    if (inputs && inputs.counts.state === 'available' && row.inventoryTracked) {
      const o = inputs.counts.data
      const forDate = o.recent.filter((c) => c.businessDate === businessDate)
      const submitted = forDate.find((c) => c.status === 'submitted')
      if (submitted) {
        closingCount = 'submitted'
        const s = submitted.summary
        if (s) {
          countOutcome = {
            unexplainedLines: book.fact(`${k}.count.unexplained`, s.unexplainedLines, 'count', `${b.name} açıklanamayan sayım eksiği (kalem)`, 'complete'),
            timingUncertainLines: book.fact(`${k}.count.timingUncertain`, s.timingUncertainLines, 'count', `${b.name} fire zamanı belirsiz sayım eksiği (kalem)`, 'complete'),
          }
        }
      } else if (forDate.some((c) => c.status === 'voided')) closingCount = 'voided_only'
      else if (o.recent.length > 0 && businessDate >= (o.recent.map((c) => c.businessDate).sort()[0] ?? '9999')) closingCount = 'missing'
    }
    let waste: DailyBranchFacts['waste'] = null
    if (inputs && inputs.waste.state === 'available' && row.inventoryTracked) {
      const w = inputs.waste.data
      waste = {
        entries: book.fact(`${k}.waste.entries`, w.entries, 'count', `${b.name} fire kaydı`, 'complete'),
        cost: costFact(book, `${k}.waste.cost`, `${b.name} fire maliyeti`, w.cost),
      }
      if (w.entries > 0 && w.cost.state !== 'available') limits.add('missing_cost', b)
    }
    const alerts = metricValue(row.inventoryAlertCount)
    if (isCurrentDate && !access.stock) limits.add('no_permission', b)
    const stockAlerts = !isCurrentDate
      ? unsupportedFact('not_current_date')
      : !access.stock
        ? unsupportedFact('no_permission')
        : alerts === null
        ? unsupportedFact('inventory_not_tracked')
        : book.fact(`${k}.stockAlerts`, alerts, 'count', `${b.name} stok uyarısı olan ürün`, 'complete')

    branchFacts.push({
      branchKey: b.key,
      branchName: b.name,
      finalization,
      origin,
      finalizedRevenue,
      provisionalRevenue,
      transactions,
      averageBasket,
      grossProfit,
      vsSameWeekdayLastWeek: vs,
      anomalies,
      reconciliation: { ok: row.reconciliation.OK, warning: row.reconciliation.WARNING, error: row.reconciliation.ERROR },
      reportCount: row.reportCount,
      shifts: { completed: row.shifts.completed, open: row.shifts.scheduled + row.shifts.inProgress },
      closingCount,
      countOutcome,
      waste,
      stockAlerts,
    })
  }

  // ---- organization (aggregation of the branch facts above; no new revenue logic) ----------------------------------------------
  const total = branches.length // the whole scope: a branch withheld or unreadable is a missing part, never silently dropped
  const finalizedBranches = branchFacts.filter((b) => b.finalization === 'finalized').length
  const provisionalBranches = branchFacts.filter((b) => b.finalization === 'provisional').length
  const noDataBranches = total - finalizedBranches - provisionalBranches
  // every organization figure is the sum of the permitted branch facts (never of the dashboard totals, which would include withheld branches)
  const orgFinalizedRevenue: Fact = sumFacts(book, 'org.revenue.final', 'TRY', 'Kesinleşmiş ciro (Z)', branchFacts.map((b) => b.finalizedRevenue), total)
  const provisionalKnown = branchFacts.map((b) => b.provisionalRevenue).filter((f) => f.value !== null)
  const orgProvisional: Fact =
    provisionalKnown.length === 0
      ? unsupportedFact('no_x_only_reading')
      : book.fact('org.revenue.provisional', round2(provisionalKnown.reduce((s, f) => s + (f.value as number), 0)), 'TRY', 'Geçici ciro (yalnızca X, kesinleşmedi)', 'partial', ['missing_z'])
  book.add('org.reporting.finalizedBranches', finalizedBranches, 'count', 'Z raporu tamamlanan şube')
  book.add('org.reporting.total', total, 'count', 'Kapsamdaki şube')
  if (provisionalBranches > 0) book.add('org.reporting.provisionalBranches', provisionalBranches, 'count', 'Yalnızca X raporu olan şube')
  const reporting = { finalizedBranches, provisionalBranches, noDataBranches, total, ref: 'org.reporting.finalizedBranches' }
  const orgTransactions = sumFacts(book, 'org.transactions', 'count', 'İşlem sayısı', branchFacts.map((b) => b.transactions), total)
  const orgGross = ((): Fact => {
    const facts = branchFacts.map((b) => b.grossProfit)
    const tracked = facts.filter((f) => !f.reasons.includes('inventory_not_tracked'))
    if (tracked.length === 0) return unsupportedFact('inventory_not_tracked')
    const known = tracked.filter((f) => f.value !== null)
    if (known.length === 0) return unsupportedFact(...tracked.flatMap((f) => f.reasons))
    const support: Support = known.length === tracked.length && branchFacts.length === total && known.every((f) => f.support === 'complete') ? 'complete' : 'partial'
    return book.fact('org.grossProfit', round2(known.reduce((s, f) => s + (f.value as number), 0)), 'TRY', 'Brüt kâr (maliyet düşülmüş brüt, net kâr değil)', support, support === 'partial' ? ['missing_cost'] : [])
  })()
  // an organization-wide average basket is only taken over from a single-branch scope: the engine defines it per day and branch
  const orgBasket: Fact = total === 1 && branchFacts[0] ? branchFacts[0].averageBasket : unsupportedFact('organization_aggregate_not_defined')

  // ---- operations (counts of the date) -----------------------------------------------------------------------------------------
  const op = (ref: string, label: string, n: number) => book.fact(ref, n, 'count', label, 'complete')
  const reconTotals = branchFacts.reduce((a, b) => ({ ok: a.ok + b.reconciliation.ok, warning: a.warning + b.reconciliation.warning, error: a.error + b.reconciliation.error }), { ok: 0, warning: 0, error: 0 })

  // ---- attention feed: the EXISTING deterministic feed (no severity is recomputed) ---------------------------------------------
  let attention: AttentionSection
  if (!isCurrentDate) {
    attention = { state: 'unavailable', reason: 'not_current_date', counts: null, items: [], unavailableSources: [] }
  } else if (signals === null) {
    attention = { state: 'unavailable', reason: 'source_unavailable', counts: null, items: [], unavailableSources: [] }
    limits.add('source_unavailable')
  } else {
    // only branches whose reports the caller may read; without stock permission the stock-alert count is withheld (never an all-clear)
    const feedRows = rows
      .filter((row) => accessOf(row.branchId).reports)
      .map((row) => (accessOf(row.branchId).stock ? row : { ...row, inventoryAlertCount: unavailable<number>('no_permission') }))
    const feed = buildAttentionFeed(feedRows.map((row) => ({ branchId: row.branchId, branchName: row.branchName, row, signals: signals[row.branchId] ?? null, now })))
    const keyOf = new Map(branches.map((b) => [b.id, b.key]))
    attention = {
      state: 'available',
      counts: feed.counts,
      items: feed.items.map((i) => {
        const ref = `attention.${i.reasonCode}.${keyOf.get(i.branchId) ?? i.branchId}`
        if (i.count !== null) book.add(ref, i.count, 'count', `${i.branchName}: ${i.title}`)
        else book.add(ref, 1, 'count', `${i.branchName}: ${i.title}`)
        return { ref, severity: i.severity, category: i.category, reasonCode: i.reasonCode, branchKey: keyOf.get(i.branchId) ?? i.branchId, branchName: i.branchName, title: i.title, count: i.count, actionRoute: i.actionRoute }
      }),
      unavailableSources: feed.unavailableSources.map((u) => ({ branchName: u.branchName, source: u.source, reason: u.reason })),
    }
    book.add('attention.count.critical', feed.counts.critical, 'count', 'Kritik uyarı sayısı')
    book.add('attention.count.warning', feed.counts.warning, 'count', 'Uyarı sayısı')
    book.add('attention.count.info', feed.counts.info, 'count', 'Bilgi notu sayısı')
    if (feed.unavailableSources.length > 0) limits.add('source_unavailable')
  }

  // ---- procurement (current-state read model: only when the date is today) -----------------------------------------------------
  const procurement = buildProcurementFacts(book, limits, branches, signals, isCurrentDate, 'not_current_date')

  // ---- weather: forecast (forward-looking, today only) vs. historical context of a completed date -----------------------------
  const forecast: DailyFactPack['weather']['forecast'] = []
  if (isCurrentDate && signals) {
    for (const b of branches) {
      const part = signals[b.id]?.weather
      if (!part || part.state !== 'available') continue
      const w = part.data
      if (w.status === 'unavailable') {
        forecast.push({ branchKey: b.key, branchName: b.name, status: 'unavailable', ageMinutes: null, rainExpected: false, ref: null })
        continue
      }
      if (w.status === 'stale') limits.add('stale_weather', b)
      const rain = rainExpected(w, now)
      forecast.push({ branchKey: b.key, branchName: b.name, status: w.status, ageMinutes: w.ageMinutes, rainExpected: rain, ref: book.add(`weather.forecast.${b.key}.rain`, rain, 'text' as const, `${b.name}: önümüzdeki saatlerde yağış tahmini (tahmin, ölçüm değil)`, { support: w.status === 'fresh' ? 'complete' : 'partial' }) })
    }
  }
  const historical: DailyFactPack['weather']['historical'] = []
  if (!isCurrentDate) {
    for (const b of branches) {
      if (!accessOf(b.id).weather) {
        if (report[b.id]) limits.add('no_permission', b)
        continue
      }
      const ctx = report[b.id]?.daily?.envelope.payload?.context
      if (!ctx) continue
      const present = ctx.state === 'present'
      const ref = present && typeof ctx.temperatureC === 'number' ? book.add(`weather.daily.${b.key}.${businessDate}`, ctx.temperatureC, 'celsius', `${b.name} ${businessDate} günlük ortalama sıcaklık (${ctx.provenance === 'reanalysis' ? 'modellenmiş geçmiş veri' : 'geçmiş bağlam'})`) : null
      historical.push({ branchKey: b.key, branchName: b.name, date: businessDate, state: present ? 'present' : 'missing', provenance: present ? (ctx.provenance ?? null) : null, temperatureC: typeof ctx.temperatureC === 'number' ? round1(ctx.temperatureC) : null, temperatureMinC: ctx.temperatureMinC ?? null, temperatureMaxC: ctx.temperatureMaxC ?? null, precipitationMm: ctx.precipitationMm ?? null, ref })
      if (!present) limits.add('missing_context', b)
    }
  }
  const weatherAvailable = forecast.length > 0 || historical.length > 0

  // ---- analytics observations: existing evidence-gated insights (facts / relationships only; a hypothesis never enters) ---------
  const insights: DailyFactPack['analytics']['insights'] = []
  for (const b of branches) {
    for (const i of report[b.id]?.daily?.insights ?? []) {
      if (i.confidence === 'hypothesis') continue
      insights.push({ branchKey: b.key, branchName: b.name, code: i.code, confidence: i.confidence, title: i.title })
    }
  }

  // ---- inventory roll-up -------------------------------------------------------------------------------------------------------
  const wasteEntries = sumFacts(book, 'inventory.waste.entries', 'count', 'Fire kaydı', branchFacts.flatMap((b) => (b.waste ? [b.waste.entries] : [])), branchFacts.filter((b) => b.waste).length || 1)
  const wasteCost = ((): Fact => {
    const facts = branchFacts.flatMap((b) => (b.waste ? [b.waste.cost] : []))
    if (facts.length === 0) return unsupportedFact('no_waste_data')
    return sumFacts(book, 'inventory.waste.cost', 'TRY', 'Fire maliyeti', facts, facts.length)
  })()
  const alertFacts = branchFacts.map((b) => b.stockAlerts)
  const stockAlertBranches = ((): Fact => {
    const known = branchFacts.filter((b) => b.stockAlerts.value !== null)
    if (known.length === 0) return unsupportedFact(...alertFacts.flatMap((f) => f.reasons))
    return book.fact('inventory.stockAlertBranches', known.filter((b) => (b.stockAlerts.value ?? 0) > 0).length, 'count', 'Stok uyarısı olan şube', known.length === total ? 'complete' : 'partial', known.length < total ? ['not_all_branches'] : [])
  })()

  const reproducibility = reproducibilityOf(book.entries, isCurrentDate)
  if (reproducibility.state === 'live') limits.add('live_state')
  else if (reproducibility.state === 'partial') limits.add('mutable_sources')
  const reasons = [...new Set(limits.list().map((l) => l.code))] as LimitationCode[]
  const overall: DailyFactPack['completeness']['overall'] =
    finalizedBranches === 0 && provisionalBranches === 0 ? 'no_data' : finalizedBranches === total && !reasons.some((r) => BLOCKING_LIMITATIONS.includes(r)) ? 'complete' : 'partial'

  return {
    schemaVersion: FACT_PACK_SCHEMA_VERSION,
    reportType: 'daily',
    businessDate,
    generatedAt: now.toISOString(),
    scope: { kind: branches.length === 1 ? 'branch' : 'organization', branches },
    isCurrentDate,
    reproducibility,
    completeness: { overall, reasons },
    organization: {
      finalizedRevenue: orgFinalizedRevenue,
      provisionalRevenue: orgProvisional,
      reportingCompleteness: reporting,
      transactions: orgTransactions,
      averageBasket: orgBasket,
      grossProfit: orgGross,
    },
    branches: branchFacts,
    attention,
    operations: {
      shiftsCompleted: op('ops.shifts.completed', 'Tamamlanan vardiya', branchFacts.reduce((s, b) => s + b.shifts.completed, 0)),
      shiftsOpen: op('ops.shifts.open', 'Açık/planlı vardiya', branchFacts.reduce((s, b) => s + b.shifts.open, 0)),
      reportsSubmitted: op('ops.reports', 'Gönderilen rapor', branchFacts.reduce((s, b) => s + b.reportCount, 0)),
      reconciliationOk: op('ops.reconciliation.ok', 'Mutabakatı tamam rapor', reconTotals.ok),
      reconciliationWarning: op('ops.reconciliation.warning', 'Mutabakat uyarısı olan rapor', reconTotals.warning),
      reconciliationError: op('ops.reconciliation.error', 'Mutabakat hatası olan rapor', reconTotals.error),
      openReconciliationBacklog: isCurrentDate ? op('ops.reconciliation.backlog', 'İnceleme bekleyen mutabakat sorunu', rows.reduce((s, r) => s + r.openReconciliationCount, 0)) : unsupportedFact('not_current_date'),
    },
    inventory: {
      stockAlertBranches,
      countsMissingBranches: branchFacts.filter((b) => b.closingCount === 'missing').map((b) => b.branchName),
      unexplainedShortageBranches: branchFacts.filter((b) => (b.countOutcome?.unexplainedLines.value ?? 0) > 0).map((b) => b.branchName),
      timingUncertainBranches: branchFacts.filter((b) => (b.countOutcome?.timingUncertainLines.value ?? 0) > 0).map((b) => b.branchName),
      wasteEntries,
      wasteCost,
    },
    procurement,
    weather: {
      state: weatherAvailable ? 'available' : 'unavailable',
      reason: weatherAvailable ? undefined : isCurrentDate ? 'no_weather_data' : 'no_historical_context',
      forecast,
      historical,
    },
    analytics: { insights },
    limitations: limits.list(),
    evidence: book.entries,
    provenance: {
      generator: FACT_PACK_GENERATOR,
      factSchemaVersion: FACT_PACK_SCHEMA_VERSION,
      readModels: ['get_dashboard_inputs', 'get_command_center_signals', 'get_manager_report_inputs'],
      snapshots,
    },
  }
}

