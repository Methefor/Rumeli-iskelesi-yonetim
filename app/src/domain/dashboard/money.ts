/**
 * All dashboard money aggregation happens in integer kuruş (1 TL = 100 kuruş)
 * to avoid floating-point drift when summing many report/shift amounts.
 * TL floats from the data layer are converted to kuruş at the boundary
 * (`toKurus`); the result is converted back to TL only for presentation
 * (`fromKurus` + `formatMoney`). No component sums TL floats directly.
 */
export type Kurus = number

/** TL (as stored/returned by the data layer) -> integer kuruş. */
export function toKurus(tl: number): Kurus {
  return Math.round(tl * 100)
}

/** Integer kuruş -> TL, for `formatMoney` at the presentation boundary only. */
export function fromKurus(kurus: Kurus): number {
  return kurus / 100
}

/** Sums integer kuruş values — plain integer addition, no drift regardless of count. */
export function sumKurus(values: readonly Kurus[]): Kurus {
  return values.reduce((sum, v) => sum + v, 0)
}
