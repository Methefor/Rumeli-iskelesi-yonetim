import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateNarrative } from '../../domain/managerReport'

/**
 * The manager reports over the synthetic QA fixture set (demo mode, zero network): the real loaders, the real deterministic engines,
 * the demo read models. Every narrative must pass the validator, and the planned scenarios must show up as FACTS in the pack.
 * NOW = Wednesday 2026-10-07 12:00 Istanbul; the previous complete week is 2026-09-28 .. 2026-10-04.
 */
const NOW = new Date('2026-10-07T12:00:00+03:00')
const PREV_WEEK = '2026-09-28'
const MIXED_WEEK = '2026-08-31' // straddles the legacy/native boundary of the Rumeli branch

async function boot(code = 'M001') {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  sessionStorage.clear()
  const session = await import('../auth/demoSession')
  sessionStorage.setItem(session.DEMO_STORAGE_KEY, `${code}:2027`)
  const state = await import('../../services/demo/state')
  state.resetDemoState(NOW, { fixtureSet: 'qa' })
  const loaders = await import('./loadReport')
  const branches = state.demoState().branches.map((b) => ({ id: b.id, key: b.key, name: b.name }))
  return { loaders, branches, state }
}

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'true')
  vi.stubEnv('VITE_DEMO_FIXTURES', 'qa')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://demo-mode-must-not-call-this.invalid')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'not-a-real-key')
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network is forbidden in demo mode'))))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
vi.setConfig({ testTimeout: 30000 })

describe('daily manager summary over the QA data', () => {
  it('today: some branches wait for Z, one is finalized, a critical reconciliation error is surfaced, and the narrative validates', async () => {
    const { loaders, branches } = await boot()
    const { pack, narrative } = await loaders.loadDailyReport(branches, '2026-10-07', NOW)
    expect(pack.isCurrentDate).toBe(true)
    expect(pack.organization.reportingCompleteness).toMatchObject({ total: 3, finalizedBranches: 1 })
    expect(pack.organization.finalizedRevenue.support).toBe('partial')
    expect(pack.organization.provisionalRevenue.support).toBe('partial')
    expect(pack.limitations.map((l) => l.code)).toContain('missing_z')
    expect(pack.attention.counts?.critical).toBeGreaterThan(0)
    expect(pack.attention.items.some((i) => i.reasonCode === 'reconciliation_error' && i.severity === 'critical')).toBe(true)
    expect(narrative.origin).toBe('deterministic')
    expect(validateNarrative(narrative.narrative, pack)).toMatchObject({ ok: true })
    const text = JSON.stringify(narrative.narrative)
    expect(text).toContain('henüz kesinleşmedi')
    expect(text).not.toMatch(/nedeniyle|yüzünden|çünkü/i)
  })

  it('carries the planned operational scenarios as facts: count findings, low stock, overdue order, stale weather', async () => {
    const { loaders, branches } = await boot()
    const { pack, narrative } = await loaders.loadDailyReport(branches, '2026-10-07', NOW)
    const codes = pack.attention.items.map((i) => i.reasonCode)
    expect(codes).toEqual(expect.arrayContaining(['count_unexplained_shortage']))
    expect(pack.procurement.state).toBe('available')
    expect((pack.procurement.lowStockNoOpenOrder.value ?? 0) + (pack.procurement.overdue.value ?? 0)).toBeGreaterThan(0)
    expect(pack.limitations.map((l) => l.code)).toContain('stale_weather')
    expect(narrative.narrative.sections.find((s) => s.code === 'procurement')!.body).toMatch(/sipariş|stok/)
  })

  it('a past X-only day is provisional and a Z-below-X day is surfaced (Z is used)', async () => {
    const { loaders, branches } = await boot()
    const r = branches.find((b) => b.key.includes('rumeli'))!
    const xOnly = await loaders.loadDailyReport([r], '2026-09-28', NOW) // offset -9
    expect(xOnly.pack.branches[0]!.finalization).toBe('provisional')
    expect(xOnly.pack.organization.finalizedRevenue.value).toBeNull()
    expect(validateNarrative(xOnly.narrative.narrative, xOnly.pack).ok).toBe(true)
    const zx = await loaders.loadDailyReport([r], '2026-10-02', NOW) // offset -5
    expect(zx.pack.branches[0]!.finalization).toBe('finalized')
    expect(zx.pack.branches[0]!.anomalies.map((a) => a.code)).toEqual(['z_below_x'])
    expect(zx.pack.isCurrentDate).toBe(false)
    expect(zx.pack.attention.reason).toBe('not_current_date')
  })

  it('a cashier is denied (no analytics permission); branch scope of a branch_manager is proven in manager_reports.test.sql', async () => {
    const { loaders, branches } = await boot('K001')
    await expect(loaders.loadDailyReport(branches, '2026-10-07', NOW)).rejects.toThrow()
  })
})

describe('weekly manager summary over the QA data', () => {
  it('the previous complete week: repeated missing Z and repeated reconciliation warnings are counted as frequencies', async () => {
    const { loaders, branches } = await boot()
    const { pack, narrative } = await loaders.loadWeeklyReport(branches, PREV_WEEK, NOW)
    expect(pack.weekStart).toBe(PREV_WEEK)
    expect(pack.weekComplete).toBe(true)
    const balik = pack.recurrence.items.find((i) => i.code === 'missing_z' && i.branchKey.includes('balik'))
    expect(balik).toMatchObject({ days: 3, dates: ['2026-09-28', '2026-09-29', '2026-09-30'] })
    const warn = pack.recurrence.items.find((i) => i.code === 'reconciliation_warning' && i.branchKey.includes('rumeli'))
    expect(warn?.days).toBeGreaterThanOrEqual(2)
    expect(pack.operations.missingZDays.value).toBeGreaterThanOrEqual(3)
    expect(pack.limitations.map((l) => l.code)).toContain('missing_z')
    const verdict = validateNarrative(narrative.narrative, pack)
    expect(verdict.ok, JSON.stringify(verdict)).toBe(true)
    expect(JSON.stringify(narrative.narrative)).toContain('Z raporu eksikliği bu hafta 3 gün görüldü')
  })

  it('the current week is in progress: partial, labelled, and no comparison with an unfinished week', async () => {
    const { loaders, branches } = await boot()
    const { pack, narrative } = await loaders.loadWeeklyReport(branches, '2026-10-05', NOW)
    expect(pack.weekComplete).toBe(false)
    expect(pack.completeness.overall).toBe('partial')
    expect(pack.limitations.map((l) => l.code)).toContain('incomplete_week')
    expect(pack.organization.vsPreviousWeek.support).toBe('unsupported')
    expect(pack.procurement.state).toBe('available')
    expect(narrative.narrative.headline).toContain('hafta sürüyor')
    expect(validateNarrative(narrative.narrative, pack).ok).toBe(true)
  })

  it('the legacy/native boundary week is mixed-origin: revenue comparison is flagged, transactions/basket comparisons are refused', async () => {
    const { loaders, branches } = await boot()
    const r = branches.find((b) => b.key.includes('rumeli'))!
    const { pack, narrative } = await loaders.loadWeeklyReport([r], MIXED_WEEK, NOW)
    const b = pack.branches[0]!
    expect(b.origin).toBe('mixed')
    expect(pack.limitations.map((l) => l.code)).toContain('mixed_origin')
    expect(b.transactionsVsPreviousWeek.state).not.toBe('ok')
    expect(b.basketVsPreviousWeek.state).not.toBe('ok')
    expect(validateNarrative(narrative.narrative, pack).ok).toBe(true)
  })

  it('the weather relationship of the correlated branch is an association with its sample, never a cause', async () => {
    const { loaders, branches } = await boot()
    const d = branches.find((b) => b.key.includes('dondurma'))!
    const { pack, narrative } = await loaders.loadWeeklyReport([d], PREV_WEEK, NOW)
    const rel = pack.weather.relationships[0]!
    expect(['ok', 'insufficient_sample', 'no_context']).toContain(rel.state)
    if (rel.state === 'ok') {
      const weather = narrative.narrative.sections.find((s) => s.code === 'weather')!
      expect(weather.body).toContain('neden-sonuç iddiası değildir')
    }
    expect(JSON.stringify(narrative.narrative)).not.toMatch(/nedeniyle|yüzünden|çünkü|sebebiyle/i)
    expect(validateNarrative(narrative.narrative, pack).ok).toBe(true)
  })

  it('a week without any data says so instead of inventing a summary', async () => {
    const { loaders, branches } = await boot()
    const { pack, narrative } = await loaders.loadWeeklyReport(branches, '2026-01-05', NOW)
    expect(pack.completeness.overall).toBe('no_data')
    expect(narrative.narrative.headline).toContain('veri yok')
    expect(validateNarrative(narrative.narrative, pack).ok).toBe(true)
  })
})
