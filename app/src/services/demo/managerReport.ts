/**
 * Demo mirror of services/supabase/managerReport.ts: composes the SAME existing demo read models (analytics snapshots computed by the
 * real deterministic engine, inventory control) with the same permission guards as the SQL bundle. Zero network. Nothing here is
 * business data.
 */
import { canAnalytics, weekDates } from '../../domain/analytics'
import { canReviewControl } from '../../domain/inventory/control'
import { projectDailyEnvelope, type ManagerReportBranchInput, type ManagerReportInputs, type ReportInsight } from '../../domain/managerReport'
import { currentDemoUser } from '../../features/auth/demoSession'
import { addDaysIso } from '../../utils/dates'
import { demoAnalytics } from './analytics'
import { demoInventoryControl } from './inventoryControl'
import { demoState } from './state'

const DENIED = 'Bu işlem için yetkiniz yok.'
const noPermission = { state: 'unavailable', reason: 'no_permission' } as const

const toInsights = (list: Awaited<ReturnType<typeof demoAnalytics.listAnalyticsInsights>>): ReportInsight[] =>
  list.filter((i) => i.confidence !== 'hypothesis').map((i) => ({ code: i.code, title: i.title, confidence: i.confidence, isFinancial: i.isFinancial, origin: i.origin }))

export const demoManagerReport = {
  async getManagerReportInputs(branchIds: readonly string[], scope: 'daily' | 'weekly', date: string): Promise<ManagerReportInputs> {
    const actor = currentDemoUser()
    if (!actor || !canAnalytics(actor.roles, 'analytics.read')) throw new Error(DENIED)
    const orgWide = actor.roles.includes('owner') || actor.roles.includes('manager')
    const state = demoState()
    const out: ManagerReportInputs = {}
    for (const branchId of branchIds) {
      out[branchId] = null
      if ((!orgWide && !actor.branchIds.includes(branchId)) || !state.branches.some((b) => b.id === branchId)) continue
      const from = date
      const to = scope === 'weekly' ? addDaysIso(date, 6) : date
      const mayReview = canReviewControl(actor.roles)
      const has = (allowed: readonly string[]) => actor.roles.some((r) => allowed.includes(r))
      const entry: ManagerReportBranchInput = {
        branchId,
        // mirror of the SQL access flags (permission + branch scope): analytics.read alone grants none of them
        access: {
          financial: canAnalytics(actor.roles, 'analytics.financial.read'),
          reports: has(['owner', 'manager', 'branch_manager', 'viewer']),
          stock: has(['owner', 'manager', 'branch_manager', 'cashier', 'employee']),
          weather: has(['owner', 'manager', 'branch_manager']),
        },
        waste: mayReview ? { state: 'available', data: await demoInventoryControl.getWasteReport(branchId, from, to) } : noPermission,
        counts: mayReview ? { state: 'available', data: await demoInventoryControl.getBranchCountOverview(branchId) } : noPermission,
      }
      if (scope === 'daily') {
        const envelope = await demoAnalytics.getDailyAnalytics(branchId, date)
        entry.daily = { envelope, insights: envelope.snapshotId ? toInsights(await demoAnalytics.listAnalyticsInsights(branchId, 'daily', envelope.snapshotId)) : [] }
      } else {
        const envelope = await demoAnalytics.getWeeklyAnalytics(branchId, date)
        entry.weekly = { envelope, insights: envelope.snapshotId ? toInsights(await demoAnalytics.listAnalyticsInsights(branchId, 'weekly', envelope.snapshotId)) : [] }
        entry.days = []
        for (const d of weekDates(date)) entry.days.push(projectDailyEnvelope(d, await demoAnalytics.getDailyAnalytics(branchId, d)))
      }
      out[branchId] = entry
    }
    return out
  },
}
