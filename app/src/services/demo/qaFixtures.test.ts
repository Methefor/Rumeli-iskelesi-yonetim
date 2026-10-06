import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeBranchRevenueBreakdown } from '../../domain/dashboard'
import { buildWeeklyAnalytics, computeDay, type AnalyticsReportFact } from '../../domain/analytics'
import { weekStartOf } from '../../domain/analytics'
import { addDaysIso, istanbulDate } from '../../utils/dates'
import { createDemoState, theoreticalQuantity, DEMO_BRANCH_BALIK, DEMO_BRANCH_DONDURMA, DEMO_BRANCH_RUMELI } from './store'

const NOW = new Date('2026-10-07T12:00:00+03:00')
const today = istanbulDate(NOW)
const qa = createDemoState(NOW, { fixtureSet: 'qa' })
const date = (offset: number) => addDaysIso(today, offset)

function factsFor(branchId: string, d: string) {
  const shiftIds = new Set(qa.shifts.filter((s) => s.branchId === branchId && s.businessDate === d).map((s) => s.id))
  const catKey = new Map(qa.categories.map((c) => [c.id, c]))
  const reports: AnalyticsReportFact[] = qa.reports
    .filter((r) => r.branchId === branchId && shiftIds.has(r.shiftId))
    .map((r) => ({
      id: r.id,
      shiftId: r.shiftId,
      reportType: r.reportType,
      status: r.status,
      grossRevenue: r.grossRevenue,
      transactionCount: r.transactionCount ?? null,
      reconciliationStatus: r.reconciliationStatus,
      submittedAt: r.submittedAt,
      updatedAt: r.submittedAt,
      isLegacy: r.origin === 'legacy_import',
      lines: r.items.map((i) => ({
        categoryId: i.categoryId,
        categoryKey: catKey.get(i.categoryId)?.key ?? i.categoryId,
        categoryName: catKey.get(i.categoryId)?.name ?? i.categoryId,
        amount: i.amount,
        quantity: null,
        inventoryItemId: i.inventoryItemId,
        inventoryQuantity: i.inventoryQuantity,
      })),
    }))
  return { date: d, reports, products: qa.items.filter((i) => i.branchId === branchId).map((i) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit })), unitCosts: {} }
}

describe('synthetic QA fixture set (opt-in, deterministic, no real data)', () => {
  it('is only produced on request: the default Preview set stays empty', () => {
    expect(createDemoState(NOW, { includeSyntheticOperations: false }).reports).toEqual([])
    expect(createDemoState(NOW, { fixtureSet: 'none' }).reports).toEqual([])
  })

  it('is deterministic', () => {
    const again = createDemoState(NOW, { fixtureSet: 'qa' })
    expect(again.reports.map((r) => [r.reportType, r.grossRevenue, r.transactionCount])).toEqual(qa.reports.map((r) => [r.reportType, r.grossRevenue, r.transactionCount]))
  })

  it('covers three branches with about six weeks of X and Z readings', () => {
    for (const branch of [DEMO_BRANCH_RUMELI, DEMO_BRANCH_DONDURMA, DEMO_BRANCH_BALIK]) {
      const reports = qa.reports.filter((r) => r.branchId === branch)
      expect(reports.filter((r) => r.reportType === 'X').length).toBeGreaterThan(40)
      expect(reports.filter((r) => r.reportType === 'Z').length).toBeGreaterThan(35)
    }
  })

  it('contains provisional X-only days (past and today), and a Z below X anomaly', () => {
    expect(computeDay(factsFor(DEMO_BRANCH_RUMELI, date(-9))).finalization).toBe('provisional')
    expect(computeDay(factsFor(DEMO_BRANCH_DONDURMA, date(-6))).finalization).toBe('provisional')
    expect(computeDay(factsFor(DEMO_BRANCH_RUMELI, date(0))).finalization).toBe('provisional')
    const anomaly = computeDay(factsFor(DEMO_BRANCH_RUMELI, date(-5)))
    expect(anomaly.finalization).toBe('finalized')
    expect(anomaly.warnings).toContainEqual({ code: 'z_below_x' })
  })

  it('the dashboard rule on this data is the Z, never X + Z', () => {
    const d = date(-2)
    const reports = qa.reports.filter((r) => r.branchId === DEMO_BRANCH_RUMELI).map((r) => ({
      shiftId: r.shiftId,
      businessDate: qa.shifts.find((s) => s.id === r.shiftId)?.businessDate,
      reportType: r.reportType,
      grossRevenue: r.grossRevenue,
      status: r.status,
      reconciliationStatus: r.reconciliationStatus,
    }))
    const day = reports.filter((r) => r.businessDate === d)
    const z = day.find((r) => r.reportType === 'Z')!
    const x = day.find((r) => r.reportType === 'X')!
    expect(x.shiftId).not.toBe(z.shiftId) // morning X and evening Z are on different shifts
    expect(computeBranchRevenueBreakdown(day)).toMatchObject({ finalizedKurus: Math.round(z.grossRevenue * 100), provisionalKurus: 0 })
  })

  it('has reconciliation WARNING and ERROR reports', () => {
    const statuses = new Set(qa.reports.filter((r) => r.origin !== 'legacy_import').map((r) => r.reconciliationStatus))
    expect(statuses.has('WARNING')).toBe(true)
    expect(statuses.has('ERROR')).toBe(true)
  })

  it('has legacy-origin history with no transaction counts', () => {
    const legacy = qa.reports.filter((r) => r.origin === 'legacy_import')
    expect(legacy.length).toBeGreaterThan(10)
    expect(legacy.every((r) => r.transactionCount === null)).toBe(true)
  })

  it('has inventory with a costed and an uncosted product, waste with several reasons and closing counts', () => {
    expect(qa.items.length).toBeGreaterThanOrEqual(4)
    expect(qa.costs.some((c) => c.inventoryItemId === 'demo-item-a')).toBe(true)
    expect(qa.costs.some((c) => c.inventoryItemId === 'demo-item-c')).toBe(false)
    const waste = qa.movements.filter((m) => m.type === 'WASTE')
    expect(waste.length).toBeGreaterThan(5)
    expect(new Set(waste.map((m) => m.reasonCode)).size).toBeGreaterThan(2)
    expect(qa.counts.length).toBeGreaterThanOrEqual(4)
    expect(qa.counts.some((c) => c.lines.some((l) => l.varianceQuantity !== 0))).toBe(true)
    for (const item of qa.items.filter((i) => i.isActive)) expect(theoreticalQuantity(qa, item.id)).toBeGreaterThanOrEqual(0)
  })

  it('populates the analytics states: finalized weeks, provisional week, weather relationship sample', () => {
    const settingsDayFor = (d: string) => computeDay(factsFor(DEMO_BRANCH_DONDURMA, d))
    const lastFull = addDaysIso(weekStartOf(today), -14) // the Dondurma X-only day (-6) sits in the previous week on purpose
    const wx = qa.externalContext!
    const weatherDays = Array.from({ length: 84 }, (_, i) => addDaysIso(addDaysIso(lastFull, 6), -i))
      .filter((d) => wx[d] && settingsDayFor(d).finalization === 'finalized')
      .map((d) => ({ date: d, revenue: settingsDayFor(d).financial.grossRevenue.value as number, temperatureC: wx[d]!.temperatureC, precipitationMm: wx[d]!.precipitationMm }))
    const w = buildWeeklyAnalytics({ branchId: 'D', weekStart: lastFull, today, dayFor: settingsDayFor, weatherDays, sourceLatestAt: null })
    expect(w.finalization).toBe('finalized')
    expect(w.financialComparisons.grossRevenue.state).not.toBe('no_baseline')
    expect(w.weatherEffect.state).toBe('ok') // enough synthetic days for the relationship
    const current = buildWeeklyAnalytics({ branchId: 'D', weekStart: weekStartOf(today), today, dayFor: settingsDayFor, weatherDays: [], sourceLatestAt: null })
    expect(current.finalization).toBe('provisional') // today is X only / week in progress
  })

  it('is clearly synthetic: only placeholder names and no secrets', () => {
    const text = JSON.stringify({ items: qa.items, employees: qa.employees })
    expect(text).toMatch(/Örnek Ürün/)
    expect(text).toMatch(/Demo/)
    expect(text).not.toMatch(/eyJ|sb_secret|service_role|supabase\.co/i)
  })
})

describe('QA fixture safety guards', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('the default environment never yields the QA set (flag unset or false)', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    for (const flag of [undefined, '', 'false', 'true']) {
      vi.stubEnv('VITE_DEMO_FIXTURES', flag as string)
      const state = createDemoState(NOW)
      expect(state.externalContext).toBeUndefined() // only the QA set adds synthetic weather
    }
  })

  it('the QA flag alone (without demo mode) does not enable it', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false')
    vi.stubEnv('VITE_DEMO_FIXTURES', 'qa')
    expect(createDemoState(NOW).externalContext).toBeUndefined()
  })

  it('demo mode + the explicit qa flag enables it', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    vi.stubEnv('VITE_DEMO_FIXTURES', 'qa')
    expect(createDemoState(NOW).externalContext).toBeDefined()
  })

  it('no fixture identifier looks like a production identifier, URL or key', () => {
    const text = JSON.stringify(qa)
    expect(text).not.toMatch(/https?:\/\//)
    expect(text).not.toMatch(/iwikwbjsznjuefvuemdb|\.supabase\.co|eyJ[A-Za-z0-9_-]{15,}|sb_(secret|publishable)/)
    for (const e of qa.employees) expect(e.id).toMatch(/^demo-/)
    for (const r of qa.reports) expect(r.id).toMatch(/^demo-/)
  })
})
