import { describe, expect, it } from 'vitest'
import { available, notApplicable, type BranchComparisonRow } from '../dashboard'
import type { BranchCountOverview, CountSummary, WasteReport } from '../inventory/control'
import type { OrderBrief, OrderSuggestion, ProcurementAttention } from '../procurement'
import type { BranchWeather, WeatherForecast } from '../weather'
import { buildAttentionFeed, ROUTES } from './attention'
import type { BranchSignals } from './types'

const NOW = new Date('2026-10-07T09:00:00Z') // 12:00 Istanbul

const row = (patch: Partial<BranchComparisonRow> = {}): BranchComparisonRow => ({
  branchId: 'b1',
  branchKey: 'rumeli',
  branchName: 'Rumeli',
  revenue: available(0),
  revenueBreakdown: { finalizedKurus: 0, provisionalKurus: 0, finalizedDays: 1, provisionalDays: 0, zBelowXDays: [], multipleReadingDays: [] },
  revenueShare: notApplicable(),
  reportCount: 2,
  reconciliation: { OK: 2, WARNING: 0, ERROR: 0 },
  openReconciliationCount: 0,
  shifts: { scheduled: 0, inProgress: 0, submitted: 0, closed: 2, cancelled: 0, completed: 2 },
  inventoryTracked: true,
  inventoryAlertCount: available(0),
  wasteEntryCount: available(0),
  countsSubmittedInPeriod: available(1),
  grossProfit: notApplicable(),
  ...patch,
})

const summary = (patch: Partial<CountSummary> = {}): CountSummary => ({
  lines: 6, balancedLines: 6, shortageLines: 0, surplusLines: 0, timingUncertainLines: 0, unexplainedLines: 0,
  unexplainedQuantityByUnit: [], timingUncertainQuantityByUnit: [], shortageQuantityByUnit: [], surplusQuantityByUnit: [],
  varianceValue: { state: 'available', value: 0 }, ...patch,
})

const counts = (patch: Partial<BranchCountOverview> = {}, s: CountSummary | null = summary()): BranchCountOverview => ({
  branchId: 'b1', today: '2026-10-07', todayStatus: 'submitted', latestCountId: 'c1', latestSummary: s,
  recent: [{ id: 'c1', businessDate: '2026-10-07', status: 'submitted', submittedAt: '2026-10-06T20:00:00Z', shiftId: null, submittedBy: null, employeeCode: null, voidReason: null, summary: s }],
  ...patch,
})

const waste = (entries: number): WasteReport => ({
  branchId: 'b1', from: '2026-10-07', to: '2026-10-07', entries, reversedEntries: 0,
  cost: { state: entries ? 'partial' : 'available', value: 0, reason: 'missing_cost' }, costCoverage: { state: 'available', costedEntries: 0, entries },
  quantityByUnit: [], byItem: [], byReason: [], byEmployee: [], byShift: [],
})

const brief = (id: string, patch: Partial<OrderBrief> = {}): OrderBrief => ({
  id, orderNumber: `PO-${id}`, status: 'APPROVED', supplierName: 'Sentetik', expectedDeliveryDate: '2026-10-07', submittedAt: null, lineCount: 1, receivedLineCount: 0, ...patch,
})

const procurement = (patch: Partial<ProcurementAttention> = {}): ProcurementAttention => ({
  branchId: 'b1', today: '2026-10-07', awaitingApproval: [], dueToday: [], overdueDelivery: [], partiallyReceived: [], nextDeliveries: [], lowStockNoOpenOrder: [], reconciliationWarnings: [], ...patch,
})

const suggestion = (cutoffPassed: boolean | null): OrderSuggestion => ({
  inventoryItemId: 'i1', code: 'X', name: 'X', unit: 'kg', supplierId: 's', supplierCode: 'S', supplierName: 'S', onHand: 1, pendingOrderQuantity: 0, effectiveStock: 1,
  minimumStock: 5, targetStock: 10, safetyStock: null, orderUnit: null, unitsPerPack: null, conversionStatus: 'base_unit', status: 'configured', reorderNeeded: true,
  suggestedQuantity: 9, suggestedBaseQuantity: 9, hasOpenOrder: false,
  calendar: { configured: true, today: '2026-10-07', canOrderToday: cutoffPassed === false, cutoffPassed, nextOrderDate: '2026-10-09', expectedDelivery: { state: 'unknown', date: null } },
})

const forecast = (patch: Partial<WeatherForecast> = {}, rainMm = 0): WeatherForecast => ({
  status: 'fresh', staleReason: null, isForecast: true, provider: 'open-meteo', timezone: 'Europe/Istanbul', fetchedAt: '2026-10-07T08:50:00Z', generatedAt: null, validUntil: '2026-10-07T09:50:00Z',
  ageMinutes: 10, location: { label: 'Sentetik' },
  current: { time: '2026-10-07T09:00:00Z', temperatureC: 21, apparentTemperatureC: 20, weatherCode: 2, precipitationMm: 0, windKmh: 10, windGustKmh: 20 },
  hourly: [0, 1, 2, 3].map((h) => ({ time: new Date(NOW.getTime() + h * 3600_000).toISOString(), temperatureC: 20, apparentTemperatureC: 19, precipitationProbability: rainMm ? 80 : 5, precipitationMm: rainMm, weatherCode: 3, windKmh: 10, windGustKmh: 20 })),
  daily: [{ date: '2026-10-07', temperatureMinC: 15, temperatureMaxC: 24, precipitationProbabilityMax: 80, precipitationSumMm: rainMm, windMaxKmh: 30, windGustMaxKmh: 45, weatherCode: 61, sunrise: null, sunset: null }],
  ...patch,
})

const signals = (patch: Partial<BranchSignals> = {}): BranchSignals => ({
  branchId: 'b1', businessDate: '2026-10-07', timezone: 'Europe/Istanbul', location: { state: 'set' },
  counts: { state: 'available', data: counts() },
  waste: { state: 'available', data: waste(0) },
  procurement: { state: 'available', data: procurement() },
  weather: { state: 'available', data: forecast() as BranchWeather },
  analytics: { state: 'unavailable', reason: 'no_snapshot' },
  ...patch,
})

const feed = (r: BranchComparisonRow, s: BranchSignals | null, name = 'Rumeli') => buildAttentionFeed([{ branchId: r.branchId, branchName: name, row: r, signals: s, now: NOW }])
const codes = (f: ReturnType<typeof feed>) => f.items.map((i) => i.reasonCode)

describe('attention feed: a clean day is silent (no fake alarms)', () => {
  it('produces no items when everything is fine and zero waste is not an item', () => {
    const f = feed(row(), signals())
    expect(f.items).toEqual([])
    expect(f.counts).toEqual({ critical: 0, warning: 0, info: 0 })
    expect(f.unavailableSources).toEqual([])
  })
})

describe('reporting and data integrity', () => {
  it('reconciliation ERROR is critical and leads the feed; WARNING is a warning; both route to the queue', () => {
    const f = feed(row({ reconciliation: { OK: 0, WARNING: 1, ERROR: 1 } }), signals())
    expect(f.items[0]).toMatchObject({ reasonCode: 'reconciliation_error', severity: 'critical', category: 'data_integrity', actionRoute: ROUTES.reconciliation })
    expect(codes(f)).toContain('reconciliation_warning')
  })
  it('an X-only (provisional) day asks for the Z report and links to reports; it is never treated as revenue', () => {
    const f = feed(row({ revenueBreakdown: { finalizedKurus: 0, provisionalKurus: 1843000, finalizedDays: 0, provisionalDays: 1, zBelowXDays: [], multipleReadingDays: [] } }), signals())
    expect(f.items.find((i) => i.reasonCode === 'x_only_provisional')).toMatchObject({ severity: 'warning', category: 'reporting', actionRoute: ROUTES.reports, timeSensitive: true })
  })
  it('no report yet is information only (no deadline is configured)', () => {
    expect(feed(row({ reportCount: 0 }), signals()).items.find((i) => i.reasonCode === 'no_reports_yet')?.severity).toBe('info')
  })
  it('Z below X and the open reconciliation backlog are warnings', () => {
    const f = feed(row({ openReconciliationCount: 3, revenueBreakdown: { finalizedKurus: 1, provisionalKurus: 0, finalizedDays: 1, provisionalDays: 0, zBelowXDays: ['2026-10-07'], multipleReadingDays: [] } }), signals())
    expect(codes(f)).toEqual(expect.arrayContaining(['z_below_x', 'open_reconciliation_backlog']))
  })
})

describe('inventory and closing counts', () => {
  it('stock alerts come from the existing alert definition', () => {
    const f = feed(row({ inventoryAlertCount: available(2) }), signals())
    expect(f.items.find((i) => i.reasonCode === 'stock_alert')).toMatchObject({ severity: 'warning', count: 2, actionRoute: ROUTES.inventory })
  })
  it('an unexplained shortage links to the count review; timing_uncertain is information, never a confirmed explanation', () => {
    const f = feed(row(), signals({ counts: { state: 'available', data: counts({}, summary({ shortageLines: 3, unexplainedLines: 1, timingUncertainLines: 2 })) } }))
    expect(f.items.find((i) => i.reasonCode === 'count_unexplained_shortage')).toMatchObject({ severity: 'warning', actionRoute: ROUTES.countReview('c1'), count: 1 })
    expect(f.items.find((i) => i.reasonCode === 'count_timing_uncertain')).toMatchObject({ severity: 'info', actionRoute: ROUTES.countReview('c1') })
  })
  it('an old count (before yesterday) raises nothing', () => {
    const old = counts({ recent: [{ id: 'c1', businessDate: '2026-10-01', status: 'submitted', submittedAt: '', shiftId: null, submittedBy: null, employeeCode: null, voidReason: null, summary: null }] }, summary({ unexplainedLines: 2 }))
    expect(codes(feed(row(), signals({ counts: { state: 'available', data: old } })))).not.toContain('count_unexplained_shortage')
  })
  it('a missing closing count is only a warning once the day shifts are complete', () => {
    const missing = signals({ counts: { state: 'available', data: counts({ todayStatus: 'missing', latestCountId: null }, null) } })
    expect(feed(row(), missing).items.find((i) => i.reasonCode === 'closing_count_missing')).toMatchObject({ severity: 'warning', actionRoute: ROUTES.countOverview })
    const open = row({ shifts: { scheduled: 0, inProgress: 1, submitted: 0, closed: 1, cancelled: 0, completed: 1 } })
    expect(feed(open, missing).items.find((i) => i.reasonCode === 'closing_count_missing')?.severity).toBe('info')
  })
  it('waste is reported as a fact, never as "unusual" (no waste threshold is configured)', () => {
    const f = feed(row(), signals({ waste: { state: 'available', data: waste(3) } }))
    expect(f.items.find((i) => i.reasonCode === 'waste_today')).toMatchObject({ severity: 'info', actionRoute: ROUTES.wasteReport, count: 3 })
  })
  it('a branch that does not track inventory gets no count alarms', () => {
    const f = feed(row({ inventoryTracked: false }), signals({ counts: { state: 'available', data: counts({ todayStatus: 'missing', latestCountId: null }, null) } }))
    expect(codes(f)).not.toContain('closing_count_missing')
  })
})

describe('procurement', () => {
  it('overdue, awaiting approval, low stock without an order and due-today each lead to the right place', () => {
    const p = procurement({
      overdueDelivery: [brief('o1', { expectedDeliveryDate: '2026-10-05' })],
      awaitingApproval: [brief('o2', { status: 'SUBMITTED' }), brief('o3', { status: 'SUBMITTED' })],
      dueToday: [brief('o4')],
      lowStockNoOpenOrder: [suggestion(false)],
      partiallyReceived: [brief('o5', { status: 'PARTIALLY_RECEIVED' })],
    })
    const f = feed(row(), signals({ procurement: { state: 'available', data: p } }))
    expect(f.items.find((i) => i.reasonCode === 'delivery_overdue')).toMatchObject({ severity: 'warning', actionRoute: ROUTES.order('o1'), timeSensitive: true })
    expect(f.items.find((i) => i.reasonCode === 'order_awaiting_approval')).toMatchObject({ actionRoute: ROUTES.procurement, count: 2 })
    expect(f.items.find((i) => i.reasonCode === 'low_stock_no_order')).toMatchObject({ severity: 'warning', actionRoute: ROUTES.procurement })
    expect(f.items.find((i) => i.reasonCode === 'delivery_due_today')).toMatchObject({ severity: 'info', actionRoute: ROUTES.order('o4') })
    expect(f.items.find((i) => i.reasonCode === 'order_partially_received')?.severity).toBe('info')
    expect(codes(f)).not.toContain('order_cutoff_passed')
  })
  it('a passed cutoff on a low-stock item without an open order is called out (from the CONFIGURED cutoff)', () => {
    const f = feed(row(), signals({ procurement: { state: 'available', data: procurement({ lowStockNoOpenOrder: [suggestion(true)] }) } }))
    expect(f.items.find((i) => i.reasonCode === 'order_cutoff_passed')).toMatchObject({ severity: 'warning', timeSensitive: true })
  })
  it('a reversed receipt shows as a data-integrity warning', () => {
    const p = procurement({ reconciliationWarnings: [{ ...brief('o9', { status: 'RECEIVED' }), reasons: ['receipt_reversed'] }] })
    expect(feed(row(), signals({ procurement: { state: 'available', data: p } })).items.find((i) => i.reasonCode === 'receipt_reconciliation_warning')).toMatchObject({ category: 'data_integrity', severity: 'warning', actionRoute: ROUTES.order('o9') })
  })
})

describe('weather is context, never an alarm', () => {
  it('missing branch coordinates: info with a link to the location settings, no guessing', () => {
    const f = feed(row(), signals({ location: { state: 'missing' }, weather: { state: 'available', data: { status: 'unavailable', reason: 'missing_branch_location', timezone: 'Europe/Istanbul' } } }))
    expect(f.items.find((i) => i.reasonCode === 'weather_location_missing')).toMatchObject({ severity: 'info', category: 'weather', actionRoute: ROUTES.branchLocation })
  })
  it('stale and not-loaded forecasts are information', () => {
    const stale = feed(row(), signals({ weather: { state: 'available', data: forecast({ status: 'stale', staleReason: 'expired', ageMinutes: 190 }) } }))
    expect(stale.items.find((i) => i.reasonCode === 'weather_stale')?.severity).toBe('info')
    const none = feed(row(), signals({ weather: { state: 'available', data: { status: 'unavailable', reason: 'no_forecast_loaded', timezone: 'Europe/Istanbul' } } }))
    expect(none.items.find((i) => i.reasonCode === 'weather_not_loaded')?.title).toBe('Hava verisi alınamadı')
  })
  it('an expected rain forecast is a neutral info item, and dry weather raises nothing', () => {
    expect(codes(feed(row(), signals({ weather: { state: 'available', data: forecast({}, 2) } })))).toContain('weather_rain_forecast')
    expect(codes(feed(row(), signals({ weather: { state: 'available', data: forecast({}, 0) } })))).not.toContain('weather_rain_forecast')
  })
  it('no weather item is ever critical or a warning', () => {
    const f = feed(row(), signals({ location: { state: 'missing' }, weather: { state: 'available', data: forecast({ status: 'stale', staleReason: 'expired' }, 5) } }))
    expect(f.items.filter((i) => i.category === 'weather').every((i) => i.severity === 'info')).toBe(true)
  })
})

describe('analytics observations', () => {
  it('only evidence-gated insights appear (facts and relationships), a hypothesis never does', () => {
    const s = signals({ analytics: { state: 'available', data: {
      daily: { businessDate: '2026-10-06', version: 1, generatedAt: '', completeness: 'partial', insights: [
        { code: 'rain_effect', title: 'Yağmurlu günlerde ciro farkı', confidence: 'relationship', isFinancial: true, origin: 'deterministic' },
        { code: 'missing_z', title: 'Z eksik', confidence: 'fact', isFinancial: false, origin: 'deterministic' },
        { code: 'maybe', title: 'Belki', confidence: 'hypothesis', isFinancial: false, origin: 'ai' },
      ] },
      weekly: { weekStart: '2026-10-05', version: 1, generatedAt: '', weekComplete: false, insights: [
        { code: 'weather_relationship', title: 'Sıcaklık ile ciro arasında ilişki', confidence: 'relationship', isFinancial: false, origin: 'deterministic' },
        { code: 'week_revenue', title: 'Haftalık ciro', confidence: 'fact', isFinancial: true, origin: 'deterministic' },
      ] },
    } } })
    const f = feed(row(), s)
    // daily facts/relationships + ONLY the weekly relationship (weekly facts are not repeated in the feed)
    expect(f.items.filter((i) => i.source === 'analytics').map((i) => i.reasonCode).sort()).toEqual(['analytics_missing_z', 'analytics_rain_effect', 'analytics_weather_relationship'])
    expect(f.items.find((i) => i.reasonCode === 'analytics_rain_effect')?.description).toMatch(/neden-sonuç değil/)
  })
})

describe('ordering, coverage and branch isolation', () => {
  it('orders by severity, then category, then time-sensitivity', () => {
    const f = feed(
      row({ reconciliation: { OK: 0, WARNING: 1, ERROR: 1 }, inventoryAlertCount: available(1) }),
      signals({ procurement: { state: 'available', data: procurement({ awaitingApproval: [brief('o2')], dueToday: [brief('o4')] }) }, waste: { state: 'available', data: waste(2) } }),
    )
    expect(codes(f)).toEqual([
      'reconciliation_error', // critical
      'reconciliation_warning', // warning, data integrity
      'stock_alert', // warning, inventory
      'order_awaiting_approval', // warning, procurement
      'delivery_due_today', // info, procurement (time-sensitive) before
      'waste_today', // info, inventory ... wait: info inventory ranks before info procurement
    ].sort((a, b) => codes(f).indexOf(a) - codes(f).indexOf(b)))
    const sev = f.items.map((i) => i.severity)
    expect(sev).toEqual([...sev].sort((a, b) => ({ critical: 0, warning: 1, info: 2 })[a] - ({ critical: 0, warning: 1, info: 2 })[b]))
    const cat = f.items.filter((i) => i.severity === 'info').map((i) => i.category)
    expect(cat.indexOf('inventory')).toBeLessThan(cat.indexOf('procurement'))
  })
  it('time-sensitive items lead inside the same severity and category', () => {
    const f = feed(row(), signals({ procurement: { state: 'available', data: procurement({ partiallyReceived: [brief('o5')], dueToday: [brief('o4')] }) } }))
    expect(f.items.filter((i) => i.category === 'procurement').map((i) => i.reasonCode)).toEqual(['delivery_due_today', 'order_partially_received'])
  })
  it('a part the role cannot see is reported as unavailable coverage, not as all clear', () => {
    const f = feed(row(), signals({ counts: { state: 'unavailable', reason: 'no_permission' }, procurement: { state: 'unavailable', reason: 'no_permission' } }))
    expect(f.items).toEqual([])
    expect(f.unavailableSources.map((u) => [u.source, u.reason])).toEqual([['inventory_control', 'no_permission'], ['procurement', 'no_permission']])
  })
  it('a failed signals call lists the branch as unavailable instead of silent', () => {
    expect(feed(row(), null).unavailableSources).toEqual([{ branchId: 'b1', branchName: 'Rumeli', source: 'inventory_control', reason: 'signals_failed' }])
  })
  it('every item keeps its branch (no cross-branch mixing) and ids are unique per branch', () => {
    const a = row({ reconciliation: { OK: 0, WARNING: 0, ERROR: 1 } })
    const b = row({ branchId: 'b2', branchName: 'Dondurma', reconciliation: { OK: 0, WARNING: 1, ERROR: 0 } })
    const f = buildAttentionFeed([
      { branchId: 'b1', branchName: 'Rumeli', row: a, signals: signals(), now: NOW },
      { branchId: 'b2', branchName: 'Dondurma', row: b, signals: signals({ branchId: 'b2' }), now: NOW },
    ])
    expect(f.items.map((i) => [i.branchId, i.reasonCode])).toEqual([['b1', 'reconciliation_error'], ['b2', 'reconciliation_warning']])
    expect(new Set(f.items.map((i) => i.id)).size).toBe(f.items.length)
  })
})
