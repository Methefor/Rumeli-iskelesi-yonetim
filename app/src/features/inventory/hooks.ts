import { useLocation } from 'react-router-dom'
import {
  canInventory,
  deriveInventoryAlerts,
  type InventoryPermission,
} from '../../domain/inventory'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../hooks/useAuth'
import { useSelectedBranch } from '../../hooks/useSelectedBranch'
import { addDaysIso, istanbulDate } from '../../utils/dates'
import {
  listBranchShifts,
  listInventoryItems,
  listLastCounts,
  listMyShiftAssignments,
  listStockBalances,
  type InventoryItem,
  type LastCount,
  type ShiftSummary,
  type StockBalance,
} from '../../services/data'

/** Absolute base path of the inventory routes for the current layout (manager vs employee). */
export function useInventoryBase(): string {
  const { pathname } = useLocation()
  return pathname.startsWith('/app/employee')
    ? '/app/employee/inventory'
    : '/app/manager/inventory'
}

/** Who is acting and where — plus a UI-visibility permission check (the server re-checks everything). */
export function useInventoryContext() {
  const { roles } = useAuth()
  const { selectedBranchId, selectedBranch } = useSelectedBranch()
  return {
    branchId: selectedBranchId,
    branchName: selectedBranch?.name ?? '',
    roles,
    can: (permission: InventoryPermission) => canInventory(roles, permission),
  }
}

export interface BranchInventory {
  items: InventoryItem[]
  balances: StockBalance[]
  lastCounts: LastCount[]
  alerts: ReturnType<typeof deriveInventoryAlerts>
}

/** Items + theoretical balances + last counts + derived alerts for the selected branch. */
export function useBranchInventory() {
  const { branchId } = useInventoryContext()
  return useAsync<BranchInventory>(
    branchId ? `inventory:${branchId}` : null,
    async () => {
      if (!branchId) return { items: [], balances: [], lastCounts: [], alerts: [] }
      const [items, balances] = await Promise.all([
        listInventoryItems(branchId),
        listStockBalances(branchId),
      ])
      const lastCounts = await listLastCounts(items.map((i) => i.id))
      const alerts = deriveInventoryAlerts(items, balances, lastCounts)
      return { items, balances, lastCounts, alerts }
    },
  )
}

/**
 * Shifts an inventory action may be attributed to: yesterday's and today's
 * (an evening shift runs past midnight) non-cancelled shifts in the selected
 * branch. Employees see only shifts they are assigned to; roles with
 * inventory.adjust see the branch's shifts. The server re-validates.
 */
export function useRecentShifts() {
  const { user } = useAuth()
  const { branchId, can } = useInventoryContext()
  const today = istanbulDate()
  const yesterday = addDaysIso(today, -1)
  const privileged = can('inventory.adjust')

  return useAsync<ShiftSummary[]>(
    user && branchId ? `recent-shifts:${branchId}:${today}:${privileged}` : null,
    async () => {
      if (!user || !branchId) return []
      const inWindow = (s: ShiftSummary) =>
        (s.businessDate === today || s.businessDate === yesterday) &&
        s.status !== 'cancelled'
      if (privileged) return (await listBranchShifts(branchId)).filter(inWindow)
      const mine = await listMyShiftAssignments(user.id)
      return mine
        .filter(
          (a) =>
            a.shift.branchId === branchId &&
            a.status !== 'cancelled' &&
            inWindow(a.shift),
        )
        .map((a) => a.shift)
    },
  )
}

export function shiftOptionLabel(shift: ShiftSummary, today: string): string {
  return `${shift.businessDate === today ? 'Bugün' : 'Dün'} — ${shift.definition.name}`
}
