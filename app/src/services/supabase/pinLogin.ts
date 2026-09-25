import { supabase } from './client'
import { isDemoModeEnabled } from './env'

/**
 * Client for the `pin-login` Edge Function (supabase/functions/pin-login).
 *
 * Backend contract, taken from the function source — not invented here:
 *   POST { employeeCode, pin }   (pin is /^\d{4,6}$/)
 *   200  { access_token, refresh_token }
 *   400  invalid request body
 *   401  { error: 'invalid_credentials' }   wrong code, wrong PIN, inactive,
 *                                           locked, no PIN row — deliberately
 *                                           indistinguishable
 *   500  { error: 'account_not_provisioned' | 'sign_in_failed' }
 *
 * Every authentication failure collapses into ONE result so the UI cannot
 * reveal whether an account exists, is inactive or is locked. Raw backend
 * text, tokens and the PIN are never returned, thrown or logged.
 */
export type PinLoginFailure = 'invalid_credentials' | 'network' | 'unexpected'

export type PinLoginResult =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; reason: PinLoginFailure }

const PIN_PATTERN = /^\d{4,6}$/

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Calls the function only. Does NOT create a session — see `establishSession`. */
export async function requestPinLogin(input: {
  employeeCode: string
  pin: string
}): Promise<PinLoginResult> {
  // Demo mode must make zero network requests, even if this is imported.
  if (isDemoModeEnabled) return { ok: false, reason: 'unexpected' }

  const employeeCode = input.employeeCode.trim().toUpperCase()
  if (!employeeCode || !PIN_PATTERN.test(input.pin)) {
    return { ok: false, reason: 'invalid_credentials' }
  }

  let data: unknown
  let error: { name?: string; context?: unknown } | null
  try {
    const response = await supabase.functions.invoke('pin-login', {
      body: { employeeCode, pin: input.pin },
    })
    data = response.data
    error = response.error
  } catch {
    return { ok: false, reason: 'network' }
  }

  if (error) {
    if (error.name === 'FunctionsFetchError') return { ok: false, reason: 'network' }
    if (error.name === 'FunctionsHttpError') {
      const status = (error.context as { status?: number } | undefined)?.status
      if (status === 400 || status === 401) {
        return { ok: false, reason: 'invalid_credentials' }
      }
    }
    return { ok: false, reason: 'unexpected' }
  }

  const tokens = data as { access_token?: unknown; refresh_token?: unknown } | null
  if (
    !tokens ||
    typeof tokens !== 'object' ||
    !isNonEmptyString(tokens.access_token) ||
    !isNonEmptyString(tokens.refresh_token)
  ) {
    return { ok: false, reason: 'unexpected' }
  }
  return { ok: true, accessToken: tokens.access_token, refreshToken: tokens.refresh_token }
}

/** Hands the returned tokens to supabase-js so it persists/refreshes the session. */
export async function establishSession(tokens: {
  accessToken: string
  refreshToken: string
}): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    })
    return !error && data.session !== null
  } catch {
    return false
  }
}
