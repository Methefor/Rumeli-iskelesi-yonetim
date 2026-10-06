import { supabase } from './client'
import { friendlyErrorMessage, friendlyFromSupabaseError } from '../errors'
import type {
  OrderSuggestion,
  ProcurementAttention,
  PurchaseOrderDetail,
  PurchaseOrderStatus,
  PurchaseOrderSummary,
  Supplier,
  SupplierType,
  SupplyParams,
  Weekdays,
} from '../../domain/procurement'

/**
 * Suppliers, item supply parameters, purchase orders, receiving, suggestions. Every rule and number comes from the
 * database (supabase/migrations/20261006000500/600); this module only fetches and maps. Authorization (permission +
 * branch scope, cost visibility) is enforced by RLS and the RPCs. Quantities are in the item stock unit.
 */

export interface ProcResult {
  error: string | null
}
export interface ProcIdResult extends ProcResult {
  id: string | null
}

function failRead(error: { message?: string; code?: string }): never {
  throw new Error(friendlyErrorMessage(error.message, error.code))
}

interface SupplierRow {
  id: string
  code: string
  name: string
  supplier_type: SupplierType
  contact_name: string | null
  phone: string | null
  email: string | null
  notes: string | null
  is_active: boolean
}

export async function listSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, code, name, supplier_type, contact_name, phone, email, notes, is_active')
    .order('name', { ascending: true })
  if (error) failRead(error)
  return (data as SupplierRow[]).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    supplierType: r.supplier_type,
    contactName: r.contact_name,
    phone: r.phone,
    email: r.email,
    notes: r.notes,
    isActive: r.is_active,
  }))
}

export interface UpsertSupplierInput {
  id: string | null
  code: string
  name: string
  supplierType: SupplierType
  contactName: string | null
  phone: string | null
  email: string | null
  notes: string | null
  reason: string
}

export async function upsertSupplier(input: UpsertSupplierInput): Promise<ProcIdResult> {
  const { data, error } = await supabase.rpc('upsert_supplier', {
    p_id: input.id,
    p_code: input.code,
    p_name: input.name,
    p_type: input.supplierType,
    p_contact: input.contactName,
    p_phone: input.phone,
    p_email: input.email,
    p_notes: input.notes,
    p_reason: input.reason,
  })
  const message = friendlyFromSupabaseError(error)
  return message ? { id: null, error: message } : { id: data as string, error: null }
}

export async function setSupplierActive(id: string, active: boolean, reason: string): Promise<ProcResult> {
  const { error } = await supabase.rpc('set_supplier_active', { p_id: id, p_active: active, p_reason: reason })
  return { error: friendlyFromSupabaseError(error) }
}

interface ParamsRow {
  id: string
  branch_id: string
  item_id: string
  supplier_id: string
  order_unit: string | null
  units_per_pack: number | string | null
  minimum_stock: number | string | null
  target_stock: number | string | null
  safety_stock: number | string | null
  lead_time_days: number | null
  allowed_order_weekdays: number[] | null
  order_cutoff_time: string | null
  delivery_weekdays: number[] | null
  minimum_order_quantity: number | string | null
  order_multiple: number | string | null
  is_active: boolean
  notes: string | null
}

const num = (v: number | string | null): number | null => (v === null ? null : Number(v))
const hhmm = (v: string | null): string | null => (v === null ? null : v.slice(0, 5))

export async function listSupplyParams(branchId: string): Promise<SupplyParams[]> {
  const { data, error } = await supabase
    .from('item_supply_params')
    .select('id, branch_id, item_id, supplier_id, order_unit, units_per_pack, minimum_stock, target_stock, safety_stock, lead_time_days, allowed_order_weekdays, order_cutoff_time, delivery_weekdays, minimum_order_quantity, order_multiple, is_active, notes')
    .eq('branch_id', branchId)
  if (error) failRead(error)
  return (data as ParamsRow[]).map((r) => ({
    id: r.id,
    branchId: r.branch_id,
    itemId: r.item_id,
    supplierId: r.supplier_id,
    orderUnit: r.order_unit,
    unitsPerPack: num(r.units_per_pack),
    minimumStock: num(r.minimum_stock),
    targetStock: num(r.target_stock),
    safetyStock: num(r.safety_stock),
    leadTimeDays: r.lead_time_days,
    allowedOrderWeekdays: r.allowed_order_weekdays,
    orderCutoffTime: hhmm(r.order_cutoff_time),
    deliveryWeekdays: r.delivery_weekdays,
    minimumOrderQuantity: num(r.minimum_order_quantity),
    orderMultiple: num(r.order_multiple),
    isActive: r.is_active,
    notes: r.notes,
  }))
}

export interface UpsertSupplyParamsInput {
  branchId: string
  itemId: string
  supplierId: string
  orderUnit: string | null
  unitsPerPack: number | null
  minimumStock: number | null
  targetStock: number | null
  safetyStock: number | null
  leadTimeDays: number | null
  allowedOrderWeekdays: Weekdays
  orderCutoffTime: string | null
  deliveryWeekdays: Weekdays
  minimumOrderQuantity: number | null
  orderMultiple: number | null
  isActive: boolean
  notes: string | null
  reason: string
}

export async function upsertSupplyParams(input: UpsertSupplyParamsInput): Promise<ProcResult> {
  const { error } = await supabase.rpc('upsert_item_supply_params', {
    p_branch_id: input.branchId,
    p_item_id: input.itemId,
    p_supplier_id: input.supplierId,
    p_params: {
      order_unit: input.orderUnit,
      units_per_pack: input.unitsPerPack,
      minimum_stock: input.minimumStock,
      target_stock: input.targetStock,
      safety_stock: input.safetyStock,
      lead_time_days: input.leadTimeDays,
      allowed_order_weekdays: input.allowedOrderWeekdays,
      order_cutoff_time: input.orderCutoffTime,
      delivery_weekdays: input.deliveryWeekdays,
      minimum_order_quantity: input.minimumOrderQuantity,
      order_multiple: input.orderMultiple,
      is_active: input.isActive,
      notes: input.notes,
    },
    p_reason: input.reason,
  })
  return { error: friendlyFromSupabaseError(error) }
}

export async function listPurchaseOrders(branchId: string, statuses?: PurchaseOrderStatus[]): Promise<PurchaseOrderSummary[]> {
  const { data, error } = await supabase.rpc('list_purchase_orders', { p_branch_id: branchId, p_statuses: statuses ?? null, p_limit: 100 })
  if (error) failRead(error)
  return data as PurchaseOrderSummary[]
}

export async function getPurchaseOrder(orderId: string): Promise<PurchaseOrderDetail> {
  const { data, error } = await supabase.rpc('get_purchase_order', { p_order_id: orderId })
  if (error) failRead(error)
  return data as PurchaseOrderDetail
}

export interface OrderLineInput {
  inventoryItemId: string
  quantity: number
  unitCostEstimateKurus?: number | null
  notes?: string | null
}

const lineJson = (lines: OrderLineInput[]) =>
  lines.map((l) => ({ inventory_item_id: l.inventoryItemId, quantity: l.quantity, unit_cost_estimate_kurus: l.unitCostEstimateKurus ?? null, notes: l.notes ?? null }))

export interface CreatePurchaseOrderInput {
  branchId: string
  supplierId: string
  orderedForDate: string | null
  expectedDeliveryDate: string | null
  notes: string | null
  lines: OrderLineInput[]
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<ProcIdResult> {
  const { data, error } = await supabase.rpc('create_purchase_order', {
    p_branch_id: input.branchId,
    p_supplier_id: input.supplierId,
    p_ordered_for: input.orderedForDate,
    p_expected_delivery: input.expectedDeliveryDate,
    p_notes: input.notes,
    p_lines: lineJson(input.lines),
  })
  const message = friendlyFromSupabaseError(error)
  return message ? { id: null, error: message } : { id: data as string, error: null }
}

export async function replacePurchaseOrderLines(orderId: string, lines: OrderLineInput[]): Promise<ProcResult> {
  const { error } = await supabase.rpc('replace_purchase_order_lines', { p_order_id: orderId, p_lines: lineJson(lines) })
  return { error: friendlyFromSupabaseError(error) }
}

export async function updatePurchaseOrderHeader(orderId: string, orderedForDate: string | null, expectedDeliveryDate: string | null, notes: string | null): Promise<ProcResult> {
  const { error } = await supabase.rpc('update_purchase_order_header', {
    p_order_id: orderId,
    p_ordered_for: orderedForDate,
    p_expected_delivery: expectedDeliveryDate,
    p_notes: notes,
  })
  return { error: friendlyFromSupabaseError(error) }
}

export async function transitionPurchaseOrder(orderId: string, to: PurchaseOrderStatus, reason: string | null): Promise<ProcResult> {
  const { error } = await supabase.rpc('transition_purchase_order', { p_order_id: orderId, p_to: to, p_reason: reason })
  return { error: friendlyFromSupabaseError(error) }
}

export interface ReceiveLineInput {
  lineId: string
  quantity: number
  /** TRY per stock unit; owner/manager only (server enforces inventory.cost.manage) */
  unitCost?: number | null
}

export async function receivePurchaseOrder(orderId: string, lines: ReceiveLineInput[], note: string | null): Promise<ProcResult & { status?: PurchaseOrderStatus }> {
  const { data, error } = await supabase.rpc('receive_purchase_order', {
    p_order_id: orderId,
    p_lines: lines.map((l) => ({ line_id: l.lineId, quantity: l.quantity, unit_cost: l.unitCost ?? null })),
    p_note: note,
  })
  const message = friendlyFromSupabaseError(error)
  return message ? { error: message } : { error: null, status: (data as { status: PurchaseOrderStatus }).status }
}

export async function getOrderSuggestions(branchId: string): Promise<OrderSuggestion[]> {
  const { data, error } = await supabase.rpc('get_order_suggestions', { p_branch_id: branchId })
  if (error) failRead(error)
  return data as OrderSuggestion[]
}

export async function getProcurementAttention(branchId: string): Promise<ProcurementAttention> {
  const { data, error } = await supabase.rpc('get_procurement_attention', { p_branch_id: branchId })
  if (error) failRead(error)
  return data as ProcurementAttention
}
