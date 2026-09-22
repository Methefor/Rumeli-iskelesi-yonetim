import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as session from '../../features/auth/demoSession'
import { DEMO_STORAGE_KEY } from '../../features/auth/demoSession'
import { demoApi } from './api'
import { demoState, resetDemoState } from './state'
import { theoreticalQuantity } from './store'
afterEach(() => vi.restoreAllMocks())
const D = 'demo-branch-dondurma'
const signIn = (code: string) => sessionStorage.setItem(DEMO_STORAGE_KEY, `${code}:2027`)
beforeEach(() => {
  sessionStorage.clear()
  resetDemoState()
})
it('records actor, reason, time and before/after; only management reads oversight', async () => {
  signIn('D001')
  const actor = session.currentDemoUser()!
  // Two different mocked roles, since the rollback: adjust + void-count are
  // branch_manager (D001's own branch, Dondurma); reversal is owner/manager
  // only. See services/demo/api.ts reverseInventoryMovement. Neither role can
  // read the audit itself — only owner/manager (isOrgWide) can, checked below
  // while still acting as branch_manager, i.e. not yet org-wide.
  const actorMock = vi
    .spyOn(session, 'currentDemoUser')
    .mockReturnValue({ ...actor, roles: ['branch_manager'] })
  const before = theoreticalQuantity(demoState(), 'demo-item-a')
  expect(
    (
      await demoApi.recordInventoryAdjustment({
        itemId: 'demo-item-a',
        direction: 'IN',
        quantity: 2,
        reason: 'Sayım farkı',
      })
    ).error,
  ).toBeNull()
  const movement = demoState().movements.at(-1)!
  const count = demoState().counts[0]!
  expect(
    (await demoApi.voidInventoryCount({ countId: count.id, reason: 'Tekrar sayılacak' }))
      .error,
  ).toBeNull()
  expect(await demoApi.listInventoryAudit(D)).toEqual([])
  actorMock.mockReturnValue({ ...actor, roles: ['manager'] })
  expect(
    (
      await demoApi.reverseInventoryMovement({
        movementId: movement.id,
        reason: 'Yanlış kayıt',
      })
    ).error,
  ).toBeNull()
  actorMock.mockRestore()
  signIn('M001')
  const entries = await demoApi.listInventoryAudit(D)
  expect(entries).toHaveLength(3)
  expect(entries.every((e) => e.actorId === 'demo-d001' && e.reason && e.at)).toBe(true)
  // Newest first: [reversal, void, adjustment].
  expect(entries[2]?.before?.theoretical_quantity).toBe(before)
  expect(entries[2]?.after?.theoretical_quantity).toBe(before + 2)
  expect(entries[1]?.before?.status).toBe('submitted')
  expect(entries[1]?.after?.status).toBe('voided')
  expect(entries[0]?.after?.theoretical_quantity).toBe(before)
  expect(await demoApi.listInventoryAudit('demo-branch-rumeli')).toEqual([])
  expect(await demoApi.listInventoryAudit(D, 1)).toHaveLength(1)
})
it('branch_manager can adjust and void-count in their own branch but cannot reverse a movement', async () => {
  signIn('D001')
  const actor = session.currentDemoUser()!
  const actorMock = vi
    .spyOn(session, 'currentDemoUser')
    .mockReturnValue({ ...actor, roles: ['branch_manager'] })
  const adjustResult = await demoApi.recordInventoryAdjustment({
    itemId: 'demo-item-a',
    direction: 'IN',
    quantity: 2,
    reason: 'branch_manager own-branch adjustment',
  })
  expect(adjustResult.error).toBeNull()
  const movement = demoState().movements.at(-1)!
  const reverseResult = await demoApi.reverseInventoryMovement({
    movementId: movement.id,
    reason: 'branch_manager attempt',
  })
  expect(reverseResult.error).toMatch(/yetkiniz/)
  const count = demoState().counts[0]!
  const voidResult = await demoApi.voidInventoryCount({
    countId: count.id,
    reason: 'branch_manager own-branch void',
  })
  expect(voidResult.error).toBeNull()
  actorMock.mockRestore()
})

it('failed operations never create audit records', async () => {
  signIn('K001')
  await demoApi.recordInventoryAdjustment({
    itemId: 'demo-item-a',
    direction: 'IN',
    quantity: 2,
    reason: 'Wrong branch',
  })
  signIn('D001')
  await demoApi.recordInventoryAdjustment({
    itemId: 'demo-item-a',
    direction: 'IN',
    quantity: 2,
    reason: '',
  })
  expect(demoState().inventoryAudit).toEqual([])
})
