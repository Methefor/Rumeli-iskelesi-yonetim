import type { BranchComparisonRow } from '../dashboard'
import { metricValue } from '../dashboard'
import { istanbulDate } from '../../utils/dates'
import { rainExpected } from '../weather'
import type {
  AttentionCategory,
  AttentionFeed,
  AttentionItem,
  AttentionSeverity,
  AttentionSource,
  BranchSignals,
} from './types'

/**
 * The attention engine: deterministic, no AI, no invented thresholds.
 *
 * SEVERITY. critical = a configured/derived integrity check FAILED (reconciliation ERROR, which uses the per-branch configured
 * thresholds). warning = something a manager should act on that follows from existing definitions (stock alert, unexplained
 * shortage, awaiting approval, overdue delivery, low stock without an order, cutoff passed, X-only day, reconciliation WARNING).
 * info = context and deadlines of the day. Weather is ALWAYS info: no weather threshold is configured, so nothing is called critical.
 *
 * ORDER. severity first, then category (1 data integrity, 2 reporting input, 3 inventory/count, 4 procurement, 5 weather,
 * 6 analytics), then time-sensitive items (due today / overdue / awaiting a decision) first, then branch name for stability.
 */

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 }
const CATEGORY_RANK: Record<AttentionCategory, number> = { data_integrity: 1, reporting: 2, inventory: 3, procurement: 4, weather: 5, analytics: 6 }

export const ROUTES = {
  reconciliation: '/app/manager/reports/reconciliation',
  reports: '/app/manager/reports',
  inventory: '/app/manager/inventory',
  countOverview: '/app/manager/management/count-review',
  countReview: (id: string) => `/app/manager/management/count-review/${id}`,
  wasteReport: '/app/manager/management/waste-report',
  procurement: '/app/manager/procurement',
  order: (id: string) => `/app/manager/procurement/orders/${id}`,
  branchLocation: '/app/manager/management/branch-location',
  analytics: '/app/manager/analytics',
} as const

export interface BranchAttentionInput {
  branchId: string
  branchName: string
  /** the TODAY row of the existing dashboard model (finalization, reconciliation, shifts, stock alerts) */
  row: BranchComparisonRow
  /** null when the signals call failed: the branch is then listed as an unavailable source, not as "all clear" */
  signals: BranchSignals | null
  now: Date
}

const plural = (n: number, one: string) => `${n} ${one}`

export function buildAttentionFeed(inputs: BranchAttentionInput[]): AttentionFeed {
  const items: AttentionItem[] = []
  const unavailableSources: AttentionFeed['unavailableSources'] = []

  for (const input of inputs) {
    const { branchId, branchName, row, signals, now } = input
    const businessDate = signals?.businessDate ?? istanbulDate(now)
    const observedAt = now.toISOString()
    const add = (
      category: AttentionCategory,
      severity: AttentionSeverity,
      source: AttentionSource,
      reasonCode: string,
      title: string,
      description: string,
      actionRoute: string,
      opts: { count?: number | null; timeSensitive?: boolean } = {},
    ) =>
      items.push({
        id: `${branchId}:${reasonCode}`,
        branchId,
        branchName,
        category,
        severity,
        title,
        description,
        reasonCode,
        source,
        businessDate,
        actionRoute,
        count: opts.count ?? null,
        timeSensitive: opts.timeSensitive ?? false,
        observedAt,
      })

    // ---- 1. data integrity + 2. reporting input (existing dashboard model) --------------------------------------------------
    if (row.reconciliation.ERROR > 0) {
      add('data_integrity', 'critical', 'dashboard', 'reconciliation_error', 'Mutabakat hatası', `${plural(row.reconciliation.ERROR, 'rapor')} kasa ve kategori toplamı uyuşmuyor (hata eşiği aşıldı).`, ROUTES.reconciliation, { count: row.reconciliation.ERROR, timeSensitive: true })
    }
    if (row.reconciliation.WARNING > 0) {
      add('data_integrity', 'warning', 'dashboard', 'reconciliation_warning', 'Mutabakat uyarısı', `${plural(row.reconciliation.WARNING, 'rapor')} uyarı eşiğini aştı.`, ROUTES.reconciliation, { count: row.reconciliation.WARNING })
    }
    if (row.reconciliation.ERROR === 0 && row.reconciliation.WARNING === 0 && row.openReconciliationCount > 0) {
      add('data_integrity', 'warning', 'dashboard', 'open_reconciliation_backlog', 'Çözülmemiş mutabakat sorunları', `${row.openReconciliationCount} rapor hâlâ inceleme bekliyor.`, ROUTES.reconciliation, { count: row.openReconciliationCount })
    }
    if (row.revenueBreakdown.zBelowXDays.length > 0) {
      add('data_integrity', 'warning', 'dashboard', 'z_below_x', 'Z, X değerinden küçük', 'Z raporu X okumasının altında; ciro Z olarak kalır, kayıt gözden geçirilmeli.', ROUTES.reports, { count: row.revenueBreakdown.zBelowXDays.length })
    }
    if (row.revenueBreakdown.provisionalDays > 0) {
      add('reporting', 'warning', 'dashboard', 'x_only_provisional', 'Z raporu bekleniyor', 'Yalnızca X raporu var: ciro geçici, kesinleşmedi (X ile Z toplanmaz).', ROUTES.reports, { count: row.revenueBreakdown.provisionalDays, timeSensitive: true })
    } else if (row.reportCount === 0) {
      // no configured deadline: "no report yet" is information, not an alarm
      add('reporting', 'info', 'dashboard', 'no_reports_yet', 'Henüz rapor yok', 'Bugün bu şube için gönderilmiş rapor bulunmuyor.', ROUTES.reports)
    }

    // ---- 3. inventory (existing stock-alert definition) --------------------------------------------------------------------
    const alerts = metricValue(row.inventoryAlertCount)
    if (alerts !== null && alerts > 0) {
      add('inventory', 'warning', 'dashboard', 'stock_alert', 'Stok uyarısı', `${plural(alerts, 'ürün')} stok uyarısı veriyor.`, ROUTES.inventory, { count: alerts })
    }

    if (!signals) {
      unavailableSources.push({ branchId, branchName, source: 'inventory_control', reason: 'signals_failed' })
      continue
    }

    // ---- inventory control: closing counts + waste -------------------------------------------------------------------------
    if (signals.counts.state === 'available') {
      const o = signals.counts.data
      const allShiftsDone = row.shifts.completed > 0 && row.shifts.scheduled + row.shifts.inProgress === 0
      if (row.inventoryTracked && o.todayStatus === 'missing') {
        // without a configured count deadline this is a warning only when the day's shifts are already complete
        add('inventory', allShiftsDone ? 'warning' : 'info', 'inventory_control', 'closing_count_missing', 'Kapanış sayımı yok', 'Bugün gönderilmiş kapanış sayımı bulunmuyor.', ROUTES.countOverview, { timeSensitive: allShiftsDone })
      } else if (row.inventoryTracked && o.todayStatus === 'voided_only') {
        add('inventory', 'warning', 'inventory_control', 'closing_count_voided_only', 'Kapanış sayımı iptal edilmiş', 'Bugünkü tek sayım iptal edildi; geçerli sayım yok.', ROUTES.countOverview, { timeSensitive: true })
      }
      const s = o.latestSummary
      const latest = o.recent.find((c) => c.id === o.latestCountId)
      const recentEnough = latest ? latest.businessDate >= shiftDate(signals.businessDate, -1) : false
      if (s && latest && recentEnough && o.latestCountId) {
        if (s.unexplainedLines > 0) {
          add('inventory', 'warning', 'inventory_control', 'count_unexplained_shortage', 'Açıklanamayan sayım eksiği', `${plural(s.unexplainedLines, 'üründe')} eksik, sayımdan sonra girilmiş fire de yok.`, ROUTES.countReview(o.latestCountId), { count: s.unexplainedLines })
        }
        if (s.timingUncertainLines > 0) {
          add('inventory', 'info', 'inventory_control', 'count_timing_uncertain', 'Sayım eksiği: fire zamanı belirsiz', `${plural(s.timingUncertainLines, 'üründe')} eksik var; sayımdan sonra fire girilmiş ama ne zaman gerçekleştiği bilinmiyor.`, ROUTES.countReview(o.latestCountId), { count: s.timingUncertainLines })
        }
      }
    } else {
      unavailableSources.push({ branchId, branchName, source: 'inventory_control', reason: signals.counts.reason })
    }

    if (signals.waste.state === 'available') {
      const w = signals.waste.data
      if (w.entries > 0) {
        // no waste threshold is configured: report the fact, never an "unusual" judgement
        add('inventory', 'info', 'inventory_control', 'waste_today', 'Bugünkü fire kayıtları', `${plural(w.entries, 'fire kaydı')}${w.cost.state === 'available' ? '' : ' (maliyet kısmen/tamamen bilinmiyor)'}.`, ROUTES.wasteReport, { count: w.entries })
      }
    } else {
      unavailableSources.push({ branchId, branchName, source: 'inventory_control', reason: signals.waste.reason })
    }

    // ---- 4. procurement ----------------------------------------------------------------------------------------------------
    if (signals.procurement.state === 'available') {
      const p = signals.procurement.data
      const first = (list: Array<{ id: string }>) => (list.length === 1 ? ROUTES.order(list[0]!.id) : ROUTES.procurement)
      if (p.overdueDelivery.length > 0) {
        add('procurement', 'warning', 'procurement', 'delivery_overdue', 'Teslimat gecikti', `${plural(p.overdueDelivery.length, 'siparişin')} beklenen teslim tarihi geçti.`, first(p.overdueDelivery), { count: p.overdueDelivery.length, timeSensitive: true })
      }
      if (p.awaitingApproval.length > 0) {
        add('procurement', 'warning', 'procurement', 'order_awaiting_approval', 'Onay bekleyen sipariş', `${plural(p.awaitingApproval.length, 'sipariş')} onay bekliyor.`, first(p.awaitingApproval), { count: p.awaitingApproval.length, timeSensitive: true })
      }
      if (p.lowStockNoOpenOrder.length > 0) {
        const passed = p.lowStockNoOpenOrder.some((s) => s.calendar.cutoffPassed === true)
        add('procurement', 'warning', 'procurement', 'low_stock_no_order', 'Stok az, açık sipariş yok', `${plural(p.lowStockNoOpenOrder.length, 'ürün')} minimum stoğun altında ve açık siparişi yok${passed ? '; bazıları için bugünkü sipariş saati geçti' : ''}.`, ROUTES.procurement, { count: p.lowStockNoOpenOrder.length, timeSensitive: passed })
        if (passed) {
          add('procurement', 'warning', 'procurement', 'order_cutoff_passed', 'Sipariş saati geçti', 'Stoğu az ürünlerde bugünkü sipariş saati geçti; sonraki sipariş gününü bekleyin.', ROUTES.procurement, { count: p.lowStockNoOpenOrder.filter((s) => s.calendar.cutoffPassed === true).length, timeSensitive: true })
        }
      }
      if (p.dueToday.length > 0) {
        add('procurement', 'info', 'procurement', 'delivery_due_today', 'Bugün teslimat bekleniyor', `${plural(p.dueToday.length, 'sipariş')} bugün teslim edilecek.`, first(p.dueToday), { count: p.dueToday.length, timeSensitive: true })
      }
      if (p.partiallyReceived.length > 0) {
        add('procurement', 'info', 'procurement', 'order_partially_received', 'Kısmen teslim alınan sipariş', `${plural(p.partiallyReceived.length, 'sipariş')} kısmen teslim alındı.`, first(p.partiallyReceived), { count: p.partiallyReceived.length })
      }
      if (p.reconciliationWarnings.length > 0) {
        add('data_integrity', 'warning', 'procurement', 'receipt_reconciliation_warning', 'Teslimat stok kaydıyla uyuşmuyor', `${plural(p.reconciliationWarnings.length, 'siparişte')} teslim alınan bir stok girişi sonradan geri alınmış.`, first(p.reconciliationWarnings), { count: p.reconciliationWarnings.length })
      }
    } else {
      unavailableSources.push({ branchId, branchName, source: 'procurement', reason: signals.procurement.reason })
    }

    // ---- 5. weather (always info; the forecast is context, not a verdict) ---------------------------------------------------
    if (signals.location.state === 'missing') {
      add('weather', 'info', 'weather', 'weather_location_missing', 'Şube konumu tanımlı değil', 'Hava durumu için şube koordinatları gerekir; tahmin edilmez.', ROUTES.branchLocation)
    } else if (signals.weather.state === 'available') {
      const w = signals.weather.data
      if (w.status === 'unavailable') {
        add('weather', 'info', 'weather', 'weather_not_loaded', 'Hava verisi alınamadı', 'Hava verisi şu anda alınamıyor.', ROUTES.analytics)
      } else if (w.status === 'stale') {
        add('weather', 'info', 'weather', 'weather_stale', 'Hava verisi eski', `Son güncelleme ${w.ageMinutes} dk önce; gösterilen tahmin eski olabilir.`, ROUTES.analytics)
      } else if (rainExpected(w, now)) {
        add('weather', 'info', 'weather', 'weather_rain_forecast', 'Yağış tahmini', 'Önümüzdeki saatlerde yağış tahmin ediliyor (tahmin; satışa etkisi desteklenmiyor).', ROUTES.analytics)
      }
    } else {
      unavailableSources.push({ branchId, branchName, source: 'weather', reason: signals.weather.reason })
    }

    // ---- 6. analytics observations (existing evidence-gated insights only) --------------------------------------------------
    if (signals.analytics.state === 'available') {
      const { daily, weekly } = signals.analytics.data
      // evidence-gated insights only: facts and relationships (a hypothesis never reaches the feed)
      const picked = [...(daily?.insights.slice(0, 3) ?? []), ...(weekly?.insights.filter((i) => i.confidence === 'relationship').slice(0, 2) ?? [])]
      for (const insight of picked) {
        if (insight.confidence === 'hypothesis') continue
        add('analytics', 'info', 'analytics', `analytics_${insight.code}`, insight.title, insight.confidence === 'relationship' ? 'İlişki (neden-sonuç değil), yeterli örnekle desteklenmiş.' : 'Doğrulanmış veri gözlemi.', ROUTES.analytics)
      }
    } else if (signals.analytics.reason !== 'no_snapshot') {
      unavailableSources.push({ branchId, branchName, source: 'analytics', reason: signals.analytics.reason })
    }
  }

  items.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] ||
      Number(b.timeSensitive) - Number(a.timeSensitive) ||
      a.branchName.localeCompare(b.branchName, 'tr') ||
      a.reasonCode.localeCompare(b.reasonCode),
  )
  const counts: AttentionFeed['counts'] = { critical: 0, warning: 0, info: 0 }
  for (const i of items) counts[i.severity] += 1
  return { items, counts, unavailableSources }
}

function shiftDate(iso: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
