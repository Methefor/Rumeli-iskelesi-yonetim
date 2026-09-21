import { describe, expect, it } from 'vitest'
import { summarizeGrossProfit, type GrossProfitInput } from './grossProfit'

function line(overrides: Partial<GrossProfitInput>): GrossProfitInput {
  return {
    inventoryItemId: 'i1',
    code: 'A',
    name: 'Örnek Ürün A',
    unit: 'kg',
    soldQuantity: 10,
    productRevenue: 500,
    cogs: 300,
    costedQuantity: 10,
    uncostedQuantity: 0,
    ...overrides,
  }
}

describe('summarizeGrossProfit', () => {
  it('gross profit = product revenue - COGS, with a margin', () => {
    const s = summarizeGrossProfit([line({})], 0)
    expect(s.status).toBe('complete')
    expect(s.grossProfit).toBe(200)
    expect(s.lines[0]).toMatchObject({
      status: 'complete',
      grossProfit: 200,
      grossMargin: 0.4,
      note: null,
    })
  })

  it('COGS is quantity x snapshot cost, so a fully costed line sums exactly', () => {
    // 5 units sold at snapshot 13 = 65; revenue 250
    const s = summarizeGrossProfit(
      [line({ soldQuantity: 5, productRevenue: 250, cogs: 65, costedQuantity: 5 })],
      0,
    )
    expect(s.grossProfit).toBe(185)
  })

  it('is UNAVAILABLE (never zero) when nothing was costed', () => {
    const s = summarizeGrossProfit(
      [line({ cogs: 0, costedQuantity: 0, uncostedQuantity: 10 })],
      0,
    )
    expect(s.status).toBe('unavailable')
    expect(s.grossProfit).toBe(0)
    expect(s.lines[0]).toMatchObject({
      status: 'unavailable',
      grossProfit: null,
      grossMargin: null,
    })
    expect(s.lines[0]?.note).toMatch(/maliyet/)
  })

  it('is PARTIAL for a line with some uncosted quantity, and asserts no profit for it', () => {
    const s = summarizeGrossProfit(
      [line({ costedQuantity: 6, uncostedQuantity: 4, cogs: 180 })],
      0,
    )
    expect(s.lines[0]).toMatchObject({ status: 'partial', grossProfit: null })
    expect(s.status).toBe('unavailable') // no complete line -> no figure at all
  })

  it('overall PARTIAL when only some lines are derivable', () => {
    const s = summarizeGrossProfit(
      [
        line({}),
        line({
          inventoryItemId: 'i2',
          code: 'B',
          cogs: 0,
          costedQuantity: 0,
          uncostedQuantity: 10,
          productRevenue: 100,
        }),
      ],
      0,
    )
    expect(s.status).toBe('partial')
    expect(s.grossProfit).toBe(200)
    expect(s.coveredRevenue).toBe(500)
    expect(s.uncoveredProductRevenue).toBe(100)
  })

  it('unmapped category revenue means revenue is not reliably product-mapped -> PARTIAL, not complete', () => {
    const s = summarizeGrossProfit([line({})], 1200)
    expect(s.status).toBe('partial')
    expect(s.unmappedCategoryRevenue).toBe(1200)
    expect(s.grossProfit).toBe(200) // the covered part is still reported honestly
  })

  it('is UNAVAILABLE with no product lines at all — gross profit is not fabricated from category revenue', () => {
    const s = summarizeGrossProfit([], 5000)
    expect(s.status).toBe('unavailable')
    expect(s.grossProfit).toBe(0)
    expect(s.lines).toHaveLength(0)
    expect(s.unmappedCategoryRevenue).toBe(5000)
  })

  it('a period with no net sales for an item is unavailable, not a zero-profit line', () => {
    const s = summarizeGrossProfit(
      [line({ soldQuantity: 0, productRevenue: 0, cogs: 0, costedQuantity: 0 })],
      0,
    )
    expect(s.lines[0]?.status).toBe('unavailable')
  })

  it('can report a loss (negative gross profit) honestly', () => {
    const s = summarizeGrossProfit([line({ productRevenue: 100, cogs: 130 })], 0)
    expect(s.grossProfit).toBe(-30)
    expect(s.lines[0]?.grossMargin).toBe(-0.3)
  })
})
