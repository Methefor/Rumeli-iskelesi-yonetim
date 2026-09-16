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
}

export const AuthContext = createContext<AuthContextValue | null>(null)
