/**
 * Procurement domain types. TypeScript twin of supabase/migrations/20261006000500/600 (procurement core + RPCs).
 * SQL is authoritative; the real app only displays what the RPCs return.
 *
 * UNIT CONTRACT. BASE unit = the inventory item's stock unit (what the ledger, on-hand and thresholds use). ORDER unit = the
 * supply parameter `order_unit` (e.g. a case); base = order quantity x unitsPerPack. orderUnit and unitsPerPack are set together
 * or not at all (neither = ordering in the base unit). Base: onHand, pending, effective stock, minimum/target/safety stock,
 * ledger quantities, unitsPerPack. Order unit: ordered/received/open quantities of a line, minimum order quantity, order multiple,
 * suggestedQuantity. The pack factor is snapshotted on the line when it is written.
 */

export type SupplierType = 'COMPANY' | 'CENTRAL_WAREHOUSE'

export interface Supplier {
  id: string
  code: string
  name: string
  supplierType: SupplierType
  contactName: string | null
  phone: string | null
  email: string | null
  notes: string | null
  isActive: boolean
}

/** ISO weekdays: 1 = Monday .. 7 = Sunday. null = not configured (never "every day"). */
export type Weekdays = number[] | null

export interface SupplyParams {
  id: string
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
  /** 'HH:MM' local branch time */
  orderCutoffTime: string | null
  deliveryWeekdays: Weekdays
  minimumOrderQuantity: number | null
  orderMultiple: number | null
  isActive: boolean
  notes: string | null
}

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'PREPARING'
  | 'IN_TRANSIT'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED'

export type ProcurementPermission =
  | 'procurement.supplier.read'
  | 'procurement.supplier.manage'
  | 'procurement.supply.manage'
  | 'procurement.order.read'
  | 'procurement.order.create'
  | 'procurement.order.approve'
  | 'procurement.order.manage'
  | 'procurement.order.receive'

export interface PurchaseOrderSummary {
  /** progress is counted in LINES: quantities of different items/units are never added */
  id: string
  orderNumber: string
  status: PurchaseOrderStatus
  supplierCode: string
  supplierName: string
  orderedForDate: string | null
  expectedDeliveryDate: string | null
  createdAt: string
  lineCount: number
  receivedLineCount: number
  partialLineCount: number
}

export interface EstimateMetric {
  state: 'available' | 'unavailable'
  kurus?: number
  reason?: 'missing_cost' | 'no_permission'
}

export interface PurchaseOrderLine {
  id: string
  inventoryItemId: string
  code: string
  name: string
  /** BASE (stock) unit */
  unit: string
  /** ORDER unit (the base unit when orderUnit is null) */
  orderedQuantity: number
  receivedQuantity: number
  openQuantity: number
  /** BASE unit = what the ledger sees */
  orderedBaseQuantity: number
  receivedBaseQuantity: number
  openBaseQuantity: number
  orderUnit: string | null
  unitsPerPack: number | null
  notes: string | null
  unitCostEstimate: EstimateMetric
}

export interface PurchaseOrderDetail {
  id: string
  orderNumber: string
  branchId: string
  branchName: string
  status: PurchaseOrderStatus
  orderedForDate: string | null
  expectedDeliveryDate: string | null
  submittedAt: string | null
  approvedAt: string | null
  receivedAt: string | null
  cancelledAt: string | null
  createdAt: string
  notes: string | null
  supplier: { id: string; code: string; name: string; type: SupplierType }
  lines: PurchaseOrderLine[]
  history: Array<{ fromStatus: PurchaseOrderStatus | null; toStatus: PurchaseOrderStatus; changedBy: string | null; reason: string | null; changedAt: string }>
  /** order-unit quantity, base (ledger) quantity, and whether the ledger movement was later reversed */
  receipts: Array<{ lineId: string; movementId: string; quantity: number; baseQuantity: number; reversed: boolean; receivedBy: string | null; receivedAt: string }>
  reconciliation: ReconciliationInfo
}

/** received_quantity vs receipt links vs ledger. A reversed receipt is a visible warning; the order is never silently reopened. */
export interface ReconciliationInfo {
  state: 'ok' | 'warning'
  reasons: Array<'receipt_reversed' | 'link_mismatch'>
  reversedBaseQuantity: number
  netReceivedBaseQuantity: number
}

export type SuggestionStatus = 'configured' | 'partially_configured' | 'unavailable'

export interface OrderCalendar {
  configured: boolean
  today: string
  canOrderToday: boolean | null
  /** only meaningful on an order day */
  cutoffPassed: boolean | null
  nextOrderDate: string | null
  expectedDelivery: { state: 'estimated' | 'unknown'; date: string | null }
}

export type ConversionStatus = 'base_unit' | 'pack' | 'missing'

export interface OrderSuggestion {
  inventoryItemId: string
  code: string
  name: string
  /** BASE (stock) unit */
  unit: string
  supplierId: string
  supplierCode: string
  supplierName: string
  /** BASE unit */
  onHand: number
  /** BASE unit: open order quantity x each line's frozen pack factor */
  pendingOrderQuantity: number
  effectiveStock: number
  minimumStock: number | null
  targetStock: number | null
  safetyStock: number | null
  orderUnit: string | null
  unitsPerPack: number | null
  /** 'missing' = a half-configured conversion: no suggestion, nothing is guessed */
  conversionStatus: ConversionStatus
  status: SuggestionStatus
  reorderNeeded: boolean | null
  /** ORDER unit; positive or null: never zero or negative */
  suggestedQuantity: number | null
  /** the same suggestion in BASE units */
  suggestedBaseQuantity: number | null
  hasOpenOrder: boolean
  calendar: OrderCalendar
}

export interface OrderBrief {
  id: string
  orderNumber: string
  status: PurchaseOrderStatus
  supplierName: string
  expectedDeliveryDate: string | null
  submittedAt: string | null
  lineCount: number
  receivedLineCount: number
}

export interface ProcurementAttention {
  branchId: string
  today: string
  awaitingApproval: OrderBrief[]
  dueToday: OrderBrief[]
  overdueDelivery: OrderBrief[]
  partiallyReceived: OrderBrief[]
  nextDeliveries: OrderBrief[]
  lowStockNoOpenOrder: OrderSuggestion[]
  /** fulfillment that no longer matches the ledger (e.g. a reversed receipt) */
  reconciliationWarnings: Array<OrderBrief & { reasons: string[] }>
}
