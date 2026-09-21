import { roundQuantity } from './quantity'
import type { LedgerMovement, MovementType, StockPosition } from './types'

/**
 * Signed stock effect of a NON-reversal movement. A REVERSAL's effect is the
 * exact opposite of the movement it reverses, so it cannot be derived from
 * type + quantity alone — callers use the ledger's stored delta for those.
 */
export function stockDeltaFor(
  type: Exclude<MovementType, 'REVERSAL'>,
  quantity: number,
): number {
  switch (type) {
    case 'RECEIPT':
    case 'ADJUSTMENT_IN':
      return roundQuantity(quantity)
    case 'SALE':
    case 'WASTE':
    case 'ADJUSTMENT_OUT':
      return roundQuantity(-quantity)
  }
}

/**
 * Theoretical stock = sum of the ledger's signed deltas. Physical counts are
 * deliberately not an input: a count never rewrites this number.
 */
export function theoreticalStock(movements: readonly LedgerMovement[]): number {
  return roundQuantity(movements.reduce((sum, m) => sum + m.stockDelta, 0))
}

type Bucket = 'received' | 'adjustmentIn' | 'sold' | 'waste' | 'adjustmentOut'

function bucketFor(
  movement: LedgerMovement,
  byId: ReadonlyMap<string, LedgerMovement>,
): Bucket {
  const effectiveType =
    movement.type === 'REVERSAL' && movement.reversesMovementId
      ? (byId.get(movement.reversesMovementId)?.type ?? null)
      : movement.type

  switch (effectiveType) {
    case 'RECEIPT':
      return 'received'
    case 'ADJUSTMENT_IN':
      return 'adjustmentIn'
    case 'SALE':
      return 'sold'
    case 'WASTE':
      return 'waste'
    case 'ADJUSTMENT_OUT':
      return 'adjustmentOut'
    default:
      // The reversed movement is not in the provided list (or is itself a
      // reversal — which the server forbids). Fall back on the sign so the
      // arithmetic still closes instead of silently dropping the movement.
      return movement.stockDelta >= 0 ? 'adjustmentIn' : 'adjustmentOut'
  }
}

/**
 * Stock position for one item over [from, to):
 *
 *   closing = opening + received + adjustmentIn - sold - waste - adjustmentOut
 *
 * `opening` is the ledger balance immediately before `from` (i.e. the
 * previous period's closing). A reversal is netted into the bucket of the
 * movement it reverses, so reversing a sale reduces `sold` (it does not
 * inflate `received`). Pass the item's FULL movement list so a reversal can
 * find its original even when the original predates the period.
 */
export function computeStockPosition(
  movements: readonly LedgerMovement[],
  period: { from: string; to: string },
): StockPosition {
  const fromMs = Date.parse(period.from)
  const toMs = Date.parse(period.to)
  const byId = new Map(movements.map((m) => [m.id, m]))

  const position = {
    opening: 0,
    received: 0,
    adjustmentIn: 0,
    sold: 0,
    waste: 0,
    adjustmentOut: 0,
  }

  for (const movement of movements) {
    const at = Date.parse(movement.occurredAt)
    if (at < fromMs) {
      position.opening += movement.stockDelta
      continue
    }
    if (at >= toMs) continue

    const bucket = bucketFor(movement, byId)
    // Outflow buckets are reported as positive quantities.
    const isOutflow =
      bucket === 'sold' || bucket === 'waste' || bucket === 'adjustmentOut'
    position[bucket] += isOutflow ? -movement.stockDelta : movement.stockDelta
  }

  const opening = roundQuantity(position.opening)
  const received = roundQuantity(position.received)
  const adjustmentIn = roundQuantity(position.adjustmentIn)
  const sold = roundQuantity(position.sold)
  const waste = roundQuantity(position.waste)
  const adjustmentOut = roundQuantity(position.adjustmentOut)

  return {
    opening,
    received,
    adjustmentIn,
    sold,
    waste,
    adjustmentOut,
    closing: roundQuantity(
      opening + received + adjustmentIn - sold - waste - adjustmentOut,
    ),
  }
}
