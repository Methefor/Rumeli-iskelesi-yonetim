import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock, rpcMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), rpcMock: vi.fn() }))
vi.mock('./client', () => ({
  supabase: { functions: { invoke: invokeMock }, rpc: rpcMock, from: vi.fn() },
}))

import { createEmployee, resetEmployeePin } from './management'

const input = {
  employeeCode: ' k012 ',
  fullName: ' Ada ',
  pin: '1234',
  roleKey: 'cashier',
  branchIds: ['b1'],
  reason: ' işe alım ',
}

const httpError = (body: unknown) => ({
  name: 'FunctionsHttpError',
  context: { json: () => Promise.resolve(body) },
})

beforeEach(() => {
  invokeMock.mockReset()
  rpcMock.mockReset()
})

describe('createEmployee', () => {
  it('sends normalised values to the employee-provision function and no actor or role authority', async () => {
    invokeMock.mockResolvedValue({ data: { userId: 'u1', employeeCode: 'K012' }, error: null })
    const result = await createEmployee(input)
    expect(result).toEqual({ userId: 'u1', error: null })
    expect(invokeMock).toHaveBeenCalledWith('employee-provision', {
      body: {
        employeeCode: 'K012',
        fullName: 'Ada',
        pin: '1234',
        roleKey: 'cashier',
        branchIds: ['b1'],
        reason: 'işe alım',
      },
    })
    const body = invokeMock.mock.calls[0]![1].body
    expect(Object.keys(body)).not.toContain('actorId')
  })

  it.each([
    ['code_taken', /kullanımda/],
    ['forbidden', /yetkiniz yok/],
    ['invalid_request', /geçersiz/],
    ['unauthorized', /Oturumunuz/],
    ['provision_failed', /oluşturulamadı/],
  ])('maps the %s response to a Turkish message', async (code, pattern) => {
    invokeMock.mockResolvedValue({ data: null, error: httpError({ error: code }) })
    const result = await createEmployee(input)
    expect(result.userId).toBeNull()
    expect(result.error).toMatch(pattern)
  })

  it('never shows raw backend text or a PIN, even for unparseable errors', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsHttpError', message: 'RAW duplicate key value 1234', context: { json: () => Promise.reject(new Error('x')) } },
    })
    const result = await createEmployee(input)
    expect(result.error).not.toMatch(/RAW|duplicate|1234/)
  })

  it('reports connectivity separately and rejects a malformed success body', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError' } })
    expect((await createEmployee(input)).error).toMatch(/Bağlantı/)
    invokeMock.mockResolvedValue({ data: { nope: true }, error: null })
    expect((await createEmployee(input)).userId).toBeNull()
  })
})

describe('management RPC wrappers', () => {
  it('passes the reason and never echoes raw database errors', async () => {
    rpcMock.mockResolvedValue({ error: { code: '42501', message: 'not authorized for a user of equal or higher rank' } })
    const result = await resetEmployeePin({ userId: 'u', newPin: '1234', reason: 'r' })
    expect(rpcMock).toHaveBeenCalledWith('admin_reset_pin', { p_user_id: 'u', p_new_pin: '1234', p_reason: 'r' })
    expect(result.error).toMatch(/yetkiniz yok/)
    expect(result.error).not.toMatch(/equal or higher/)
  })
})
