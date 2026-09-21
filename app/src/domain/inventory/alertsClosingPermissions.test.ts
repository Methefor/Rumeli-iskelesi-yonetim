import { describe, expect, it } from 'vitest'
import { deriveInventoryAlerts } from './alerts'
import { deriveClosingStatus } from './closing'
import { canInventory, inventoryPermissionsFor } from './permissions'

describe('deriveInventoryAlerts', () => {
  const items = [
    { id: 'a', name: 'Ürün A', unit: 'kg', isActive: true },
    { id: 'b', name: 'Ürün B', unit: 'adet', isActive: true },
    { id: 'c', name: 'Ürün C', unit: 'kg', isActive: false },
  ]

  it('flags negative theoretical stock', () => {
    const alerts = deriveInventoryAlerts(
      items,
      [{ inventoryItemId: 'a', theoreticalQuantity: -2 }],
      [
        { inventoryItemId: 'a', varianceQuantity: 0 },
        { inventoryItemId: 'b', varianceQuantity: 0 },
      ],
    )
    expect(alerts.map((a) => a.kind)).toEqual(['negative_stock'])
  })

  it('flags a non-zero variance on the last count', () => {
    const alerts = deriveInventoryAlerts(
      items,
      [],
      [
        { inventoryItemId: 'a', varianceQuantity: -8 },
        { inventoryItemId: 'b', varianceQuantity: 0 },
      ],
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ kind: 'count_variance', inventoryItemId: 'a' })
    expect(alerts[0]?.message).toContain('-8')
  })

  it('flags never-counted active items and ignores inactive ones', () => {
    const alerts = deriveInventoryAlerts(items, [], [])
    expect(alerts.map((a) => a.inventoryItemId)).toEqual(['a', 'b'])
    expect(alerts.every((a) => a.kind === 'never_counted')).toBe(true)
  })

  it('produces no alerts when stock is positive and counts match', () => {
    const alerts = deriveInventoryAlerts(
      items,
      [{ inventoryItemId: 'a', theoreticalQuantity: 4 }],
      [
        { inventoryItemId: 'a', varianceQuantity: 0 },
        { inventoryItemId: 'b', varianceQuantity: 0 },
      ],
    )
    expect(alerts).toEqual([])
  })
})

describe('deriveClosingStatus', () => {
  it('is complete when the sales report and the count are done, even with no waste', () => {
    const status = deriveClosingStatus({
      salesReportSubmitted: true,
      wasteEntries: 0,
      countSubmitted: true,
    })
    expect(status.complete).toBe(true)
    expect(status.doneCount).toBe(2)
    expect(status.requiredCount).toBe(2)
    expect(status.steps.find((s) => s.key === 'waste')).toMatchObject({
      done: false,
      optional: true,
    })
  })

  it('is incomplete when a required step is missing', () => {
    expect(
      deriveClosingStatus({
        salesReportSubmitted: true,
        wasteEntries: 3,
        countSubmitted: false,
      }).complete,
    ).toBe(false)
    expect(
      deriveClosingStatus({
        salesReportSubmitted: false,
        wasteEntries: 0,
        countSubmitted: true,
      }).complete,
    ).toBe(false)
  })

  it('recorded waste never substitutes for a required step', () => {
    const status = deriveClosingStatus({
      salesReportSubmitted: false,
      wasteEntries: 5,
      countSubmitted: false,
    })
    expect(status.complete).toBe(false)
    expect(status.doneCount).toBe(0)
  })
})

describe('inventory permissions (UI visibility map)', () => {
  it('owner and manager can manage cost', () => {
    expect(canInventory(['owner'], 'inventory.cost.manage')).toBe(true)
    expect(canInventory(['manager'], 'inventory.cost.manage')).toBe(true)
  })

  it('branch_manager can read but not manage cost, and can adjust', () => {
    expect(canInventory(['branch_manager'], 'inventory.cost.read')).toBe(true)
    expect(canInventory(['branch_manager'], 'inventory.cost.manage')).toBe(false)
    expect(canInventory(['branch_manager'], 'inventory.adjust')).toBe(true)
  })

  it('cashier and employee: waste + count + read only — no cost, no receive, no adjust', () => {
    for (const role of ['cashier', 'employee']) {
      expect(canInventory([role], 'inventory.record')).toBe(true)
      expect(canInventory([role], 'inventory.count')).toBe(true)
      expect(canInventory([role], 'inventory.read')).toBe(true)
      expect(canInventory([role], 'inventory.cost.read')).toBe(false)
      expect(canInventory([role], 'inventory.cost.manage')).toBe(false)
      expect(canInventory([role], 'inventory.receive')).toBe(false)
      expect(canInventory([role], 'inventory.adjust')).toBe(false)
    }
  })

  it('viewer and unknown roles have no inventory permission', () => {
    expect(inventoryPermissionsFor(['viewer']).size).toBe(0)
    expect(inventoryPermissionsFor(['ghost']).size).toBe(0)
    expect(inventoryPermissionsFor([]).size).toBe(0)
  })

  it('unions the permissions of multiple roles', () => {
    expect(canInventory(['employee', 'branch_manager'], 'inventory.receive')).toBe(true)
  })
})
