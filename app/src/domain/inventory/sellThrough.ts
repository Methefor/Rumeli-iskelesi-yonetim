import { roundQuantity } from './quantity'
import type { StockPosition } from './types'

export interface SellThroughResult {
  /** The quantity that was available to sell: opening + received + adjustmentIn. */
  available: number
  /** sold / available (a ratio, 0..1 in consistent data), or null when `available` <= 0. */
  ratio: number | null
}

/**
 * ADOPTED FORMULA (see INVENTORY_MODEL.md):
 *
 *   sell-through = sold / (opening + received + adjustmentIn)
 *
 * The denominator is stock that was available to sell during the period.
 * Waste and outbound adjustments are NOT subtracted from it: stock that
 * spoiled was still available (and unsold), so it correctly lowers the
 * ratio instead of hiding a loss. `sold` and `received` are already net of
 * reversals (computeStockPosition).
 *
 * When the denominator is zero or negative there is nothing meaningful to
 * divide by, so `ratio` is null rather than a misleading 0% / Infinity.
 * A ratio above 1 means more was recorded sold than was available — a data
 * problem to investigate (e.g. late-logged receipts), not a success.
 */
export function calculateSellThrough(
  position: Pick<StockPosition, 'opening' | 'received' | 'adjustmentIn' | 'sold'>,
): SellThroughResult {
  const available = roundQuantity(
    position.opening + position.received + position.adjustmentIn,
  )
  if (available <= 0) return { available, ratio: null }
  return { available, ratio: Math.round((position.sold / available) * 10000) / 10000 }
}
