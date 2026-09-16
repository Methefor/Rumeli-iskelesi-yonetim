import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../services/supabase/client'
import {
  fetchAuthorizationContext,
  signOut as signOutRequest,
} from '../../services/supabase/auth'
import { AuthContext, type AuthStatus } from './AuthContext'

interface AuthState {
  status: AuthStatus
  session: Session | null
  user: User | null
  roles: string[]
  branchIds: string[]
}

const initialState: AuthState = {
  status: 'loading',
  session: null,
  user: null,
  roles: [],
  branchIds: [],
}

/**
 * Restores/tracks the Supabase Auth session and, once one exists, loads the
 * user's roles/branch memberships. This never reads a `?cashier_id=` URL
 * parameter or any other client-supplied identity — the only source of
 * truth is the Supabase session itself.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    async function applySession(session: Session | null) {
      if (!session) {
        if (mountedRef.current) {
          setState({
            status: 'unauthenticated',
            session: null,
            user: null,
            roles: [],
            branchIds: [],
          })
        }
        return
      }

      const authz = await fetchAuthorizationContext(session.user.id)
      if (mountedRef.current) {
        setState({
          status: 'authenticated',
          session,
          user: session.user,
          roles: authz.roles,
          branchIds: authz.branchIds,
        })
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      void applySession(data.session)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session)
    })

    return () => {
      mountedRef.current = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({
      status: state.status,
      session: state.session,
      user: state.user,
      roles: state.roles,
      branchIds: state.branchIds,
      signOut: signOutRequest,
    }),
    [state],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
