/**
 * Demo mirror of services/supabase/commandCenter.ts: composes the SAME existing demo read models (inventory control, procurement,
 * analytics) plus the synthetic weather cache, with the same per-part permission guards and degradation as the SQL function.
 * Zero network. Nothing here is business data.
 */
import { canReviewControl } from '../../domain/inventory/control'
import { canProcurement } from '../../domain/procurement'
import { canAnalytics, weekStartOf } from '../../domain/analytics'
import type { AnalyticsSignal, BranchSignals, SignalPart } from '../../domain/commandCenter'
import type { BranchWeather } from '../../domain/weather'
import { currentDemoUser } from '../../features/auth/demoSession'
import type { DemoUser } from '../../features/auth/demoUsers'
import type { BranchRawData, DashboardPeriod } from '../../domain/dashboard'
import { addDaysIso, istanbulDate } from '../../utils/dates'
import { fetchBranchDashboardRaw } from './dashboard'
import { demoAnalytics } from './analytics'
import { demoInventoryControl } from './inventoryControl'
import { demoProcurement } from './procurement'
import { demoState } from './state'
import type { DemoState } from './store'

const DENIED = 'Bu işlem için yetkiniz yok.'
const noPermission = { state: 'unavailable', reason: 'no_permission' } as const

const orgWide = (u: DemoUser) => u.roles.includes('owner') || u.roles.includes('manager')
const inScope = (u: DemoUser, branchId: string) => orgWide(u) || u.branchIds.includes(branchId)
const canWeather = (roles: readonly string[]) => roles.some((r) => ['owner', 'manager', 'branch_manager'].includes(r))

/** Mirror of get_branch_weather(): fresh / stale (expired or location changed) / unavailable, never a fake zero. */
export function readWeather(state: DemoState, branchId: string): BranchWeather {
  const timezone = state.branchLocations[branchId]?.timezone ?? 'Europe/Istanbul'
  const loc = state.branchLocations[branchId]
  if (!loc || loc.latitude === null || loc.longitude === null) return { status: 'unavailable', reason: 'missing_branch_location', timezone }
  const snap = state.weatherSnapshots[branchId]
  if (!snap) return { status: 'unavailable', reason: 'no_forecast_loaded', timezone, location: { label: loc.locationLabel } }
  const now = state.now()
  const staleReason = Math.abs(snap.latitude - loc.latitude) > 0.001 || Math.abs(snap.longitude - loc.longitude) > 0.001 ? 'location_changed' : now.getTime() > Date.parse(snap.validUntil) ? 'expired' : null
  return {
    status: staleReason ? 'stale' : 'fresh',
    staleReason,
    isForecast: true,
    provider: snap.provider,
    timezone,
    fetchedAt: snap.fetchedAt,
    generatedAt: snap.generatedAt,
    validUntil: snap.validUntil,
    ageMinutes: Math.floor((now.getTime() - Date.parse(snap.fetchedAt)) / 60000),
    location: { label: loc.locationLabel },
    current: snap.payload.current,
    hourly: snap.payload.hourly.filter((h) => Date.parse(h.time) >= now.getTime() - 3600_000 && Date.parse(h.time) < now.getTime() + 48 * 3600_000),
    daily: snap.payload.daily,
  }
}

async function part<T>(allowed: boolean, load: () => Promise<T>): Promise<SignalPart<T>> {
  if (!allowed) return noPermission
  return { state: 'available', data: await load() }
}

export const demoCommandCenter = {
  /** Demo mirror of the batch dashboard-input read model (the demo store is in memory: no requests are involved). */
  async fetchDashboardRaws(branches: ReadonlyArray<{ id: string; key: string; name: string }>, period: DashboardPeriod): Promise<BranchRawData[]> {
    return Promise.all(branches.map((b) => fetchBranchDashboardRaw(b.id, b.key, b.name, period)))
  },

  /** Demo mirror of get_command_center_signals: a branch that cannot be read is `null`. */
  async getCommandCenterSignals(branchIds: readonly string[]): Promise<Record<string, BranchSignals | null>> {
    const out: Record<string, BranchSignals | null> = {}
    for (const id of branchIds) out[id] = await demoCommandCenter.getBranchOperationsSignals(id).catch(() => null)
    return out
  },

  async getBranchOperationsSignals(branchId: string): Promise<BranchSignals> {
    const state = demoState()
    const actor = currentDemoUser()
    const branch = state.branches.find((b) => b.id === branchId)
    const scoped = actor !== null && inScope(actor, branchId)
    const mayReview = scoped && canReviewControl(actor.roles)
    const mayProcure = scoped && canProcurement(actor.roles, 'procurement.order.read')
    const mayWeather = scoped && canWeather(actor.roles)
    const mayAnalytics = scoped && canAnalytics(actor.roles, 'analytics.read')
    if (!actor || !branch || !(mayReview || mayProcure || mayWeather || mayAnalytics)) throw new Error(DENIED)

    const today = istanbulDate(state.now())
    const loc = state.branchLocations[branchId]

    const analytics = await (async (): Promise<SignalPart<AnalyticsSignal>> => {
      if (!mayAnalytics) return noPermission
      const date = addDaysIso(today, -1)
      const weekStart = weekStartOf(today)
      const [dailyEnv, weeklyEnv] = await Promise.all([demoAnalytics.getDailyAnalytics(branchId, date), demoAnalytics.getWeeklyAnalytics(branchId, weekStart)])
      const toInsights = (list: Awaited<ReturnType<typeof demoAnalytics.listAnalyticsInsights>>) =>
        list.map((i) => ({ code: i.code, title: i.title, confidence: i.confidence, isFinancial: i.isFinancial, origin: i.origin }))
      const daily = dailyEnv.snapshotId && dailyEnv.payload
        ? { businessDate: date, version: dailyEnv.version ?? 1, generatedAt: dailyEnv.generatedAt ?? '', completeness: dailyEnv.payload.completeness?.overall ?? null, insights: toInsights(await demoAnalytics.listAnalyticsInsights(branchId, 'daily', dailyEnv.snapshotId)) }
        : null
      const weekly = weeklyEnv.snapshotId && weeklyEnv.payload
        ? { weekStart, version: weeklyEnv.version ?? 1, generatedAt: weeklyEnv.generatedAt ?? '', weekComplete: weeklyEnv.weekComplete ?? false, insights: toInsights(await demoAnalytics.listAnalyticsInsights(branchId, 'weekly', weeklyEnv.snapshotId)) }
        : null
      if (!daily && !weekly) return { state: 'unavailable', reason: 'no_snapshot' }
      return { state: 'available', data: { daily, weekly } }
    })()

    return {
      branchId,
      businessDate: today,
      timezone: loc?.timezone ?? 'Europe/Istanbul',
      location: { state: loc && loc.latitude !== null && loc.longitude !== null ? 'set' : 'missing' },
      counts: await part(mayReview, () => demoInventoryControl.getBranchCountOverview(branchId)),
      waste: await part(mayReview, () => demoInventoryControl.getWasteReport(branchId, today, today)),
      procurement: await part(mayProcure, () => demoProcurement.getProcurementAttention(branchId)),
      weather: await part(mayWeather, async () => readWeather(state, branchId)),
      analytics,
    }
  },
}
