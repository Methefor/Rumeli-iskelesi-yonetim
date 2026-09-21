const moneyFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const quantityFormatter = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 })

export function formatMoney(value: number): string {
  return moneyFormatter.format(value)
}

export function formatQuantity(value: number): string {
  return quantityFormatter.format(value)
}

/** 0.4 -> "%40", 0.4123 -> "%41,2" (a ratio, not already a percentage). */
export function formatRatioPercent(ratio: number): string {
  const percent = Math.round(ratio * 1000) / 10
  return `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(percent)}`
}

/** Signed quantity for variances: +2, -8, 0. */
export function formatSignedQuantity(value: number): string {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : '−'}${quantityFormatter.format(Math.abs(value))}`
}
