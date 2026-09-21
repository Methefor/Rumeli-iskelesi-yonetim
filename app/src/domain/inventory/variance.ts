import { roundQuantity } from './quantity'

export interface VarianceResult {
  /** physical - theoretical. Negative = less stock on the shelf than the ledger says. */
  variance: number
  /** variance / theoretical * 100, or null when theoretical <= 0 (a percentage of nothing is meaningless). */
  variancePercent: number | null
}

/**
 * Physical variance. Pure comparison — it never produces a ledger movement;
 * explaining a variance is a separate, explicit, audited adjustment.
 */
export function calculateVariance(physical: number, theoretical: number): VarianceResult {
  const variance = roundQuantity(physical - theoretical)
  const variancePercent =
    theoretical > 0 ? Math.round((variance / theoretical) * 10000) / 100 : null
  return { variance, variancePercent }
}
