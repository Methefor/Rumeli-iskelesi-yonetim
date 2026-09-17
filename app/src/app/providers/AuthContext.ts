import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

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
}

export const AuthContext = createContext<AuthContextValue | null>(null)
