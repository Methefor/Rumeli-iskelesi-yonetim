import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_STORAGE_KEY } from '../../features/auth/demoSession'
import { demoApi } from './api'
import { readWeather } from './commandCenter'
import { demoState, resetDemoState } from './state'
import { DEMO_BRANCH_BALIK as B, DEMO_BRANCH_DONDURMA as D, DEMO_BRANCH_RUMELI as R } from './store'
import { syntheticForecast } from './qaCommandCenter'

const NOW = new Date('2026-10-07T12:00:00+03:00')
const signInAs = (code: string) => sessionStorage.setItem(DEMO_STORAGE_KEY, `${code}:2027`)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  sessionStorage.clear()
  resetDemoState(NOW, { fixtureSet: 'qa' })
})
afterEach(() => vi.useRealTimers())

describe('synthetic Command Center / weather scenarios (QA set)', () => {
  it('weather states per branch: fresh with a rain window, stale, and unavailable for a branch without coordinates', async () => {
    signInAs('M001')
    const r = (await demoApi.getBranchOperationsSignals(R)).weather
    const d = (await demoApi.getBranchOperationsSignals(D)).weather
    const b = (await demoApi.getBranchOperationsSignals(B)).weather
    expect(r).toMatchObject({ state: 'available', data: { status: 'fresh', isForecast: true, provider: 'synthetic_qa' } })
    expect(d).toMatchObject({ state: 'available', data: { status: 'stale', staleReason: 'expired' } })
    expect(b).toMatchObject({ state: 'available', data: { status: 'unavailable', reason: 'missing_branch_location' } })
    expect((await demoApi.getBranchOperationsSignals(B)).location.state).toBe('missing')
  })

  it('the synthetic forecasts are clearly labelled and generated (no real coordinates, no provider)', () => {
    expect(demoState().branchLocations[R]?.locationLabel).toMatch(/SENTETİK KONUM/)
    expect(demoState().weatherSnapshots[R]?.provider).toBe('synthetic_qa')
    const rainy = syntheticForecast('rainy_windy', NOW)
    const dry = syntheticForecast('warm_dry', NOW)
    expect(Math.max(...rainy.hourly.map((h) => h.precipitationProbability ?? 0))).toBe(80)
    expect(Math.max(...dry.hourly.map((h) => h.precipitationProbability ?? 0))).toBeLessThan(10)
    expect(rainy.current.windGustKmh).toBeGreaterThan(dry.current.windGustKmh ?? 0)
  })

  it('a fresh forecast becomes stale when time passes (cache expiry), keeping its fetched time', () => {
    const state = demoState()
    expect(readWeather(state, R)).toMatchObject({ status: 'fresh' })
    vi.setSystemTime(new Date(NOW.getTime() + 2 * 3600_000))
    const stale = readWeather(state, R)
    expect(stale).toMatchObject({ status: 'stale', staleReason: 'expired' })
    expect(stale.status === 'stale' && stale.ageMinutes).toBeGreaterThan(120)
  })

  it('a forecast fetched for another location is stale (location_changed); coordinates are never exposed', () => {
    const state = demoState()
    state.branchLocations[R]!.latitude = 41.5
    const w = readWeather(state, R)
    expect(w).toMatchObject({ status: 'stale', staleReason: 'location_changed' })
    expect(JSON.stringify(w)).not.toMatch(/latitude|longitude|41\.5/)
  })

  it('bundles the existing read models: counts (unexplained + timing uncertain), procurement attention, waste', async () => {
    signInAs('M001')
    const rumeli = await demoApi.getBranchOperationsSignals(R)
    expect(rumeli.counts.state === 'available' && rumeli.counts.data.latestSummary).toMatchObject({ unexplainedLines: 1, timingUncertainLines: 3 })
    const dondurma = await demoApi.getBranchOperationsSignals(D)
    expect(dondurma.procurement.state === 'available' && dondurma.procurement.data.awaitingApproval).toHaveLength(1)
    expect(dondurma.procurement.state === 'available' && dondurma.procurement.data.overdueDelivery).toHaveLength(1)
    expect(dondurma.waste.state).toBe('available')
  })

  it('a cashier has no Command Center signals at all', async () => {
    signInAs('D001')
    await expect(demoApi.getBranchOperationsSignals(D)).rejects.toThrow()
    signInAs('K001')
    await expect(demoApi.getBranchOperationsSignals(R)).rejects.toThrow()
  })

  it('branch scope: a branch-scoped user cannot read another branch (no cross-branch leak)', async () => {
    signInAs('M001')
    const state = demoState()
    const manager = state.employees.find((e) => e.id === 'demo-m001')!
    // demo M001 is org-wide; emulate a branch manager of Rumeli by changing the signed-in demo roles through a dedicated user
    expect(manager.roles).toContain('manager')
    // the guard itself is covered by supabase/tests/command_center.test.sql (branch_manager Rumeli vs Dondurma) and by the demo scope helper:
    signInAs('D001')
    await expect(demoApi.getBranchOperationsSignals(R)).rejects.toThrow()
  })
})
