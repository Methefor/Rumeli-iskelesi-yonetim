import type {
  ConversionStatus,
  OrderCalendar,
  ProcurementPermission,
  PurchaseOrderStatus,
  SuggestionStatus,
  SupplyParams,
  Weekdays,
} from './types'

/** Statuses whose remaining quantity still counts as "pending" (a DRAFT is not committed, so it does not). */
export const PENDING_STATUSES: readonly PurchaseOrderStatus[] = ['SUBMITTED', 'APPROVED', 'PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED']
/** Statuses that can still be received. */
export const RECEIVABLE_STATUSES: readonly PurchaseOrderStatus[] = ['APPROVED', 'PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED']

const TRANSITIONS: ReadonlyArray<readonly [PurchaseOrderStatus, PurchaseOrderStatus]> = [
  ['DRAFT', 'SUBMITTED'], ['DRAFT', 'CANCELLED'],
  ['SUBMITTED', 'APPROVED'], ['SUBMITTED', 'DRAFT'], ['SUBMITTED', 'CANCELLED'],
  ['APPROVED', 'PREPARING'], ['APPROVED', 'IN_TRANSIT'], ['APPROVED', 'CANCELLED'],
  ['PREPARING', 'IN_TRANSIT'], ['PREPARING', 'CANCELLED'],
  ['IN_TRANSIT', 'CANCELLED'],
  ['APPROVED', 'PARTIALLY_RECEIVED'], ['PREPARING', 'PARTIALLY_RECEIVED'], ['IN_TRANSIT', 'PARTIALLY_RECEIVED'],
  ['APPROVED', 'RECEIVED'], ['PREPARING', 'RECEIVED'], ['IN_TRANSIT', 'RECEIVED'],
  ['PARTIALLY_RECEIVED', 'RECEIVED'],
]

/** Mirror of procurement_transition_allowed(): RECEIVED and CANCELLED have no way out. */
export function transitionAllowed(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return TRANSITIONS.some(([a, b]) => a === from && b === to)
}

/** Statuses a user can set DIRECTLY through transition_purchase_order (receiving goes through receive). */
export const DIRECT_TARGETS: readonly PurchaseOrderStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PREPARING', 'IN_TRANSIT', 'CANCELLED', 'RECEIVED']

/** Permission required to move an order to `to` (mirror of transition_purchase_order). */
export function permissionForTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): ProcurementPermission {
  if (to === 'SUBMITTED') return 'procurement.order.create'
  if (to === 'CANCELLED' && from === 'DRAFT') return 'procurement.order.create'
  if (to === 'APPROVED') return 'procurement.order.approve'
  return 'procurement.order.manage'
}

/** Whether the server demands a written reason for this move. */
export function transitionNeedsReason(to: PurchaseOrderStatus): boolean {
  return to === 'CANCELLED' || to === 'DRAFT' || to === 'RECEIVED'
}

const ROLE_PERMISSIONS: Readonly<Record<string, readonly ProcurementPermission[]>> = {
  owner: ['procurement.supplier.read', 'procurement.supplier.manage', 'procurement.supply.manage', 'procurement.order.read', 'procurement.order.create', 'procurement.order.approve', 'procurement.order.manage', 'procurement.order.receive'],
  manager: ['procurement.supplier.read', 'procurement.supplier.manage', 'procurement.supply.manage', 'procurement.order.read', 'procurement.order.create', 'procurement.order.approve', 'procurement.order.manage', 'procurement.order.receive'],
  branch_manager: ['procurement.supplier.read', 'procurement.order.read', 'procurement.order.create', 'procurement.order.receive'],
}

/** UI-VISIBILITY ONLY (the server re-checks): mirrors the role -> permission seeds of migration 500. */
export function canProcurement(roles: readonly string[], permission: ProcurementPermission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission))
}

/** The next statuses a user could choose for an order, given status and roles (UI hints; the server decides). */
export function availableTransitions(status: PurchaseOrderStatus, roles: readonly string[]): PurchaseOrderStatus[] {
  return DIRECT_TARGETS.filter((to) => {
    if (to === 'RECEIVED' && status !== 'PARTIALLY_RECEIVED') return false
    return transitionAllowed(status, to) && canProcurement(roles, permissionForTransition(status, to))
  })
}

// ---------------------------------------------------------------------------
// Order calendar (mirror of procurement_calendar; branch time zone, never UTC)
// ---------------------------------------------------------------------------

function localParts(now: Date, timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

function addDays(iso: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** 1 = Monday .. 7 = Sunday */
export function isoWeekdayOf(iso: string): number {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}

const toMinutes = (hhmm: string): number => {
  const [h = '0', m = '0'] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

export function procurementCalendar(
  now: Date,
  timeZone: string,
  allowed: Weekdays,
  cutoff: string | null,
  delivery: Weekdays,
  leadDays: number | null,
): OrderCalendar {
  const local = localParts(now, timeZone || 'Europe/Istanbul')
  if (!allowed) {
    return { configured: false, today: local.date, canOrderToday: null, cutoffPassed: null, nextOrderDate: null, expectedDelivery: { state: 'unknown', date: null } }
  }
  const onDay = allowed.includes(isoWeekdayOf(local.date))
  const cutoffPassed = onDay && cutoff !== null ? local.minutes >= toMinutes(cutoff) : null
  const canOrderToday = onDay && !(cutoffPassed ?? false)
  const start = canOrderToday ? 0 : 1
  let nextOrderDate: string | null = null
  for (let i = start; i < start + 14; i += 1) {
    if (allowed.includes(isoWeekdayOf(addDays(local.date, i)))) {
      nextOrderDate = addDays(local.date, i)
      break
    }
  }
  let deliveryDate: string | null = null
  if (nextOrderDate && (delivery !== null || leadDays !== null)) {
    const earliest = addDays(nextOrderDate, leadDays ?? 0)
    if (delivery === null) deliveryDate = earliest
    else {
      for (let i = 0; i < 14; i += 1) {
        if (delivery.includes(isoWeekdayOf(addDays(earliest, i)))) {
          deliveryDate = addDays(earliest, i)
          break
        }
      }
    }
  }
  return {
    configured: true,
    today: local.date,
    canOrderToday,
    cutoffPassed,
    nextOrderDate,
    expectedDelivery: { state: deliveryDate ? 'estimated' : 'unknown', date: deliveryDate },
  }
}

// ---------------------------------------------------------------------------
// Order suggestion primitives (mirror of get_order_suggestions; deterministic, no AI)
// ---------------------------------------------------------------------------

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000

export interface SuggestionResult {
  /** BASE unit */
  effectiveStock: number
  status: SuggestionStatus
  reorderNeeded: boolean | null
  conversionStatus: ConversionStatus
  /** ORDER unit; positive or null: never zero or negative */
  suggestedQuantity: number | null
  /** the same suggestion in BASE units */
  suggestedBaseQuantity: number | null
}

/** Mirror of the SQL conversion rule: both set = pack, neither = base unit, exactly one = missing (never guessed). */
export function conversionOf(orderUnit: string | null, unitsPerPack: number | null): { status: ConversionStatus; factor: number } {
  if ((orderUnit === null) !== (unitsPerPack === null)) return { status: 'missing', factor: 1 }
  return orderUnit === null ? { status: 'base_unit', factor: 1 } : { status: 'pack', factor: unitsPerPack as number }
}

/** order quantity x frozen pack factor = BASE (ledger) quantity */
export function toBaseQuantity(orderQuantity: number, unitsPerPackSnapshot: number | null): number {
  return round3(orderQuantity * (unitsPerPackSnapshot ?? 1))
}

/**
 * DIMENSIONALLY CONSISTENT: onHand, pending, minimum/target/safety are all BASE units (pending = open order quantity x the line pack factor).
 * The need (base) is converted to the ORDER unit (/ unitsPerPack), raised to the minimum order quantity (order unit), rounded UP to the
 * order multiple (order unit), or to whole packs when ordering in packs. A half-configured conversion yields no suggestion.
 * effective = onHand + pending. status: configured (target set) / partially_configured (minimum or safety only) / unavailable.
 * reorderNeeded: effective < minimum, else effective < target, else unknown (null).
 * suggested = target - effective, raised to the minimum order quantity, rounded UP to the order multiple; null when no need or no target.
 * safety stock, sales velocity, weather and season are extension points and are NOT used.
 */
export function suggestOrder(
  params: Pick<SupplyParams, 'minimumStock' | 'targetStock' | 'safetyStock' | 'minimumOrderQuantity' | 'orderMultiple' | 'orderUnit' | 'unitsPerPack'>,
  onHand: number,
  pending: number,
): SuggestionResult {
  const effective = round3(onHand + pending)
  const { minimumStock: min, targetStock: target, safetyStock: safety, minimumOrderQuantity: moq, orderMultiple: multiple } = params
  const status: SuggestionStatus = target !== null ? 'configured' : min !== null || safety !== null ? 'partially_configured' : 'unavailable'
  const reorderNeeded = min !== null ? effective < min : target !== null ? effective < target : null
  const conv = conversionOf(params.orderUnit, params.unitsPerPack)
  let suggestedQuantity: number | null = null
  if (conv.status !== 'missing' && target !== null && target - effective > 0) {
    const needUnits = Math.max((target - effective) / conv.factor, moq ?? 0)
    if (multiple !== null) suggestedQuantity = round3(Math.ceil(needUnits / multiple - 1e-9) * multiple)
    else if (conv.status === 'pack') suggestedQuantity = Math.ceil(needUnits - 1e-9) // a pack is indivisible
    else suggestedQuantity = round3(needUnits)
  }
  return {
    effectiveStock: effective,
    status,
    reorderNeeded,
    conversionStatus: conv.status,
    suggestedQuantity,
    suggestedBaseQuantity: suggestedQuantity === null ? null : round3(suggestedQuantity * conv.factor),
  }
}
