import { roundMoney, roundQuantity } from './quantity'

/** One item's inputs, exactly as get_inventory_gross_profit() (014) returns them. */
export interface GrossProfitInput {
  inventoryItemId: string
  code: string
  name: string
  unit: string
  soldQuantity: number
  productRevenue: number
  /** Cost of the COSTED quantity only. */
  cogs: number
  costedQuantity: number
  uncostedQuantity: number
}

export type GrossProfitStatus = 'complete' | 'partial' | 'unavailable'

export interface GrossProfitLine extends GrossProfitInput {
  status: GrossProfitStatus
  /** product revenue - COGS. null unless status === 'complete'. */
  grossProfit: number | null
  /** grossProfit / productRevenue as a ratio, or null when unavailable / no revenue. */
  grossMargin: number | null
  /** Why a line is not 'complete' (Turkish, user-facing). */
  note: string | null
}

export interface GrossProfitSummary {
  lines: GrossProfitLine[]
  /** Sum of grossProfit over COMPLETE lines only. */
  grossProfit: number
  /** Revenue of the complete lines the grossProfit figure covers. */
  coveredRevenue: number
  /** Revenue of product lines whose gross profit could not be derived (uncosted / partly costed). */
  uncoveredProductRevenue: number
  /** Category-level revenue in inventory-tracked categories that is not linked to any product. */
  unmappedCategoryRevenue: number
  /**
   * 'complete'    every product line is fully costed AND no tracked-category revenue is unmapped
   * 'partial'     some gross profit is derivable, but not all revenue is covered
   * 'unavailable' none can be derived (never fabricate a number)
   */
  status: GrossProfitStatus
}

/**
 * GROSS profit = product revenue - COGS, where COGS = sold quantity x the
 * cost SNAPSHOT taken when each sale happened (so later cost changes never
 * rewrite history). This is NOT net profit: payroll, rent, utilities and all
 * other overhead are excluded — UI copy must say "Brüt Kâr".
 *
 * Nothing is fabricated:
 *  - a line with any uncosted quantity is 'partial' (its COGS is known only
 *    for the costed part, so its profit is not asserted),
 *  - a line with no costed quantity, or no sales, is 'unavailable',
 *  - category revenue that was never linked to a product is reported as
 *    `unmappedCategoryRevenue`, downgrading the overall status to 'partial'.
 */
export function summarizeGrossProfit(
  inputs: readonly GrossProfitInput[],
  unmappedCategoryRevenue: number,
): GrossProfitSummary {
  const lines: GrossProfitLine[] = inputs.map((input) => {
    if (input.soldQuantity <= 0 && input.productRevenue <= 0) {
      return {
        ...input,
        status: 'unavailable',
        grossProfit: null,
        grossMargin: null,
        note: 'Bu dönemde net satış yok.',
      }
    }
    if (input.costedQuantity <= 0) {
      return {
        ...input,
        status: 'unavailable',
        grossProfit: null,
        grossMargin: null,
        note: 'Bu ürün için maliyet tanımlı değil.',
      }
    }
    if (input.uncostedQuantity > 0) {
      return {
        ...input,
        status: 'partial',
        grossProfit: null,
        grossMargin: null,
        note: `${roundQuantity(input.uncostedQuantity)} ${input.unit} maliyetsiz satıldı; kâr hesaplanamadı.`,
      }
    }
    const grossProfit = roundMoney(input.productRevenue - input.cogs)
    return {
      ...input,
      status: 'complete',
      grossProfit,
      grossMargin:
        input.productRevenue > 0
          ? Math.round((grossProfit / input.productRevenue) * 10000) / 10000
          : null,
      note: null,
    }
  })

  const complete = lines.filter((l) => l.status === 'complete')
  const grossProfit = roundMoney(
    complete.reduce((sum, l) => sum + (l.grossProfit ?? 0), 0),
  )
  const coveredRevenue = roundMoney(
    complete.reduce((sum, l) => sum + l.productRevenue, 0),
  )
  const uncoveredProductRevenue = roundMoney(
    lines
      .filter((l) => l.status !== 'complete')
      .reduce((sum, l) => sum + l.productRevenue, 0),
  )
  const unmapped = roundMoney(unmappedCategoryRevenue)

  let status: GrossProfitStatus
  if (complete.length === 0) status = 'unavailable'
  else if (complete.length === lines.length && unmapped <= 0) status = 'complete'
  else status = 'partial'

  return {
    lines,
    grossProfit,
    coveredRevenue,
    uncoveredProductRevenue,
    unmappedCategoryRevenue: unmapped,
    status,
  }
}
