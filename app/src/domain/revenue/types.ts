/** Arbitrary, configurable revenue category -> amount map (e.g. "gida": 1200.5). */
export type CategoryAmounts = Record<string, number>

/**
 * A single register reading for one shift.
 * `kind` distinguishes a provisional X reading from the final Z reading —
 * see the X/Z rule note in calculateShiftRevenue.ts.
 */
export interface RegisterReading {
  kind: 'X' | 'Z'
  registerTotal: number
  categories: CategoryAmounts
}
