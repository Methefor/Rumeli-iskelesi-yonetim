import { describe, expect, it } from 'vitest'
import {
  assignableBranchIds,
  assignableRoles,
  canChangeEmployeeCode,
  canEditShiftSettings,
  canEditThresholds,
  canManageTarget,
  canUseManagementCenter,
  grantableRolesFor,
  highestRank,
  revocableRolesFor,
} from './rules'

const actor = (id: string, roles: string[], branchIds: string[] = []) => ({ id, roles, branchIds })

describe('management rules (mirror of 016)', () => {
  it('ranks owner > manager > branch_manager > the rest', () => {
    expect(highestRank(['cashier', 'owner'])).toBe(4)
    expect(highestRank(['manager'])).toBe(3)
    expect(highestRank(['branch_manager'])).toBe(2)
    expect(highestRank(['cashier', 'employee', 'viewer'])).toBe(1)
    expect(highestRank([])).toBe(0)
  })

  it('only branch_manager and above may use the Management Center', () => {
    expect(canUseManagementCenter(['branch_manager'])).toBe(true)
    expect(canUseManagementCenter(['cashier'])).toBe(false)
    expect(canUseManagementCenter(['employee'])).toBe(false)
    expect(canUseManagementCenter(['viewer'])).toBe(false)
  })

  it('nobody manages themselves, an equal rank, or a higher rank', () => {
    const owner = actor('o1', ['owner'])
    expect(canManageTarget(owner, actor('o1', ['owner']))).toBe(false)
    expect(canManageTarget(owner, actor('o2', ['owner']))).toBe(false)
    const manager = actor('m1', ['manager'])
    expect(canManageTarget(manager, actor('o1', ['owner']))).toBe(false)
    expect(canManageTarget(manager, actor('m2', ['manager']))).toBe(false)
    expect(canManageTarget(manager, actor('b1', ['branch_manager']))).toBe(true)
    expect(canManageTarget(owner, actor('m1', ['manager']))).toBe(true)
  })

  it('a branch_manager manages only lower ranks who share one of their branches', () => {
    const bm = actor('b1', ['branch_manager'], ['d'])
    expect(canManageTarget(bm, actor('k', ['cashier'], ['d']))).toBe(true)
    expect(canManageTarget(bm, actor('k2', ['cashier'], ['r']))).toBe(false)
    expect(canManageTarget(bm, actor('b2', ['branch_manager'], ['d']))).toBe(false)
    expect(canManageTarget(bm, actor('m', ['manager'], ['d']))).toBe(false)
  })

  it('cashier, employee and viewer manage nobody', () => {
    for (const role of ['cashier', 'employee', 'viewer']) {
      expect(canManageTarget(actor('x', [role], ['d']), actor('y', ['employee'], ['d']))).toBe(false)
      expect(assignableRoles([role])).toEqual([])
    }
  })

  it('assignable roles never exceed the actor tier', () => {
    expect(assignableRoles(['owner'])).toContain('owner')
    expect(assignableRoles(['manager'])).not.toContain('manager')
    expect(assignableRoles(['manager'])).not.toContain('owner')
    expect(assignableRoles(['branch_manager'])).toEqual(['cashier', 'employee', 'viewer'])
  })

  it('branch choices: org-wide for owner/manager, own branches for branch_manager', () => {
    const all = ['d', 'r', 'b']
    expect(assignableBranchIds(actor('m', ['manager']), all)).toEqual(all)
    expect(assignableBranchIds(actor('b', ['branch_manager'], ['d']), all)).toEqual(['d'])
    expect(assignableBranchIds(actor('k', ['cashier'], ['d']), all)).toEqual([])
  })

  it('employee code changes are owner/manager only', () => {
    const target = actor('k', ['cashier'], ['d'])
    expect(canChangeEmployeeCode(actor('m', ['manager']), target)).toBe(true)
    expect(canChangeEmployeeCode(actor('b', ['branch_manager'], ['d']), target)).toBe(false)
  })

  it('settings: thresholds owner/manager; shift settings also a branch_manager in their own branch', () => {
    expect(canEditThresholds(['manager'])).toBe(true)
    expect(canEditThresholds(['branch_manager'])).toBe(false)
    const bm = actor('b', ['branch_manager'], ['d'])
    expect(canEditShiftSettings(bm, 'd')).toBe(true)
    expect(canEditShiftSettings(bm, 'r')).toBe(false)
    expect(canEditShiftSettings(actor('m', ['manager']), 'r')).toBe(true)
  })

  it('grantable / revocable role lists respect the hierarchy', () => {
    const manager = actor('m', ['manager'])
    const target = actor('k', ['cashier'], ['d'])
    expect(grantableRolesFor(manager, target)).toEqual(['branch_manager', 'employee', 'viewer'])
    expect(revocableRolesFor(manager, target)).toEqual(['cashier'])
    expect(grantableRolesFor(manager, actor('o', ['owner']))).toEqual([])
    expect(revocableRolesFor(actor('b', ['branch_manager'], ['d']), actor('m2', ['manager'], ['d']))).toEqual([])
  })
})
