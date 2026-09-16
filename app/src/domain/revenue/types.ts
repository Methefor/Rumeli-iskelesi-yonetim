/** Arbitrary, configurable revenue category -> amount map (e.g. "gida": 1200.5). */
export type CategoryAmounts = Record<string, number>

/**
 * A single register reading for one shift.
 * `kind` distinguishes a morning X reading from an evening Z reading —
 * see calculateShiftRevenue for why this matters.
 */
export interface RegisterReading {
  kind: 'X' | 'Z'
  registerTotal: number
  categories: CategoryAmounts
}
