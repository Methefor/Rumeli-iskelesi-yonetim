import { describe, expect, test } from 'vitest'
import { DEMO_USERS, demoHomePath, findDemoUser } from './demoUsers'

describe('findDemoUser', () => {
  test('matches M001/2027 as manager', () => {
    const user = findDemoUser('M001', '2027')
    expect(user?.roles).toEqual(['manager'])
    expect(user?.branchName).toBe('Rumeli İskelesi')
  })

  test('matches K001/2027 as cashier', () => {
    const user = findDemoUser('K001', '2027')
    expect(user?.roles).toEqual(['cashier'])
  })

  test('matches D001/2027 as employee in İskele Dondurma', () => {
    const user = findDemoUser('D001', '2027')
    expect(user?.roles).toEqual(['employee'])
    expect(user?.branchName).toBe('İskele Dondurma')
  })

  test('is case-insensitive and trims whitespace on the employee code', () => {
    expect(findDemoUser(' m001 ', '2027')?.employeeCode).toBe('M001')
  })

  test('rejects a known code with the wrong PIN', () => {
    expect(findDemoUser('M001', '0000')).toBeUndefined()
  })

  test('rejects an unknown employee code', () => {
    expect(findDemoUser('Z999', '2027')).toBeUndefined()
  })

  test('every demo user has a unique id and employee code', () => {
    const ids = new Set(DEMO_USERS.map((u) => u.id))
    const codes = new Set(DEMO_USERS.map((u) => u.employeeCode))
    expect(ids.size).toBe(DEMO_USERS.length)
    expect(codes.size).toBe(DEMO_USERS.length)
  })
})

describe('demoHomePath', () => {
  test('sends a manager to /app/manager', () => {
    expect(demoHomePath(findDemoUser('M001', '2027')!)).toBe('/app/manager')
  })

  test('sends a cashier to /app/employee', () => {
    expect(demoHomePath(findDemoUser('K001', '2027')!)).toBe('/app/employee')
  })

  test('sends an employee to /app/employee', () => {
    expect(demoHomePath(findDemoUser('D001', '2027')!)).toBe('/app/employee')
  })
})
