import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_STORAGE_KEY } from '../../features/auth/demoSession'
import { addDaysIso, istanbulDate } from '../../utils/dates'
import { demoApi } from './api'
import { resetDemoState } from './state'
import {
  addMovement,
  cancelReport,
  createReport,
  editReport,
  theoreticalQuantity,
} from './store'

function signInAs(code: string) {
  sessionStorage.setItem(DEMO_STORAGE_KEY, `${code}:2027`)
}

const D = 'demo-branch-dondurma'
const R = 'demo-branch-rumeli'
const NOW = new Date('2027-06-15T09:00:00+03:00')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  sessionStorage.clear()
  resetDemoState(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('demo data makes no network requests', () => {
  it('never calls fetch across reads and writes', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    signInAs('M001')
    await demoApi.listBranches()
    await demoApi.listInventoryItems(D)
    await demoApi.listStockBalances(D)
    await demoApi.getInventoryGrossProfit(
      D,
      '2027-06-01T00:00:00Z',
      '2027-06-30T00:00:00Z',
    )
    await demoApi.recordInventoryReceipt({
      branchId: D,
      lines: [{ inventoryItemId: 'demo-item-a', quantity: 5 }],
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('role-scoped demo data (M001 / K001 / D001)', () => {
  it('M001 (manager) sees both branches and Dondurma inventory', async () => {
    signInAs('M001')
    expect((await demoApi.listInventoryItems(D)).length).toBe(5)
    expect((await demoApi.listBranchShifts(R)).length).toBeGreaterThan(0)
  })

  it('K001 (Rumeli cashier) gets Rumeli data and no Dondurma inventory', async () => {
    signInAs('K001')
    expect(await demoApi.listInventoryItems(D)).toEqual([])
    expect(await demoApi.listStockBalances(D)).toEqual([])
    expect(await demoApi.listBranchShifts(D)).toEqual([])
    const mine = await demoApi.listMyShiftAssignments('demo-k001')
    expect(mine.every((a) => a.shift.branchId === R)).toBe(true)
  })

  it('D001 (Dondurma employee) gets Dondurma data', async () => {
    signInAs('D001')
    expect((await demoApi.listInventoryItems(D)).length).toBe(5)
    const mine = await demoApi.listMyShiftAssignments('demo-d001')
    expect(mine.every((a) => a.shift.branchId === D)).toBe(true)
  })

  it('signed-out callers get nothing', async () => {
    expect(await demoApi.listInventoryItems(D)).toEqual([])
  })
})

describe('cost is confidential and privileged', () => {
  it('employee/cashier cannot read or set cost', async () => {
    for (const code of ['D001', 'K001']) {
      signInAs(code)
      expect(await demoApi.listBranchItemCosts(D)).toEqual([])
      await expect(
        demoApi.getInventoryGrossProfit(
          D,
          '2027-06-01T00:00:00Z',
          '2027-06-30T00:00:00Z',
        ),
      ).rejects.toThrow(/yetkiniz/)
      const result = await demoApi.setInventoryItemCost({
        itemId: 'demo-item-a',
        unitCost: 1,
      })
      expect(result.error).toMatch(/yetkiniz/)
    }
  })

  it('manager reads cost history and can only append a later cost', async () => {
    signInAs('M001')
    expect((await demoApi.listBranchItemCosts(D)).length).toBe(4)
    const past = await demoApi.setInventoryItemCost({
      itemId: 'demo-item-a',
      unitCost: 40,
      effectiveFrom: '2000-01-01T00:00:00Z',
    })
    expect(past.error).toMatch(/sonra/)
    const ok = await demoApi.setInventoryItemCost({ itemId: 'demo-item-a', unitCost: 47 })
    expect(ok.error).toBeNull()
    expect((await demoApi.listBranchItemCosts(D)).length).toBe(5)
  })
})

describe('operations follow the permission map', () => {
  it('employee may record waste and submit a count, but not receive or adjust', async () => {
    signInAs('D001')
    expect(
      (
        await demoApi.recordInventoryWaste({
          branchId: D,
          lines: [{ inventoryItemId: 'demo-item-a', quantity: 1 }],
          reasonCode: 'spilled',
        })
      ).error,
    ).toBeNull()
    expect(
      (
        await demoApi.submitInventoryCount({
          branchId: D,
          lines: [{ inventoryItemId: 'demo-item-a', physicalQuantity: 30 }],
        })
      ).error,
    ).toBeNull()
    expect(
      (
        await demoApi.recordInventoryReceipt({
          branchId: D,
          lines: [{ inventoryItemId: 'demo-item-a', quantity: 1 }],
        })
      ).error,
    ).toMatch(/yetkiniz/)
    expect(
      (
        await demoApi.recordInventoryAdjustment({
          itemId: 'demo-item-a',
          direction: 'OUT',
          quantity: 1,
          reason: 'x',
        })
      ).error,
    ).toMatch(/yetkiniz/)
  })

  it('an employee cannot count or waste in a branch they do not belong to', async () => {
    signInAs('K001')
    expect(
      (
        await demoApi.submitInventoryCount({
          branchId: D,
          lines: [{ inventoryItemId: 'demo-item-a', physicalQuantity: 1 }],
        })
      ).error,
    ).toMatch(/yetkiniz/)
    expect(
      (
        await demoApi.recordInventoryWaste({
          branchId: D,
          lines: [{ inventoryItemId: 'demo-item-a', quantity: 1 }],
          reasonCode: 'other',
        })
      ).error,
    ).toMatch(/yetkiniz/)
  })
})

describe('ledger rules in the demo store', () => {
  it('a submitted count never changes theoretical stock', async () => {
    signInAs('D001')
    const before = theoreticalQuantity(resetDemoState(NOW), 'demo-item-a')
    signInAs('D001')
    await demoApi.submitInventoryCount({
      branchId: D,
      lines: [{ inventoryItemId: 'demo-item-a', physicalQuantity: 1 }],
    })
    const balances = await demoApi.listStockBalances(D)
    expect(
      balances.find((b) => b.inventoryItemId === 'demo-item-a')?.theoreticalQuantity,
    ).toBe(before)
  })

  it('editing then cancelling a product sale keeps history and nets to zero', () => {
    const state = resetDemoState(NOW)
    const shift = state.shifts.find(
      (s) =>
        s.branchId === D && s.definition.key === 'evening' && s.status === 'scheduled',
    )!
    const before = theoreticalQuantity(state, 'demo-item-a')
    const at = new Date('2027-06-15T20:00:00+03:00')
    const report = createReport(
      state,
      {
        shiftId: shift.id,
        reportType: 'Z',
        grossRevenue: 300,
        items: [{ inventoryItemId: 'demo-item-a', inventoryQuantity: 2, amount: 300 }],
      },
      'demo-d001',
      at,
    )
    expect(theoreticalQuantity(state, 'demo-item-a')).toBe(before - 2)
    editReport(
      state,
      report.id,
      {
        grossRevenue: 450,
        items: [{ inventoryItemId: 'demo-item-a', inventoryQuantity: 3, amount: 450 }],
      },
      'yanlış miktar',
      'demo-d001',
      at,
    )
    expect(theoreticalQuantity(state, 'demo-item-a')).toBe(before - 3)
    cancelReport(state, report.id, 'çift giriş', 'demo-d001', at)
    expect(theoreticalQuantity(state, 'demo-item-a')).toBe(before)
    const rows = state.movements.filter((m) => m.salesReportId === report.id)
    expect(rows.map((m) => m.type)).toEqual(['SALE', 'REVERSAL', 'SALE', 'REVERSAL'])
  })

  it('a later cost never changes an earlier sale snapshot', () => {
    const state = resetDemoState(NOW)
    const sale = state.movements.find(
      (m) => m.type === 'SALE' && m.inventoryItemId === 'demo-item-a',
    )!
    const snapshot = sale.unitCostSnapshot
    state.costs.push({
      id: 'x',
      inventoryItemId: 'demo-item-a',
      unitCost: 999,
      effectiveFrom: '2027-06-14T00:00:00Z',
      reason: null,
    })
    expect(state.movements.find((m) => m.id === sale.id)?.unitCostSnapshot).toBe(snapshot)
    expect(snapshot).toBe(45)
  })

  it('rejects a category line mixed with product lines in one report', () => {
    const state = resetDemoState(NOW)
    const shift = state.shifts.find((s) => s.branchId === D && s.status === 'scheduled')!
    expect(() =>
      createReport(
        state,
        {
          shiftId: shift.id,
          reportType: 'X',
          grossRevenue: 30,
          items: [
            { categoryId: 'demo-cat-dondurma', amount: 10 },
            { inventoryItemId: 'demo-item-a', inventoryQuantity: 1, amount: 20 },
          ],
        },
        'demo-m001',
        NOW,
      ),
    ).toThrow(/kategoride/)
    expect(() =>
      addMovement(state, {
        itemId: 'demo-item-e',
        type: 'RECEIPT',
        quantity: 1,
        at: NOW,
        createdBy: 'x',
      }),
    ).toThrow(/pasif/)
  })
})

describe('gross profit in the demo data is honest', () => {
  it('complete lines are derived; uncosted and unmapped revenue downgrade the result', async () => {
    signInAs('M001')
    const result = await demoApi.getInventoryGrossProfit(
      D,
      '2027-06-01T00:00:00Z',
      '2027-06-30T00:00:00Z',
    )
    const a = result.lines.find((l) => l.code === 'DEMO-A')!
    expect(a.cogs).toBe(270)
    expect(a.productRevenue).toBe(900)
    const c = result.lines.find((l) => l.code === 'DEMO-C')!
    expect(c.costedQuantity).toBe(0)
    expect(c.uncostedQuantity).toBe(3)
    expect(result.unmappedCategoryRevenue).toBe(700)
  })
})

describe('cashier has no privileged inventory access (rollback)', () => {
  function ownBranchInventory() {
    const state = resetDemoState(NOW)
    const item = state.items.find((i) => i.id === 'demo-item-a')!
    item.branchId = R
    return state
  }

  it('cashier cannot adjust, reverse or void — not even in their own branch', async () => {
    const state = ownBranchInventory()
    signInAs('K001')
    expect(
      (
        await demoApi.recordInventoryAdjustment({
          itemId: 'demo-item-a',
          direction: 'IN',
          quantity: 2,
          reason: 'Sayım farkı',
        })
      ).error,
    ).toMatch(/yetkiniz/)

    const movement = addMovement(state, {
      itemId: 'demo-item-a',
      type: 'ADJUSTMENT_IN',
      quantity: 2,
      at: NOW,
      createdBy: 'demo-m001',
      reason: 'fixture (manager-equivalent)',
    })
    expect(
      (await demoApi.reverseInventoryMovement({ movementId: movement.id, reason: 'x' }))
        .error,
    ).toMatch(/yetkiniz/)

    const count = await demoApi.submitInventoryCount({
      branchId: R,
      lines: [{ inventoryItemId: 'demo-item-a', physicalQuantity: 12 }],
    })
    expect(count.error).toBeNull()
    expect(
      (await demoApi.voidInventoryCount({ countId: count.countId!, reason: 'x' })).error,
    ).toMatch(/yetkiniz/)
  })

  it('cashier cannot correct another branch or attribute count to an unassigned shift', async () => {
    signInAs('K001')
    expect(
      (
        await demoApi.recordInventoryAdjustment({
          itemId: 'demo-item-a',
          direction: 'IN',
          quantity: 1,
          reason: 'x',
        })
      ).error,
    ).toMatch(/yetkiniz/)
    const state = ownBranchInventory()
    const shift = state.shifts.find((s) => s.branchId === R && s.status !== 'cancelled')!
    state.assignments = state.assignments.filter((a) => a.shiftId !== shift.id)
    expect(
      (
        await demoApi.submitInventoryCount({
          branchId: R,
          shiftId: shift.id,
          lines: [{ inventoryItemId: 'demo-item-a', physicalQuantity: 2 }],
        })
      ).error,
    ).toMatch(/atanmış/)
  })
})

describe('manager (org-wide) keeps full adjust/reverse/void, with mandatory reasons', () => {
  it('adjusts, reverses and voids a count in Dondurma with an audited reason', async () => {
    const state = resetDemoState(NOW)
    signInAs('M001')
    const input = {
      itemId: 'demo-item-a',
      direction: 'IN' as const,
      quantity: 2,
      reason: 'Sayım farkı',
    }
    expect(
      (await demoApi.recordInventoryAdjustment({ ...input, reason: ' ' })).error,
    ).toMatch(/Gerekçe/)
    const before = theoreticalQuantity(state, input.itemId)
    expect((await demoApi.recordInventoryAdjustment(input)).error).toBeNull()
    expect(theoreticalQuantity(state, input.itemId)).toBe(before + 2)
    const movement = state.movements.at(-1)!
    expect(movement.createdBy).toBe('demo-m001')
    expect(
      (await demoApi.reverseInventoryMovement({ movementId: movement.id, reason: ' ' }))
        .error,
    ).toMatch(/Gerekçe/)
    expect(
      (
        await demoApi.reverseInventoryMovement({
          movementId: movement.id,
          reason: 'Hatalı düzeltme',
        })
      ).error,
    ).toBeNull()
    expect(theoreticalQuantity(state, input.itemId)).toBe(before)
    expect(
      (
        await demoApi.reverseInventoryMovement({
          movementId: movement.id,
          reason: 'Tekrar',
        })
      ).error,
    ).toBeTruthy()

    const count = await demoApi.submitInventoryCount({
      branchId: D,
      lines: [{ inventoryItemId: 'demo-item-a', physicalQuantity: 12 }],
    })
    expect(count.error).toBeNull()
    const stockBeforeVoid = theoreticalQuantity(state, 'demo-item-a')
    expect(
      (await demoApi.voidInventoryCount({ countId: count.countId!, reason: ' ' })).error,
    ).toMatch(/Gerekçe/)
    expect(
      (
        await demoApi.voidInventoryCount({
          countId: count.countId!,
          reason: 'Yanlış sayım',
        })
      ).error,
    ).toBeNull()
    expect(state.counts.find((c) => c.id === count.countId)?.status).toBe('voided')
    expect(theoreticalQuantity(state, 'demo-item-a')).toBe(stockBeforeVoid)
  })
})

describe('backdated sales report policy (Europe/Istanbul calendar date, mirrors 015)', () => {
  function backdatedShift(state: ReturnType<typeof resetDemoState>, offsetDays: number) {
    const def = state.shiftDefinitions.find((d) => d.branchId === D && d.key === 'evening')!
    const { branchId: _branchId, ...definition } = def
    void _branchId
    const shift = {
      id: `demo-shift-backdated-${offsetDays}`,
      branchId: D,
      branchName: 'İskele Dondurma',
      businessDate: addDaysIso(istanbulDate(NOW), offsetDays),
      status: 'closed' as const,
      definition,
    }
    state.shifts.push(shift)
    return shift
  }

  function assign(state: ReturnType<typeof resetDemoState>, shiftId: string, userId: string) {
    state.assignments.push({
      id: `demo-assign-${shiftId}`,
      shiftId,
      userId,
      status: 'confirmed',
      isOnTime: null,
      lateOverride: null,
    })
  }

  it('employee: -4 days is denied with a clear reason, -3 is allowed', async () => {
    const state = resetDemoState(NOW)
    signInAs('D001')
    const tooOld = backdatedShift(state, -4)
    assign(state, tooOld.id, 'demo-d001')
    const deniedResult = await demoApi.createSalesReport({
      shiftId: tooOld.id,
      reportType: 'Z',
      grossRevenue: 10,
      items: [],
    })
    expect(deniedResult.error).toMatch(/bugün ve önceki 3 gün/)
    expect(deniedResult.reportId).toBeNull()

    const okShift = backdatedShift(state, -3)
    assign(state, okShift.id, 'demo-d001')
    const okResult = await demoApi.createSalesReport({
      shiftId: okShift.id,
      reportType: 'Z',
      grossRevenue: 10,
      items: [],
    })
    expect(okResult.error).toBeNull()
    expect(okResult.reportId).not.toBeNull()
  })

  it('a future business date is always denied, even for a manager', async () => {
    const state = resetDemoState(NOW)
    signInAs('M001')
    const future = backdatedShift(state, 1)
    const result = await demoApi.createSalesReport({
      shiftId: future.id,
      reportType: 'Z',
      grossRevenue: 10,
      items: [],
    })
    expect(result.error).toMatch(/İleri bir tarih/)
    expect(result.reportId).toBeNull()
  })

  it('manager: -4 days requires a reason, then succeeds', async () => {
    const state = resetDemoState(NOW)
    signInAs('M001')
    const tooOld = backdatedShift(state, -5)
    const withoutReason = await demoApi.createSalesReport({
      shiftId: tooOld.id,
      reportType: 'X',
      grossRevenue: 10,
      items: [],
    })
    expect(withoutReason.error).toMatch(/gerekçe/i)
    expect(withoutReason.reportId).toBeNull()

    const withReason = await demoApi.createSalesReport({
      shiftId: tooOld.id,
      reportType: 'X',
      grossRevenue: 10,
      items: [],
      backdatedReason: 'Geç bildirilen kağıt makbuz',
    })
    expect(withReason.error).toBeNull()
    expect(withReason.reportId).not.toBeNull()
  })
})
