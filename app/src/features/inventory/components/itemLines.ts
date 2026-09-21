export interface ItemLine {
  key: string
  itemId: string
  quantity: number | null
  unitCost: number | null
}

let lineSeq = 0
export function newLine(): ItemLine {
  lineSeq += 1
  return { key: `line-${lineSeq}`, itemId: '', quantity: null, unitCost: null }
}

/** A line is usable when an item is chosen and the quantity is > 0. */
export function isCompleteLine(line: ItemLine): boolean {
  return line.itemId !== '' && line.quantity !== null && line.quantity > 0
}
