import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as session from '../../features/auth/demoSession'
import type { DemoUser } from '../../features/auth/demoUsers'
import { demoManagement as api } from './management'
import { demoState, resetDemoState } from './state'

const D = 'demo-branch-dondurma'
const R = 'demo-branch-rumeli'

function actAs(id: string, roles: string[], branchIds: string[]) {
  const user: DemoUser = {
    id,
    employeeCode: id,
    pin: '2027',
    fullName: id,
    roles,
    branchIds,
    branchName: '',
  }
  vi.spyOn(session, 'currentDemoUser').mockReturnValue(user)
}

beforeEach(() => resetDemoState())
afterEach(() => vi.restoreAllMocks())

describe('demo management API mirrors the server hierarchy', () => {
  it('owner may manage a manager; nobody manages an owner, an equal rank, or themselves', async () => {
    actAs('demo-o001', ['owner'], [])
    expect((await api.setEmployeeActive({ userId: 'demo-m001', isActive: false, reason: 'x' })).error).toBeNull()
    expect((await api.setEmployeeActive({ userId: 'demo-o001', isActive: false, reason: 'x' })).error).toMatch(/Kendi hesabınızı/)
    actAs('demo-m001', ['manager'], [R])
    expect((await api.resetEmployeePin({ userId: 'demo-o001', newPin: '1234', reason: 'x' })).error).toMatch(/yetkiniz yok/)
    expect((await api.setEmployeeActive({ userId: 'demo-m001', isActive: false, reason: 'x' })).error).toMatch(/Kendi hesabınızı/)
  })

  it('a reason is mandatory for every critical action', async () => {
    actAs('demo-m001', ['manager'], [R])
    expect((await api.resetEmployeePin({ userId: 'demo-d001', newPin: '1234', reason: '  ' })).error).toMatch(/Gerekçe/)
    expect((await api.assignEmployeeRole({ userId: 'demo-d001', roleKey: 'viewer', reason: '' })).error).toMatch(/Gerekçe/)
    expect((await api.createEmployee({ employeeCode: 'K123', fullName: 'A', pin: '1234', roleKey: 'cashier', branchIds: [D], reason: '' })).error).toMatch(/Gerekçe/)
  })

  it('manager cannot grant manager/owner; branch_manager cannot grant branch_manager', async () => {
    actAs('demo-m001', ['manager'], [R])
    expect((await api.assignEmployeeRole({ userId: 'demo-d001', roleKey: 'manager', reason: 'x' })).error).toMatch(/yetkiniz yok/)
    expect((await api.assignEmployeeRole({ userId: 'demo-d001', roleKey: 'owner', reason: 'x' })).error).toMatch(/yetkiniz yok/)
    actAs('demo-b001', ['branch_manager'], [D])
    expect((await api.assignEmployeeRole({ userId: 'demo-d001', roleKey: 'branch_manager', reason: 'x' })).error).toMatch(/yetkiniz yok/)
    expect((await api.assignEmployeeRole({ userId: 'demo-d001', roleKey: 'cashier', reason: 'x' })).error).toBeNull()
  })

  it('branch_manager is limited to shared branches and cannot edit codes or thresholds', async () => {
    actAs('demo-b001', ['branch_manager'], [D])
    expect((await api.resetEmployeePin({ userId: 'demo-k001', newPin: '1234', reason: 'x' })).error).toMatch(/yetkiniz yok/)
    expect((await api.resetEmployeePin({ userId: 'demo-d002', newPin: '1234', reason: 'x' })).error).toBeNull()
    expect((await api.setEmployeeCode({ userId: 'demo-d002', employeeCode: 'D909', reason: 'x' })).error).toMatch(/yetkiniz yok/)
    expect((await api.assignEmployeeBranch({ userId: 'demo-d002', branchId: R, reason: 'x' })).error).toMatch(/yetkiniz yok/)
    expect((await api.setReconciliationThresholds({ branchId: D, warningPercentage: 1, errorPercentage: 2, reason: 'x' })).error).toMatch(/yetkiniz yok/)
    expect((await api.listManagementAudit()).length).toBe(0)
  })

  it('cashier and employee are refused everything and see nothing', async () => {
    for (const [id, role] of [['demo-k001', 'cashier'], ['demo-d001', 'employee']] as const) {
      actAs(id, [role], [R])
      expect(await api.listEmployees()).toEqual([])
      expect((await api.resetEmployeePin({ userId: 'demo-d002', newPin: '1234', reason: 'x' })).error).toMatch(/yetkiniz yok/)
      expect((await api.createEmployee({ employeeCode: 'K124', fullName: 'A', pin: '1234', roleKey: 'employee', branchIds: [R], reason: 'x' })).error).toMatch(/yetkiniz yok/)
      expect(await api.listManagementAudit()).toEqual([])
    }
  })

  it('creates an employee only inside the actor scope, rejects duplicate codes, and audits without the PIN', async () => {
    actAs('demo-b001', ['branch_manager'], [D])
    expect((await api.createEmployee({ employeeCode: 'K300', fullName: 'X', pin: '1234', roleKey: 'branch_manager', branchIds: [D], reason: 'r' })).error).toMatch(/yetkiniz yok/)
    expect((await api.createEmployee({ employeeCode: 'K300', fullName: 'X', pin: '1234', roleKey: 'cashier', branchIds: [R], reason: 'r' })).error).toMatch(/yetkiniz yok/)
    actAs('demo-m001', ['manager'], [R])
    const ok = await api.createEmployee({ employeeCode: 'k300', fullName: ' Yeni ', pin: '4321', roleKey: 'cashier', branchIds: [D], reason: 'işe alım' })
    expect(ok.error).toBeNull()
    expect((await api.createEmployee({ employeeCode: 'K300', fullName: 'Y', pin: '4321', roleKey: 'cashier', branchIds: [D], reason: 'r' })).error).toMatch(/kullanımda/)
    expect((await api.createEmployee({ employeeCode: 'K301', fullName: 'Y', pin: '4321', roleKey: 'manager', branchIds: [], reason: 'r' })).error).toMatch(/yetkiniz yok/)
    const audit = await api.listManagementAudit()
    expect(audit[0]).toMatchObject({ action: 'employee_create', reason: 'işe alım' })
    expect(JSON.stringify(audit)).not.toContain('4321')
    expect(demoState().employees.find((e) => e.employeeCode === 'K300')?.fullName).toBe('Yeni')
  })

  it('records actor, time, reason and before/after for role and PIN changes', async () => {
    actAs('demo-m001', ['manager'], [R])
    await api.assignEmployeeRole({ userId: 'demo-d001', roleKey: 'viewer', reason: 'ek yetki' })
    await api.resetEmployeePin({ userId: 'demo-d001', newPin: '9876', reason: 'unuttu' })
    const [pin, role] = await api.listManagementAudit()
    expect(pin).toMatchObject({ action: 'pin_reset', reason: 'unuttu', actorId: 'demo-m001' })
    expect(JSON.stringify(pin)).not.toContain('9876')
    expect(role).toMatchObject({ action: 'role_change', reason: 'ek yetki' })
    expect(role?.before).toEqual({ roles: ['employee'] })
    expect(role?.after).toMatchObject({ granted: 'viewer' })
    expect(Date.parse(role!.at)).not.toBeNaN()
  })

  it('thresholds: validation and audit before/after', async () => {
    actAs('demo-m001', ['manager'], [R])
    expect((await api.setReconciliationThresholds({ branchId: D, warningPercentage: 8, errorPercentage: 4, reason: 'x' })).error).toMatch(/geçersiz/)
    expect((await api.setReconciliationThresholds({ branchId: D, warningPercentage: 3, errorPercentage: 6, reason: 'sezon' })).error).toBeNull()
    expect((await api.getReconciliationThresholds(D))?.warningPercentage).toBe(3)
    const [entry] = await api.listManagementAudit()
    expect(entry?.before).toEqual({ warning_percentage: 2, error_percentage: 5 })
    expect(entry?.after).toEqual({ warning_percentage: 3, error_percentage: 6 })
  })
})
