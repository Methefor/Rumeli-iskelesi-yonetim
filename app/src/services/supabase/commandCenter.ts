import { supabase } from './client'
import { friendlyErrorMessage } from '../errors'
import type { BranchSignals } from '../../domain/commandCenter'
import type { BranchRawData, DashboardPeriod } from '../../domain/dashboard'
import { deriveInventoryAlerts } from '../../domain/inventory'

/**
 * Command Center data access: BATCH read models only, so the initial load costs a CONSTANT number of backend requests regardless of how
 * many branches the user can see (2: dashboard inputs + signals). The per-branch fetchers are intentionally NOT used here
 * (an N+1 pattern would be ~10 requests per branch).
 *
 *   get_dashboard_inputs      RAW facts for the canonical TypeScript dashboard model (domain/dashboard stays the only X/Z engine)
 *   get_command_center_signals  the bundled inventory-control / procurement / weather / analytics read models per branch
 *
 * Nothing is computed here and no weather provider is called from the client.
 */

interface InputsEntry {
  branchId: string
  shifts: Array<{ id: string; businessDate: string; status: string }>
  reports: Array<{
    shiftId: string
    businessDate: string
    submittedAt: string
    reportType: 'X' | 'Z'
    grossRevenue: number | string
    status: string
    reconciliationStatus: 'OK' | 'WARNING' | 'ERROR'
    origin: 'native' | 'legacy_import'
  }>
  openReconciliationCount: number
  items: Array<{ id: string; branch_id: string; code: string; name: string; unit: string; allows_decimal: boolean; sales_category_id: string | null; is_active: boolean }>
  balances: Array<{ inventory_item_id: string; branch_id: string; theoretical_quantity: number | string; last_movement_at: string | null }>
  lastCounts: Array<{ inventory_item_id: string; inventory_count_id: string; counted_at: string; physical_quantity: number | string; theoretical_quantity: number | string; variance_quantity: number | string }>
  wasteEntryCount: number
  countsSubmitted: number
  grossProfit: {
    lines: Array<{ inventory_item_id: string; code: string; name: string; unit: string; sold_quantity: number | string; product_revenue: number | string; cogs: number | string; costed_quantity: number | string; uncosted_quantity: number | string }>
    unmapped_category_revenue: number | string
  } | null
}

/** Mapper from the batch payload to the SAME BranchRawData shape the per-branch fetcher produced (alerts are still derived by the inventory domain). */
export function mapDashboardInputs(entry: InputsEntry, branch: { key: string; name: string }): BranchRawData {
  const items = entry.items.map((i) => ({
    id: i.id,
    branchId: i.branch_id,
    code: i.code,
    name: i.name,
    unit: i.unit,
    allowsDecimal: i.allows_decimal,
    salesCategoryId: i.sales_category_id,
    isActive: i.is_active,
  }))
  const tracked = items.length > 0
  const alerts = tracked
    ? deriveInventoryAlerts(
        items,
        entry.balances.map((b) => ({ inventoryItemId: b.inventory_item_id, branchId: b.branch_id, theoreticalQuantity: Number(b.theoretical_quantity), lastMovementAt: b.last_movement_at })),
        entry.lastCounts.map((c) => ({
          inventoryItemId: c.inventory_item_id,
          inventoryCountId: c.inventory_count_id,
          countedAt: c.counted_at,
          physicalQuantity: Number(c.physical_quantity),
          theoreticalQuantity: Number(c.theoretical_quantity),
          varianceQuantity: Number(c.variance_quantity),
        })),
      ).length
    : 0
  return {
    branchId: entry.branchId,
    branchKey: branch.key,
    branchName: branch.name,
    period: {
      reports: entry.reports.map((r) => ({
        shiftId: r.shiftId,
        businessDate: r.businessDate,
        submittedAt: r.submittedAt,
        reportType: r.reportType,
        grossRevenue: Number(r.grossRevenue),
        status: r.status,
        reconciliationStatus: r.reconciliationStatus,
        origin: r.origin,
      })),
      shifts: entry.shifts,
    },
    openReconciliationCount: Number(entry.openReconciliationCount),
    inventoryTracked: tracked,
    inventoryAlertCount: alerts,
    wasteEntryCountInPeriod: tracked ? Number(entry.wasteEntryCount) : 0,
    countsSubmittedInPeriod: tracked ? Number(entry.countsSubmitted) : 0,
    grossProfit:
      tracked && entry.grossProfit
        ? {
            lines: entry.grossProfit.lines.map((l) => ({
              inventoryItemId: l.inventory_item_id,
              code: l.code,
              name: l.name,
              unit: l.unit,
              soldQuantity: Number(l.sold_quantity),
              productRevenue: Number(l.product_revenue),
              cogs: Number(l.cogs),
              costedQuantity: Number(l.costed_quantity),
              uncostedQuantity: Number(l.uncosted_quantity),
            })),
            unmappedCategoryRevenue: Number(entry.grossProfit.unmapped_category_revenue),
          }
        : null,
  }
}

/** ONE request for all branches. A branch the caller cannot see is absent from the answer and therefore absent from the result. */
export async function fetchDashboardRaws(
  branches: ReadonlyArray<{ id: string; key: string; name: string }>,
  period: DashboardPeriod,
): Promise<BranchRawData[]> {
  if (branches.length === 0) return []
  const { data, error } = await supabase.rpc('get_dashboard_inputs', {
    p_branch_ids: branches.map((b) => b.id),
    p_from_date: period.fromDate,
    p_to_date: period.toDateInclusive,
    p_from_instant: period.fromInstant,
    p_to_instant: period.toInstantExclusive,
  })
  if (error) throw new Error(friendlyErrorMessage(error.message, error.code))
  const entries = data as InputsEntry[]
  return branches.flatMap((b) => {
    const entry = entries.find((e) => e.branchId === b.id)
    return entry ? [mapDashboardInputs(entry, b)] : []
  })
}

/** ONE request for all branches; a failing branch is `null` (listed as an unavailable source, never as "all clear"). */
export async function getCommandCenterSignals(branchIds: readonly string[]): Promise<Record<string, BranchSignals | null>> {
  if (branchIds.length === 0) return {}
  const { data, error } = await supabase.rpc('get_command_center_signals', { p_branch_ids: [...branchIds] })
  if (error) throw new Error(friendlyErrorMessage(error.message, error.code))
  const out: Record<string, BranchSignals | null> = {}
  for (const id of branchIds) out[id] = null
  for (const row of data as Array<{ branchId: string; signals?: BranchSignals; error?: string }>) out[row.branchId] = row.signals ?? null
  return out
}

/** Single-branch read model (kept for detail screens); the Command Center itself uses the batch call above. */
export async function getBranchOperationsSignals(branchId: string): Promise<BranchSignals> {
  const { data, error } = await supabase.rpc('get_branch_operations_signals', { p_branch_id: branchId })
  if (error) throw new Error(friendlyErrorMessage(error.message, error.code))
  return data as BranchSignals
}
