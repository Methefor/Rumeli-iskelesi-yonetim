import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock, setSessionMock, demo } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  setSessionMock: vi.fn(),
  demo: { enabled: false },
}))

vi.mock('./client', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    auth: { setSession: setSessionMock },
  },
}))
vi.mock('./env', () => ({
  get isDemoModeEnabled() {
    return demo.enabled
  },
}))

import { establishSession, requestPinLogin } from './pinLogin'

const httpError = (status: number) => ({
  name: 'FunctionsHttpError',
  context: { status },
})

beforeEach(() => {
  invokeMock.mockReset()
  setSessionMock.mockReset()
  demo.enabled = false
})

describe('requestPinLogin', () => {
  it('sends the normalised employee code and PIN to pin-login and returns the tokens', async () => {
    invokeMock.mockResolvedValue({
      data: { access_token: 'access-1', refresh_token: 'refresh-1' },
      error: null,
    })
    const result = await requestPinLogin({ employeeCode: '  p001 ', pin: '2027' })
    expect(invokeMock).toHaveBeenCalledWith('pin-login', {
      body: { employeeCode: 'P001', pin: '2027' },
    })
    expect(result).toEqual({ ok: true, accessToken: 'access-1', refreshToken: 'refresh-1' })
  })

  it.each([400, 401])('maps HTTP %i to the one generic credential failure', async (status) => {
    invokeMock.mockResolvedValue({ data: null, error: httpError(status) })
    expect(await requestPinLogin({ employeeCode: 'P001', pin: '0000' })).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    })
  })

  it('rejects malformed input locally without any request', async () => {
    for (const input of [
      { employeeCode: '', pin: '2027' },
      { employeeCode: 'P001', pin: '12' },
      { employeeCode: 'P001', pin: 'abcd' },
      { employeeCode: 'P001', pin: '1234567' },
    ]) {
      expect(await requestPinLogin(input)).toEqual({
        ok: false,
        reason: 'invalid_credentials',
      })
    }
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('reports connectivity failures separately from credential failures', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError' } })
    expect(await requestPinLogin({ employeeCode: 'P001', pin: '2027' })).toEqual({
      ok: false,
      reason: 'network',
    })
    invokeMock.mockRejectedValue(new Error('boom'))
    expect(await requestPinLogin({ employeeCode: 'P001', pin: '2027' })).toEqual({
      ok: false,
      reason: 'network',
    })
  })

  it.each([
    ['server error', { data: null, error: httpError(500) }],
    ['relay error', { data: null, error: { name: 'FunctionsRelayError' } }],
    ['no body', { data: null, error: null }],
    ['missing refresh token', { data: { access_token: 'a' }, error: null }],
    ['empty access token', { data: { access_token: '', refresh_token: 'r' }, error: null }],
    ['wrong types', { data: { access_token: 1, refresh_token: 2 }, error: null }],
    ['string body', { data: 'ok', error: null }],
  ])('treats %s as an unexpected response', async (_label, response) => {
    invokeMock.mockResolvedValue(response)
    expect(await requestPinLogin({ employeeCode: 'P001', pin: '2027' })).toEqual({
      ok: false,
      reason: 'unexpected',
    })
  })

  it('never surfaces raw backend text, tokens or the PIN in its result or logs', async () => {
    const spies = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'warn'),
    ]
    invokeMock.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsHttpError', message: 'RAW-BACKEND-TEXT', context: { status: 500 } },
    })
    const result = await requestPinLogin({ employeeCode: 'P001', pin: '2027' })
    expect(JSON.stringify(result)).not.toMatch(/RAW-BACKEND-TEXT|2027/)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    spies.forEach((spy) => spy.mockRestore())
  })

  it('demo mode: makes no request at all', async () => {
    demo.enabled = true
    expect(await requestPinLogin({ employeeCode: 'P001', pin: '2027' })).toEqual({
      ok: false,
      reason: 'unexpected',
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })
})

describe('establishSession', () => {
  it('passes both tokens to supabase.auth.setSession and reports success', async () => {
    setSessionMock.mockResolvedValue({ data: { session: { access_token: 'a' } }, error: null })
    expect(await establishSession({ accessToken: 'a', refreshToken: 'r' })).toBe(true)
    expect(setSessionMock).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' })
  })

  it('reports failure on an error, a missing session, or a throw', async () => {
    setSessionMock.mockResolvedValue({ data: { session: null }, error: { message: 'x' } })
    expect(await establishSession({ accessToken: 'a', refreshToken: 'r' })).toBe(false)
    setSessionMock.mockResolvedValue({ data: { session: null }, error: null })
    expect(await establishSession({ accessToken: 'a', refreshToken: 'r' })).toBe(false)
    setSessionMock.mockRejectedValue(new Error('x'))
    expect(await establishSession({ accessToken: 'a', refreshToken: 'r' })).toBe(false)
  })
})
