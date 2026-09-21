export type MovementType =
  'RECEIPT' | 'SALE' | 'WASTE' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'REVERSAL'

/**
 * One row of the append-only stock ledger, as the UI/domain sees it.
 * `stockDelta` is the signed effect on theoretical stock (set server-side;
 * the domain never derives it from revenue).
 */
export interface LedgerMovement {
  id: string
  inventoryItemId: string
  type: MovementType
  quantity: number
  stockDelta: number
  occurredAt: string
  reversesMovementId: string | null
}

/** Theoretical stock movement buckets over a period. Reversals are netted into the bucket of the movement they reverse. */
export interface StockPosition {
  opening: number
  received: number
  adjustmentIn: number
  sold: number
  waste: number
  adjustmentOut: number
  closing: number
}

export interface CostRecord {
  unitCost: number
  /** ISO timestamp. */
  effectiveFrom: string
}
