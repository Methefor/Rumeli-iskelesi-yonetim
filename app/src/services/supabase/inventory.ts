import { supabase } from './client'
import { friendlyErrorMessage, friendlyFromSupabaseError } from '../errors'
import type { GrossProfitInput } from '../../domain/inventory/grossProfit'
import type { MovementType } from '../../domain/inventory/types'

/**
 * Every inventory read/write goes through this module — no `supabase.from()`
 * for inventory exists in any component. Reads THROW a Turkish-safe Error (so
 * the calling hook can render an error state); mutations return `{ error }`
 * like sales.ts/shifts.ts. Authorization is enforced by RLS + the audited
 * RPCs in supabase/migrations 012-014; nothing here decides who may do what.
 *
 * inventory_movements is queried with an EXPLICIT column list on purpose:
 * `unit_cost_snapshot` is excluded from the client SELECT grant (013), so a
 * `select *` would be rejected.
 */

export interface InventoryItem {
  id: string
  branchId: string
  code: string
  name: string
  unit: string
  allowsDecimal: boolean
  salesCategoryId: string | null
  isActive: boolean
}

export interface StockBalance {
  inventoryItemId: string
  branchId: string
  theoreticalQuantity: number
  lastMovementAt: string | null
}

export interface InventoryMovementRow {
  id: string
  branchId: string
  inventoryItemId: string
  type: MovementType
  quantity: number
  stockDelta: number
  shiftId: string | null
  salesReportId: string | null
  inventoryCountId: string | null
  reversesMovementId: string | null
  reasonCode: string | null
  reason: string | null
  reference: string | null
  occurredAt: string
}

export interface LastCount {
  inventoryItemId: string
  inventoryCountId: string
  countedAt: string
  physicalQuantity: number
  theoreticalQuantity: number
  varianceQuantity: number
}

export interface InventoryCountLine {
  inventoryItemId: string
  physicalQuantity: number
  theoreticalQuantity: number
  varianceQuantity: number
}

export interface InventoryCountSummary {
  id: string
  branchId: string
  shiftId: string | null
  businessDate: string
  status: 'submitted' | 'voided'
  note: string | null
  submittedAt: string
  lines: InventoryCountLine[]
}

export interface ItemCostRow {
  id: string
  inventoryItemId: string
  unitCost: number
  effectiveFrom: string
  reason: string | null
}

export interface GrossProfitResult {
  lines: GrossProfitInput[]
  unmappedCategoryRevenue: number
}

export interface QuantityLine {
  inventoryItemId: string
  quantity: number
  /** Receipts only; honoured server-side only for callers who may manage cost. */
  unitCost?: number | null
}

export type WasteReasonCode =
  'expired' | 'damaged' | 'spilled' | 'quality' | 'sample' | 'other'

function failRead(error: { message?: string; code?: string }): never {
  throw new Error(friendlyErrorMessage(error.message, error.code))
}

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------

interface ItemRow {
  id: string
  branch_id: string
  code: string
  name: string
  unit: string
  allows_decimal: boolean
  sales_category_id: string | null
  is_active: boolean
}

export async function listInventoryItems(branchId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select(
      'id, branch_id, code, name, unit, allows_decimal, sales_category_id, is_active',
    )
    .eq('branch_id', branchId)
    .order('name')
    .returns<ItemRow[]>()
  if (error) failRead(error)
  return (data ?? []).map((r) => ({
    id: r.id,
    branchId: r.branch_id,
    code: r.code,
    name: r.name,
    unit: r.unit,
    allowsDecimal: r.allows_decimal,
    salesCategoryId: r.sales_category_id,
    isActive: r.is_active,
  }))
}

export async function listStockBalances(branchId: string): Promise<StockBalance[]> {
  const { data, error } = await supabase
    .from('inventory_stock_balances')
    .select('inventory_item_id, branch_id, theoretical_quantity, last_movement_at')
    .eq('branch_id', branchId)
    .returns<
      Array<{
        inventory_item_id: string
        branch_id: string
        theoretical_quantity: number
        last_movement_at: string | null
      }>
    >()
  if (error) failRead(error)
  return (data ?? []).map((r) => ({
    inventoryItemId: r.inventory_item_id,
    branchId: r.branch_id,
    theoreticalQuantity: Number(r.theoretical_quantity),
    lastMovementAt: r.last_movement_at,
  }))
}

interface MovementRow {
  id: string
  branch_id: string
  inventory_item_id: string
  movement_type: MovementType
  quantity: number
  stock_delta: number
  shift_id: string | null
  sales_report_id: string | null
  inventory_count_id: string | null
  reverses_movement_id: string | null
  reason_code: string | null
  reason: string | null
  reference: string | null
  occurred_at: string
}

const MOVEMENT_COLUMNS =
  'id, branch_id, inventory_item_id, movement_type, quantity, stock_delta, shift_id, sales_report_id, inventory_count_id, reverses_movement_id, reason_code, reason, reference, occurred_at'

export async function listInventoryMovements(
  branchId: string,
  limit = 200,
): Promise<InventoryMovementRow[]> {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select(MOVEMENT_COLUMNS)
    .eq('branch_id', branchId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
    .returns<MovementRow[]>()
  if (error) failRead(error)
  return (data ?? []).map((r) => ({
    id: r.id,
    branchId: r.branch_id,
    inventoryItemId: r.inventory_item_id,
    type: r.movement_type,
    quantity: Number(r.quantity),
    stockDelta: Number(r.stock_delta),
    shiftId: r.shift_id,
    salesReportId: r.sales_report_id,
    inventoryCountId: r.inventory_count_id,
    reversesMovementId: r.reverses_movement_id,
    reasonCode: r.reason_code,
    reason: r.reason,
    reference: r.reference,
    occurredAt: r.occurred_at,
  }))
}

export async function listLastCounts(
  inventoryItemIds: readonly string[],
): Promise<LastCount[]> {
  // The view has no branch column; callers scope it by passing the branch's item ids.
  if (inventoryItemIds.length === 0) return []
  const { data, error } = await supabase
    .from('inventory_last_counts')
    .select(
      'inventory_item_id, inventory_count_id, counted_at, physical_quantity, theoretical_quantity, variance_quantity',
    )
    .in('inventory_item_id', [...inventoryItemIds])
    .returns<
      Array<{
        inventory_item_id: string
        inventory_count_id: string
        counted_at: string
        physical_quantity: number
        theoretical_quantity: number
        variance_quantity: number
      }>
    >()
  if (error) failRead(error)
  return (data ?? []).map((r) => ({
    inventoryItemId: r.inventory_item_id,
    inventoryCountId: r.inventory_count_id,
    countedAt: r.counted_at,
    physicalQuantity: Number(r.physical_quantity),
    theoreticalQuantity: Number(r.theoretical_quantity),
    varianceQuantity: Number(r.variance_quantity),
  }))
}

interface CountRow {
  id: string
  branch_id: string
  shift_id: string | null
  business_date: string
  status: 'submitted' | 'voided'
  note: string | null
  submitted_at: string
  inventory_count_items: Array<{
    inventory_item_id: string
    physical_quantity: number
    theoretical_quantity: number
    variance_quantity: number
  }>
}

export async function listInventoryCounts(
  branchId: string,
  limit = 20,
): Promise<InventoryCountSummary[]> {
  const { data, error } = await supabase
    .from('inventory_counts')
    .select(
      'id, branch_id, shift_id, business_date, status, note, submitted_at, inventory_count_items(inventory_item_id, physical_quantity, theoretical_quantity, variance_quantity)',
    )
    .eq('branch_id', branchId)
    .order('submitted_at', { ascending: false })
    .limit(limit)
    .returns<CountRow[]>()
  if (error) failRead(error)
  return (data ?? []).map((r) => ({
    id: r.id,
    branchId: r.branch_id,
    shiftId: r.shift_id,
    businessDate: r.business_date,
    status: r.status,
    note: r.note,
    submittedAt: r.submitted_at,
    lines: r.inventory_count_items.map((l) => ({
      inventoryItemId: l.inventory_item_id,
      physicalQuantity: Number(l.physical_quantity),
      theoreticalQuantity: Number(l.theoretical_quantity),
      varianceQuantity: Number(l.variance_quantity),
    })),
  }))
}

/** Cost history for a branch's items. RLS returns rows only to callers with inventory.cost.read. */
export async function listBranchItemCosts(branchId: string): Promise<ItemCostRow[]> {
  const { data, error } = await supabase
    .from('inventory_item_costs')
    .select(
      'id, inventory_item_id, unit_cost, effective_from, reason, inventory_items!inner(branch_id)',
    )
    .eq('inventory_items.branch_id', branchId)
    .order('effective_from', { ascending: false })
    .returns<
      Array<{
        id: string
        inventory_item_id: string
        unit_cost: number
        effective_from: string
        reason: string | null
      }>
    >()
  if (error) failRead(error)
  return (data ?? []).map((r) => ({
    id: r.id,
    inventoryItemId: r.inventory_item_id,
    unitCost: Number(r.unit_cost),
    effectiveFrom: r.effective_from,
    reason: r.reason,
  }))
}

export async function getInventoryGrossProfit(
  branchId: string,
  from: string,
  to: string,
): Promise<GrossProfitResult> {
  const { data, error } = await supabase.rpc('get_inventory_gross_profit', {
    p_branch_id: branchId,
    p_from: from,
    p_to: to,
  })
  if (error) failRead(error)
  const payload = data as {
    lines: Array<{
      inventory_item_id: string
      code: string
      name: string
      unit: string
      sold_quantity: number
      product_revenue: number
      cogs: number
      costed_quantity: number
      uncosted_quantity: number
    }>
    unmapped_category_revenue: number
  }
  return {
    lines: payload.lines.map((l) => ({
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
    unmappedCategoryRevenue: Number(payload.unmapped_category_revenue),
  }
}

// --------------------------------------------------------------------------
// Mutations (audited SECURITY DEFINER RPCs)
// --------------------------------------------------------------------------

export interface MutationResult {
  error: string | null
}

export async function upsertInventoryItem(input: {
  itemId?: string | null
  branchId: string
  code: string
  name: string
  unit: string
  allowsDecimal: boolean
  salesCategoryId?: string | null
  reason?: string | null
}): Promise<MutationResult & { itemId: string | null }> {
  const { data, error } = await supabase.rpc('upsert_inventory_item', {
    p_item_id: input.itemId ?? null,
    p_branch_id: input.branchId,
    p_code: input.code,
    p_name: input.name,
    p_unit: input.unit,
    p_allows_decimal: input.allowsDecimal,
    p_sales_category_id: input.salesCategoryId ?? null,
    p_reason: input.reason ?? null,
  })
  return {
    itemId: error ? null : (data as string),
    error: friendlyFromSupabaseError(error),
  }
}

export async function setInventoryItemActive(input: {
  itemId: string
  isActive: boolean
  reason?: string | null
}): Promise<MutationResult> {
  const { error } = await supabase.rpc('set_inventory_item_active', {
    p_item_id: input.itemId,
    p_is_active: input.isActive,
    p_reason: input.reason ?? null,
  })
  return { error: friendlyFromSupabaseError(error) }
}

export async function setInventoryItemCost(input: {
  itemId: string
  unitCost: number
  effectiveFrom?: string | null
  reason?: string | null
}): Promise<MutationResult> {
  const { error } = await supabase.rpc('set_inventory_item_cost', {
    p_item_id: input.itemId,
    p_unit_cost: input.unitCost,
    p_effective_from: input.effectiveFrom ?? null,
    p_reason: input.reason ?? null,
  })
  return { error: friendlyFromSupabaseError(error) }
}

export async function recordInventoryReceipt(input: {
  branchId: string
  lines: QuantityLine[]
  reference?: string | null
  note?: string | null
}): Promise<MutationResult> {
  const { error } = await supabase.rpc('record_inventory_receipt', {
    p_branch_id: input.branchId,
    p_lines: input.lines.map((l) => ({
      inventory_item_id: l.inventoryItemId,
      quantity: l.quantity,
      unit_cost: l.unitCost ?? null,
    })),
    p_reference: input.reference ?? null,
    p_note: input.note ?? null,
  })
  return { error: friendlyFromSupabaseError(error) }
}

export async function recordInventoryWaste(input: {
  branchId: string
  lines: QuantityLine[]
  reasonCode: WasteReasonCode
  note?: string | null
  shiftId?: string | null
}): Promise<MutationResult> {
  const { error } = await supabase.rpc('record_inventory_waste', {
    p_branch_id: input.branchId,
    p_lines: input.lines.map((l) => ({
      inventory_item_id: l.inventoryItemId,
      quantity: l.quantity,
    })),
    p_reason_code: input.reasonCode,
    p_note: input.note ?? null,
    p_shift_id: input.shiftId ?? null,
  })
  return { error: friendlyFromSupabaseError(error) }
}

export async function recordInventoryAdjustment(input: {
  itemId: string
  direction: 'IN' | 'OUT'
  quantity: number
  reason: string
  countId?: string | null
}): Promise<MutationResult> {
  const { error } = await supabase.rpc('record_inventory_adjustment', {
    p_item_id: input.itemId,
    p_direction: input.direction,
    p_quantity: input.quantity,
    p_reason: input.reason,
    p_count_id: input.countId ?? null,
  })
  return { error: friendlyFromSupabaseError(error) }
}

export async function reverseInventoryMovement(input: {
  movementId: string
  reason: string
}): Promise<MutationResult> {
  const { error } = await supabase.rpc('reverse_inventory_movement', {
    p_movement_id: input.movementId,
    p_reason: input.reason,
  })
  return { error: friendlyFromSupabaseError(error) }
}

export async function submitInventoryCount(input: {
  branchId: string
  shiftId?: string | null
  lines: Array<{ inventoryItemId: string; physicalQuantity: number }>
  note?: string | null
}): Promise<MutationResult & { countId: string | null }> {
  const { data, error } = await supabase.rpc('submit_inventory_count', {
    p_branch_id: input.branchId,
    p_shift_id: input.shiftId ?? null,
    p_items: input.lines.map((l) => ({
      inventory_item_id: l.inventoryItemId,
      physical_quantity: l.physicalQuantity,
    })),
    p_note: input.note ?? null,
  })
  return {
    countId: error ? null : (data as string),
    error: friendlyFromSupabaseError(error),
  }
}

export async function voidInventoryCount(input: {
  countId: string
  reason: string
}): Promise<MutationResult> {
  const { error } = await supabase.rpc('void_inventory_count', {
    p_count_id: input.countId,
    p_reason: input.reason,
  })
  return { error: friendlyFromSupabaseError(error) }
}
