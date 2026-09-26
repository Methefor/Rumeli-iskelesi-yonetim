/**
 * UI-VISIBILITY MIRROR of the server rules in
 * supabase/migrations/016_management_center.sql (admin_guard_target,
 * assign_role, internal_provision_employee, ...). It only decides which
 * buttons a screen shows; every action is authorized again by the database,
 * so drift can hide a button or show one the server refuses, never bypass
 * anything.
 *
 * Rank: owner 4 > manager 3 > branch_manager 2 > cashier/employee/viewer 1.
 */
export type RoleKey = 'owner' | 'manager' | 'branch_manager' | 'cashier' | 'employee' | 'viewer'

export const ALL_ROLE_KEYS: readonly RoleKey[] = [
  'owner',
  'manager',
  'branch_manager',
  'cashier',
  'employee',
  'viewer',
]

const RANKS: Readonly<Record<string, number>> = {
  owner: 4,
  manager: 3,
  branch_manager: 2,
  cashier: 1,
  employee: 1,
  viewer: 1,
}

export function roleRank(role: string): number {
  return RANKS[role] ?? 0
}

export function highestRank(roles: readonly string[]): number {
  return roles.reduce((max, role) => Math.max(max, roleRank(role)), 0)
}

export interface ManagementActor {
  id: string
  roles: readonly string[]
  branchIds: readonly string[]
}

export interface ManagementTarget {
  id: string
  roles: readonly string[]
  branchIds: readonly string[]
}

/** May this actor open the Management Center at all (rank >= branch_manager)? */
export function canUseManagementCenter(roles: readonly string[]): boolean {
  return highestRank(roles) >= 2
}

/**
 * Whether the actor may manage this user at all: not themselves, strictly
 * higher rank, and (for a branch_manager) a shared branch.
 */
export function canManageTarget(actor: ManagementActor, target: ManagementTarget): boolean {
  const actorRank = highestRank(actor.roles)
  if (actorRank < 2) return false
  if (actor.id === target.id) return false
  if (actorRank <= highestRank(target.roles)) return false
  if (actorRank === 2) {
    return target.branchIds.some((b) => actor.branchIds.includes(b))
  }
  return true
}

/** Roles the actor may create/grant/revoke (same lists as the SQL). */
export function assignableRoles(actorRoles: readonly string[]): RoleKey[] {
  const rank = highestRank(actorRoles)
  if (rank === 4) return [...ALL_ROLE_KEYS]
  if (rank === 3) return ['branch_manager', 'cashier', 'employee', 'viewer']
  if (rank === 2) return ['cashier', 'employee', 'viewer']
  return []
}

/** Branches the actor may place a new or existing member into. */
export function assignableBranchIds(
  actor: ManagementActor,
  allBranchIds: readonly string[],
): string[] {
  const rank = highestRank(actor.roles)
  if (rank >= 3) return [...allBranchIds]
  if (rank === 2) return allBranchIds.filter((b) => actor.branchIds.includes(b))
  return []
}

/** Only owner/manager change employee codes (org-wide), and only on lower ranks. */
export function canChangeEmployeeCode(actor: ManagementActor, target: ManagementTarget): boolean {
  return highestRank(actor.roles) >= 3 && canManageTarget(actor, target)
}

/** Owner/manager edit reconciliation thresholds (settings.manage). */
export function canEditThresholds(roles: readonly string[]): boolean {
  return highestRank(roles) >= 3
}

/** Owner/manager anywhere; branch_manager only inside their own branches (shift.manage). */
export function canEditShiftSettings(actor: ManagementActor, branchId: string): boolean {
  const rank = highestRank(actor.roles)
  if (rank >= 3) return true
  return rank === 2 && actor.branchIds.includes(branchId)
}

/** Roles the actor may still grant to this target (excluding roles it already holds). */
export function grantableRolesFor(actor: ManagementActor, target: ManagementTarget): RoleKey[] {
  if (!canManageTarget(actor, target)) return []
  return assignableRoles(actor.roles).filter((r) => !target.roles.includes(r))
}

export function revocableRolesFor(actor: ManagementActor, target: ManagementTarget): RoleKey[] {
  if (!canManageTarget(actor, target)) return []
  const allowed: string[] = assignableRoles(actor.roles)
  return target.roles.filter((r): r is RoleKey => allowed.includes(r))
}
