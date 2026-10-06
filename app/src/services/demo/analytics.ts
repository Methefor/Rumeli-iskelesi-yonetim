/**
 * Demo mirror of services/supabase/analytics.ts. The metrics come from the SAME
 * deterministic engine (domain/analytics) over the in-memory synthetic store; the
 * demo reports carry no transaction counts, category piece counts or weather, so
 * those metrics are honestly reported as unavailable/missing - never invented.
 * Zero network. Nothing here is business data.
 */
import {
  ANALYTICS_PARAMS,
  buildDailyAnalytics,
  buildWeeklyAnalytics,
  canAnalytics,
  computeDay,
  deriveDailyInsights,
  deriveWeeklyInsights,
  redactAnalytics,
  weekDates,
  type AnalyticsInsight,
  type AnalyticsReportFact,
  type DailyAnalyticsPayload,
  type DayFacts,
  type SnapshotEnvelope,
  type WeeklyAnalyticsPayload,
} from '../../domain/analytics'
import { isMonday } from '../../domain/analytics'
import { currentDemoUser } from '../../features/auth/demoSession'
import { istanbulDate } from '../../utils/dates'
import { addDaysIso } from '../../utils/dates'
import { demoState } from './state'
import type { AnalyticsMutationResult, AnalyticsReportView } from '../supabase/analytics'

const DENIED = 'Bu analizi görüntüleme yetkiniz yok.'

interface SnapshotMeta {
  version: number
  generatedAt: string
  kind: 'scheduled' | 'manual'
  sourceLatestAt: string | null
}
const dailyMeta = new Map<string, SnapshotMeta>()
const weeklyMeta = new Map<string, SnapshotMeta>()

/** test seam: forget demo snapshot versions (the demo store itself is reset elsewhere). */
export function resetDemoAnalytics(): void {
  dailyMeta.clear()
  weeklyMeta.clear()
}

function actorFor(branchId: string, permission: Parameters<typeof canAnalytics>[1]) {
  const actor = currentDemoUser()
  if (!actor || !canAnalytics(actor.roles, permission)) throw new Error(DENIED)
  const orgWide = actor.roles.includes('owner') || actor.roles.includes('manager')
  if (!orgWide && !actor.branchIds.includes(branchId)) throw new Error(DENIED)
  return actor
}

function factsFor(branchId: string, date: string): DayFacts {
  const state = demoState()
  const shiftIds = new Set(state.shifts.filter((s) => s.branchId === branchId && s.businessDate === date).map((s) => s.id))
  const catById = new Map(state.categories.map((c) => [c.id, c]))
  const reports: AnalyticsReportFact[] = state.reports
    .filter((r) => r.branchId === branchId && shiftIds.has(r.shiftId))
    .map((r) => ({
      id: r.id,
      shiftId: r.shiftId,
      reportType: r.reportType,
      status: r.status,
      grossRevenue: r.grossRevenue,
      transactionCount: null,
      reconciliationStatus: r.reconciliationStatus,
      submittedAt: r.submittedAt,
      updatedAt: r.submittedAt,
      isLegacy: r.origin === 'legacy_import',
      lines: r.items.map((i) => ({
        categoryId: i.categoryId,
        categoryKey: catById.get(i.categoryId)?.key ?? i.categoryId,
        categoryName: catById.get(i.categoryId)?.name ?? i.categoryId,
        amount: i.amount,
        quantity: null,
        inventoryItemId: i.inventoryItemId,
        inventoryQuantity: i.inventoryQuantity,
      })),
    }))
  const activeIds = new Set(reports.filter((r) => r.status !== 'cancelled').map((r) => r.id))
  const costAgg = new Map<string, { q: number; qc: number }>()
  for (const m of state.movements) {
    if (m.type !== 'SALE' || m.unitCostSnapshot === null || !m.salesReportId || !activeIds.has(m.salesReportId)) continue
    const e = costAgg.get(m.inventoryItemId) ?? { q: 0, qc: 0 }
    e.q += m.quantity
    e.qc += m.quantity * m.unitCostSnapshot
    costAgg.set(m.inventoryItemId, e)
  }
  return {
    date,
    reports,
    products: state.items.filter((i) => i.branchId === branchId).map((i) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit })),
    unitCosts: Object.fromEntries([...costAgg.entries()].map(([id, e]) => [id, e.qc / e.q])),
  }
}

function dayCore(branchId: string, date: string) {
  return computeDay(factsFor(branchId, date))
}

function buildDaily(branchId: string, date: string): DailyAnalyticsPayload {
  return buildDailyAnalytics({
    branchId,
    date,
    dayFor: (d) => dayCore(branchId, d),
    context: { state: 'missing', isWeekend: [6, 7].includes(new Date(`${date}T00:00:00Z`).getUTCDay() || 7) },
  })
}

function buildWeekly(branchId: string, weekStart: string): WeeklyAnalyticsPayload {
  const days = [...weekDates(weekStart), ...weekDates(addDaysIso(weekStart, -7))]
  const latest = days.map((d) => dayCore(branchId, d).sourceLatestAt).filter((x): x is string => x !== null).sort().at(-1) ?? null
  return buildWeeklyAnalytics({
    branchId,
    weekStart,
    today: istanbulDate(),
    dayFor: (d) => dayCore(branchId, d),
    weatherDays: [],
    sourceLatestAt: latest,
  })
}

function envelope<P>(
  meta: Map<string, SnapshotMeta>,
  key: string,
  payload: P & { sourceLatestAt: string | null },
  financial: boolean,
  extra: Partial<SnapshotEnvelope<P>> = {},
): SnapshotEnvelope<P> {
  let m = meta.get(key)
  if (!m) {
    m = { version: 1, generatedAt: new Date().toISOString(), kind: 'scheduled', sourceLatestAt: payload.sourceLatestAt }
    meta.set(key, m)
  }
  const stale = (payload.sourceLatestAt ?? '') > (m.sourceLatestAt ?? '')
  const shown = (financial ? payload : redactAnalytics(payload as never)) as P
  return {
    state: stale ? 'stale' : 'current',
    snapshotId: `demo-${key}-v${m.version}`,
    version: m.version,
    generatedAt: m.generatedAt,
    generationKind: m.kind,
    sourceLatestAt: m.sourceLatestAt,
    payload: shown,
    ...extra,
  }
}

export const demoAnalytics = {
  async getDailyAnalytics(branchId: string, date: string): Promise<SnapshotEnvelope<DailyAnalyticsPayload>> {
    const actor = actorFor(branchId, 'analytics.read')
    const financial = canAnalytics(actor.roles, 'analytics.financial.read')
    return envelope(dailyMeta, `d:${branchId}:${date}`, buildDaily(branchId, date), financial)
  },

  async getWeeklyAnalytics(branchId: string, weekStart: string): Promise<SnapshotEnvelope<WeeklyAnalyticsPayload>> {
    const actor = actorFor(branchId, 'analytics.read')
    const financial = canAnalytics(actor.roles, 'analytics.financial.read')
    const payload = buildWeekly(branchId, weekStart)
    return envelope(weeklyMeta, `w:${branchId}:${weekStart}`, payload, financial, { weekComplete: payload.weekComplete })
  },

  async listAnalyticsInsights(branchId: string, scope: 'daily' | 'weekly', snapshotId: string | undefined): Promise<AnalyticsInsight[]> {
    const actor = actorFor(branchId, 'analytics.read')
    if (!snapshotId) return []
    const parts = snapshotId.split(':') // demo-d:<branch>:<date>-v1
    const date = parts[2]?.replace(/-v\d+$/, '')
    if (!date) return []
    const all =
      scope === 'daily'
        ? deriveDailyInsights(buildDaily(branchId, date))
        : deriveWeeklyInsights(buildWeekly(branchId, date))
    const financial = canAnalytics(actor.roles, 'analytics.financial.read')
    return all.filter((i) => financial || !i.isFinancial)
  },

  async regenerateDailyAnalytics(branchId: string, date: string, reason: string): Promise<AnalyticsMutationResult> {
    try {
      actorFor(branchId, 'analytics.regenerate')
    } catch {
      return { error: 'Bu işlem için yetkiniz yok.' }
    }
    if (reason.trim().length < 5) return { error: 'Gerekçe en az 5 karakter olmalıdır.' }
    const payload = buildDaily(branchId, date)
    const key = `d:${branchId}:${date}`
    const prev = dailyMeta.get(key)
    if (prev && prev.sourceLatestAt === payload.sourceLatestAt) return { error: null, version: prev.version, unchanged: true }
    const version = (prev?.version ?? 0) + 1
    dailyMeta.set(key, { version, generatedAt: new Date().toISOString(), kind: 'manual', sourceLatestAt: payload.sourceLatestAt })
    return { error: null, version, unchanged: false }
  },

  async regenerateWeeklyAnalytics(branchId: string, weekStart: string, reason: string): Promise<AnalyticsMutationResult> {
    try {
      actorFor(branchId, 'analytics.regenerate')
    } catch {
      return { error: 'Bu işlem için yetkiniz yok.' }
    }
    if (!isMonday(weekStart)) return { error: 'Hafta başlangıcı pazartesi olmalıdır.' }
    if (reason.trim().length < 5) return { error: 'Gerekçe en az 5 karakter olmalıdır.' }
    const payload = buildWeekly(branchId, weekStart)
    const key = `w:${branchId}:${weekStart}`
    const prev = weeklyMeta.get(key)
    if (prev && prev.sourceLatestAt === payload.sourceLatestAt) return { error: null, version: prev.version, unchanged: true }
    const version = (prev?.version ?? 0) + 1
    weeklyMeta.set(key, { version, generatedAt: new Date().toISOString(), kind: 'manual', sourceLatestAt: payload.sourceLatestAt })
    return { error: null, version, unchanged: false }
  },

  /** No model is configured in the synthetic demo: the report is simply absent and analytics are unaffected. */
  async getAnalyticsReport(branchId: string): Promise<AnalyticsReportView | null> {
    actorFor(branchId, 'analytics.ai.read')
    return null
  },
}

export { ANALYTICS_PARAMS as DEMO_ANALYTICS_PARAMS }
