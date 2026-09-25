import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { PinLoginFailure } from '../../services/supabase/pinLogin'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

/** Display identity for the app shell — never used for authorization. */
export interface AuthProfile {
  fullName: string
  employeeCode: string | null
}

export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  user: User | null
  /**
   * Role keys for the current user, e.g. ['cashier']. Always empty while
   * status !== 'authenticated', and also empty (not an error) if the
   * Phase D roles schema doesn't exist in the database yet — see
   * services/supabase/auth.ts.
   */
  roles: string[]
  branchIds: string[]
  /** Who is signed in, for display (name + employee code). Null if not loaded. */
  profile: AuthProfile | null
  signOut: () => Promise<void>
  /**
   * True when the current session was created by `signInDemo`, never by a
   * real Supabase session. Drives the "Demo / Preview" indicator — never
   * used for authorization, only display.
   */
  isDemo: boolean
  /**
   * Preview-only: authenticates against the synthetic demoUsers directory,
   * entirely client-side (no network call). No-ops and returns null when
   * `isDemoModeEnabled` is false — see services/supabase/env.ts and
   * DECISIONS.md. Returns the matched demo user's role/branch info so the
   * caller (LoginPage) can redirect appropriately.
   */
  signInDemo: (employeeCode: string, pin: string) => { roles: string[] } | null
  /**
   * Real login through the `pin-login` Edge Function. Resolves `{ ok: true }`
   * only once the session exists AND the user's roles/branches are loaded, so
   * callers can redirect immediately without a half-loaded state. Every
   * authentication failure is the same `invalid_credentials`. Never makes a
   * network call in demo mode.
   */
  signInWithPin: (
    employeeCode: string,
    pin: string,
  ) => Promise<{ ok: true } | { ok: false; reason: PinLoginFailure }>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
