export type InventoryPermission =
  | 'inventory.read'
  | 'inventory.record'
  | 'inventory.receive'
  | 'inventory.count'
  | 'inventory.adjust'
  | 'inventory.item.manage'
  | 'inventory.cost.read'
  | 'inventory.cost.manage'

const ALL: readonly InventoryPermission[] = [
  'inventory.read',
  'inventory.record',
  'inventory.receive',
  'inventory.count',
  'inventory.adjust',
  'inventory.item.manage',
  'inventory.cost.read',
  'inventory.cost.manage',
]

/**
 * UI-VISIBILITY ONLY. Mirrors the role -> permission seed in
 * supabase/migrations/012_inventory_core.sql so screens can hide actions a
 * role cannot perform. It grants nothing: every mutation is authorized again
 * server-side (RLS + SECURITY DEFINER RPCs) using the real role_permissions
 * table. If a role's grants change in the database, update this map to match
 * (the worst case of drift is a hidden button or a button that the server
 * then refuses — never an access-control bypass).
 *
 * branch_manager has cost.read but not cost.manage. viewer has nothing.
 */
const ROLE_PERMISSIONS: Readonly<Record<string, readonly InventoryPermission[]>> = {
  owner: ALL,
  manager: ALL,
  branch_manager: [
    'inventory.read',
    'inventory.record',
    'inventory.receive',
    'inventory.count',
    'inventory.adjust',
    'inventory.item.manage',
    'inventory.cost.read',
  ],
  cashier: ['inventory.read', 'inventory.record', 'inventory.count'],
  employee: ['inventory.read', 'inventory.record', 'inventory.count'],
  viewer: [],
}

export function inventoryPermissionsFor(
  roles: readonly string[],
): ReadonlySet<InventoryPermission> {
  const granted = new Set<InventoryPermission>()
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) granted.add(permission)
  }
  return granted
}

export function canInventory(
  roles: readonly string[],
  permission: InventoryPermission,
): boolean {
  return inventoryPermissionsFor(roles).has(permission)
}
