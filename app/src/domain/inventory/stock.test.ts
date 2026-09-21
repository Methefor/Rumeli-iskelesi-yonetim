import { describe, expect, it } from 'vitest'
import { computeStockPosition, stockDeltaFor, theoreticalStock } from './stock'
import { calculateVariance } from './variance'
import type { LedgerMovement, MovementType } from './types'

let seq = 0
function move(
  type: Exclude<MovementType, 'REVERSAL'>,
  quantity: number,
  occurredAt: string,
  overrides: Partial<LedgerMovement> = {},
): LedgerMovement {
  seq += 1
  return {
    id: `m${seq}`,
    inventoryItemId: 'item-1',
    type,
    quantity,
    stockDelta: stockDeltaFor(type, quantity),
    occurredAt,
    reversesMovementId: null,
    ...overrides,
  }
}

function reverse(original: LedgerMovement, occurredAt: string): LedgerMovement {
  seq += 1
  return {
    id: `m${seq}`,
    inventoryItemId: original.inventoryItemId,
    type: 'REVERSAL',
    quantity: original.quantity,
    stockDelta: -original.stockDelta,
    occurredAt,
    reversesMovementId: original.id,
  }
}

describe('stockDeltaFor / theoreticalStock', () => {
  it('a receipt increases theoretical stock', () => {
    expect(theoreticalStock([move('RECEIPT', 40, '2027-06-01T08:00:00Z')])).toBe(40)
  })

  it('a sale decreases theoretical stock', () => {
    const ledger = [
      move('RECEIPT', 40, '2027-06-01T08:00:00Z'),
      move('SALE', 12.5, '2027-06-01T12:00:00Z'),
    ]
    expect(theoreticalStock(ledger)).toBe(27.5)
  })

  it('waste decreases theoretical stock', () => {
    const ledger = [
      move('RECEIPT', 40, '2027-06-01T08:00:00Z'),
      move('WASTE', 3, '2027-06-01T20:00:00Z'),
    ]
    expect(theoreticalStock(ledger)).toBe(37)
  })

  it('handles adjustment in and out', () => {
    const ledger = [
      move('RECEIPT', 10, '2027-06-01T08:00:00Z'),
      move('ADJUSTMENT_IN', 2, '2027-06-01T09:00:00Z'),
      move('ADJUSTMENT_OUT', 0.5, '2027-06-01T10:00:00Z'),
    ]
    expect(theoreticalStock(ledger)).toBe(11.5)
  })

  it('a reversal undoes exactly the movement it reverses', () => {
    const sale = move('SALE', 5, '2027-06-01T12:00:00Z')
    const ledger = [
      move('RECEIPT', 40, '2027-06-01T08:00:00Z'),
      sale,
      reverse(sale, '2027-06-01T13:00:00Z'),
    ]
    expect(theoreticalStock(ledger)).toBe(40)
  })

  it('does not accumulate floating point drift', () => {
    const ledger = Array.from({ length: 10 }, (_, i) =>
      move('RECEIPT', 0.1, `2027-06-01T0${i}:00:00Z`),
    )
    expect(theoreticalStock(ledger)).toBe(1)
  })
})

describe('physical counts never mutate the ledger', () => {
  it('computing variance leaves the ledger and its theoretical stock untouched', () => {
    const ledger = Object.freeze([
      move('RECEIPT', 100, '2027-06-01T08:00:00Z'),
      move('SALE', 20, '2027-06-01T12:00:00Z'),
    ] as LedgerMovement[])
    const before = theoreticalStock(ledger)

    const { variance } = calculateVariance(75, before)

    expect(variance).toBe(-5)
    expect(theoreticalStock(ledger)).toBe(before)
    expect(ledger).toHaveLength(2)
  })
})

describe('calculateVariance', () => {
  it('is physical minus theoretical', () => {
    expect(calculateVariance(140, 148)).toEqual({ variance: -8, variancePercent: -5.41 })
    expect(calculateVariance(150, 148).variance).toBe(2)
    expect(calculateVariance(148, 148)).toEqual({ variance: 0, variancePercent: 0 })
  })

  it('has no percentage when theoretical stock is zero or negative', () => {
    expect(calculateVariance(3, 0)).toEqual({ variance: 3, variancePercent: null })
    expect(calculateVariance(0, -2)).toEqual({ variance: 2, variancePercent: null })
  })
})

describe('computeStockPosition', () => {
  const ledger = (): LedgerMovement[] => {
    seq = 0
    const before = move('RECEIPT', 30, '2027-05-31T08:00:00Z')
    const receipt = move('RECEIPT', 100, '2027-06-01T08:00:00Z')
    const sale = move('SALE', 60, '2027-06-01T12:00:00Z')
    const waste = move('WASTE', 4, '2027-06-01T14:00:00Z')
    const adjIn = move('ADJUSTMENT_IN', 2, '2027-06-01T15:00:00Z')
    const adjOut = move('ADJUSTMENT_OUT', 1, '2027-06-01T16:00:00Z')
    const later = move('SALE', 9, '2027-06-02T10:00:00Z')
    return [before, receipt, sale, waste, adjIn, adjOut, later]
  }
  const period = { from: '2027-06-01T00:00:00Z', to: '2027-06-02T00:00:00Z' }

  it('closing = opening + received + adjIn - sold - waste - adjOut', () => {
    const p = computeStockPosition(ledger(), period)
    expect(p).toEqual({
      opening: 30,
      received: 100,
      adjustmentIn: 2,
      sold: 60,
      waste: 4,
      adjustmentOut: 1,
      closing: 67,
    })
  })

  it('closing equals the ledger balance at the end of the period', () => {
    const all = ledger()
    const inPeriod = all.filter((m) => Date.parse(m.occurredAt) < Date.parse(period.to))
    expect(computeStockPosition(all, period).closing).toBe(theoreticalStock(inPeriod))
  })

  it('nets a reversal into the bucket of the movement it reverses', () => {
    seq = 0
    const receipt = move('RECEIPT', 100, '2027-06-01T08:00:00Z')
    const sale = move('SALE', 10, '2027-06-01T12:00:00Z')
    const reversal = reverse(sale, '2027-06-01T13:00:00Z')
    const resale = move('SALE', 7, '2027-06-01T13:00:01Z')

    const p = computeStockPosition([receipt, sale, reversal, resale], period)

    expect(p.sold).toBe(7) // 10 - 10 (reversed) + 7, not 17 and not "received 110"
    expect(p.received).toBe(100)
    expect(p.closing).toBe(93)
  })

  it('finds the original of a reversal even when the original predates the period', () => {
    seq = 0
    const receipt = move('RECEIPT', 50, '2027-05-30T08:00:00Z')
    const sale = move('SALE', 10, '2027-05-30T12:00:00Z')
    const reversal = reverse(sale, '2027-06-01T09:00:00Z')

    const p = computeStockPosition([receipt, sale, reversal], period)

    expect(p.opening).toBe(40)
    expect(p.sold).toBe(-10) // the correction shows up as negative sales in the period it happened
    expect(p.closing).toBe(50)
  })
})
