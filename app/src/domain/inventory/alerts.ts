export type InventoryAlertKind = 'negative_stock' | 'count_variance' | 'never_counted'

export interface InventoryAlert {
  kind: InventoryAlertKind
  inventoryItemId: string
  itemName: string
  /** Turkish, user-facing. */
  message: string
}

export interface AlertItem {
  id: string
  name: string
  unit: string
  isActive: boolean
}

export interface AlertBalance {
  inventoryItemId: string
  theoreticalQuantity: number
}

export interface AlertLastCount {
  inventoryItemId: string
  varianceQuantity: number
}

function trim(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

/**
 * Operational stock alerts derived only from facts the system already holds —
 * no reorder levels or forecasts (deferred). Inactive items are ignored.
 */
export function deriveInventoryAlerts(
  items: readonly AlertItem[],
  balances: readonly AlertBalance[],
  lastCounts: readonly AlertLastCount[],
): InventoryAlert[] {
  const balanceById = new Map(
    balances.map((b) => [b.inventoryItemId, b.theoreticalQuantity]),
  )
  const countById = new Map(
    lastCounts.map((c) => [c.inventoryItemId, c.varianceQuantity]),
  )
  const alerts: InventoryAlert[] = []

  for (const item of items) {
    if (!item.isActive) continue

    const theoretical = balanceById.get(item.id) ?? 0
    if (theoretical < 0) {
      alerts.push({
        kind: 'negative_stock',
        inventoryItemId: item.id,
        itemName: item.name,
        message: `${item.name}: kayıtlı stok eksiye düştü (${trim(theoretical)} ${item.unit}). Eksik giriş olabilir.`,
      })
    }

    if (!countById.has(item.id)) {
      alerts.push({
        kind: 'never_counted',
        inventoryItemId: item.id,
        itemName: item.name,
        message: `${item.name}: henüz fiziksel sayım yapılmadı.`,
      })
      continue
    }

    const variance = countById.get(item.id) ?? 0
    if (variance !== 0) {
      alerts.push({
        kind: 'count_variance',
        inventoryItemId: item.id,
        itemName: item.name,
        message: `${item.name}: son sayımda fark var (${variance > 0 ? '+' : ''}${trim(variance)} ${item.unit}).`,
      })
    }
  }

  return alerts
}
