/** Quantities are stored with 3 decimal places (numeric(14,3)) — mirror that to avoid float drift in sums. */
export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

/** Money is compared/summed at 2 decimals for display-level results. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
