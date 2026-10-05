/**
 * Demo mirror of `services/supabase/dashboard.ts`: same shapes, same period
 * inclusion rules (shift business_date in range; reports scoped to shifts
 * already known to be in range), zero network. Reads the in-memory demo
 * store only. Not imported by `services/demo/api.ts` at the top level for
 * the reverse functions it needs (item visibility, gross profit) — it
 * duplicates the tiny role check instead, the same pattern the rest of the
 * demo layer already uses to mirror RLS without importing the real one.
 */
import { canInventory, deriveInventoryAlerts } from '../../domain/inventory'
import type { BranchRawData, DashboardPeriod } from '../../domain/dashboard'
import { inReconciliationQueue } from '../../domain/reconciliation'
import { currentDemoUser } from '../../features/auth/demoSession'
import type { DemoUser } from '../../features/auth/demoUsers'
import { computeGrossProfit, theoreticalQuantity } from './store'
import { demoState } from './state'

function isOrgWide(roles: readonly string[]): boolean {
  return roles.includes('owner') || roles.includes('manager')
}
function canSee(actor: DemoUser, branchId: string): boolean {
  return isOrgWide(actor.roles) || actor.branchIds.includes(branchId)
}
function canReadInventory(actor: DemoUser | null, branchId: string): boolean {
  return actor !== null && canInventory(actor.roles, 'inventory.read') && canSee(actor, branchId)
}

function emptyRaw(branchId: string, branchKey: string, branchName: string): BranchRawData {
  return {
    branchId,
    branchKey,
    branchName,
    period: { reports: [], shifts: [] },
    openReconciliationCount: 0,
    inventoryTracked: false,
    inventoryAlertCount: 0,
    wasteEntryCountInPeriod: 0,
    countsSubmittedInPeriod: 0,
    grossProfit: null,
  }
}

export async function fetchBranchDashboardRaw(
  branchId: string,
  branchKey: string,
  branchName: string,
  period: DashboardPeriod,
): Promise<BranchRawData> {
  const state = demoState()
  const actor = currentDemoUser()
  if (!actor || !canSee(actor, branchId)) return emptyRaw(branchId, branchKey, branchName)

  const shifts = state.shifts.filter(
    (s) => s.branchId === branchId && s.businessDate >= period.fromDate && s.businessDate <= period.toDateInclusive,
  )
  const shiftIds = new Set(shifts.map((s) => s.id))
  const reports = state.reports.filter((r) => r.branchId === branchId && shiftIds.has(r.shiftId))

  const openReconciliationCount = state.reports.filter(
    (r) => r.branchId === branchId && inReconciliationQueue(r, 'active'),
  ).length

  const items = canReadInventory(actor, branchId) ? state.items.filter((i) => i.branchId === branchId) : []
  const inventoryTracked = items.length > 0

  let inventoryAlertCount = 0
  let wasteEntryCountInPeriod = 0
  let countsSubmittedInPeriod = 0
  let grossProfit: BranchRawData['grossProfit'] = null

  if (inventoryTracked) {
    const balances = items.map((item) => ({
      inventoryItemId: item.id,
      branchId,
      theoreticalQuantity: theoreticalQuantity(state, item.id),
      lastMovementAt: null,
    }))
    const lastCounts = state.counts
      .filter((c) => c.status === 'submitted')
      .flatMap((c) => c.lines.map((l) => ({ ...l, at: c.submittedAt })))
      .reduce<Map<string, { inventoryItemId: string; inventoryCountId: string; countedAt: string; physicalQuantity: number; theoreticalQuantity: number; varianceQuantity: number }>>(
        (map, line) => {
          const existing = map.get(line.inventoryItemId)
          if (!existing || line.at > existing.countedAt) {
            map.set(line.inventoryItemId, {
              inventoryItemId: line.inventoryItemId,
              inventoryCountId: '',
              countedAt: line.at,
              physicalQuantity: line.physicalQuantity,
              theoreticalQuantity: line.theoreticalQuantity,
              varianceQuantity: line.varianceQuantity,
            })
          }
          return map
        },
        new Map(),
      )
    inventoryAlertCount = deriveInventoryAlerts(items, balances, [...lastCounts.values()]).length

    wasteEntryCountInPeriod = state.movements.filter(
      (m) =>
        m.branchId === branchId &&
        m.type === 'WASTE' &&
        m.occurredAt >= period.fromInstant &&
        m.occurredAt < period.toInstantExclusive,
    ).length

    countsSubmittedInPeriod = state.counts.filter(
      (c) =>
        c.branchId === branchId &&
        c.status === 'submitted' &&
        c.businessDate >= period.fromDate &&
        c.businessDate <= period.toDateInclusive,
    ).length

    const gp = computeGrossProfit(state, branchId, new Date(period.fromInstant), new Date(period.toInstantExclusive))
    grossProfit = { lines: gp.lines, unmappedCategoryRevenue: gp.unmappedCategoryRevenue }
  }

  return {
    branchId,
    branchKey,
    branchName,
    period: {
      reports: reports.map((r) => ({
        shiftId: r.shiftId,
        reportType: r.reportType,
        grossRevenue: r.grossRevenue,
        status: r.status,
        reconciliationStatus: r.reconciliationStatus,
        origin: r.origin ?? 'native',
      })),
      shifts: shifts.map((s) => ({ id: s.id, businessDate: s.businessDate, status: s.status })),
    },
    openReconciliationCount,
    inventoryTracked,
    inventoryAlertCount,
    wasteEntryCountInPeriod,
    countsSubmittedInPeriod,
    grossProfit,
  }
}
