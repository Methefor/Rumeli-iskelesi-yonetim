import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../services/supabase/client'
import { isDemoModeEnabled } from '../../services/supabase/env'
import {
  fetchAuthorizationContext,
  signOut as signOutRequest,
} from '../../services/supabase/auth'
import { findDemoUser, type DemoUser } from '../../features/auth/demoUsers'
import { AuthContext, type AuthStatus } from './AuthContext'

const DEMO_STORAGE_KEY = 'v4-demo-employee-code'

interface AuthState {
  status: AuthStatus
  session: Session | null
  user: User | null
  roles: string[]
  branchIds: string[]
  isDemo: boolean
}

const initialState: AuthState = {
  status: 'loading',
  session: null,
  user: null,
  roles: [],
  branchIds: [],
  isDemo: false,
}

const demoUnauthenticatedState: AuthState = {
  status: 'unauthenticated',
  session: null,
  user: null,
  roles: [],
  branchIds: [],
  isDemo: false,
}

/** A minimal, valid supabase-js User for a demo identity — never sent anywhere, only held in memory/sessionStorage. */
function toDemoAuthUser(demoUser: DemoUser): User {
  return {
    id: demoUser.id,
    app_metadata: {},
    user_metadata: { full_name: demoUser.fullName },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  }
}

function demoState(demoUser: DemoUser): AuthState {
  return {
    status: 'authenticated',
    session: null,
    user: toDemoAuthUser(demoUser),
    roles: demoUser.roles,
    branchIds: demoUser.branchIds,
    isDemo: true,
  }
}

/**
 * Restores/tracks the Supabase Auth session and, once one exists, loads the
 * user's roles/branch memberships. This never reads a `?cashier_id=` URL
 * parameter or any other client-supplied identity — the only source of
 * truth is the Supabase session itself (or, in Preview-only demo mode, the
 * synthetic demoUsers directory — see DECISIONS.md).
 */
/** Synchronous — sessionStorage + an array lookup, safe as a lazy useState initializer. */
function restoreDemoState(): AuthState | null {
  if (!isDemoModeEnabled) return null
  const stored = readStoredDemoCredentials()
  if (!stored) return null
  const demoUser = findDemoUser(stored.employeeCode, stored.pin)
  return demoUser ? demoState(demoUser) : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    if (isDemoModeEnabled) return restoreDemoState() ?? demoUnauthenticatedState
    return initialState
  })
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    // Demo mode never touches the real Supabase auth path — the state
    // above (restored from sessionStorage, or "unauthenticated" if there
    // was nothing to restore) is already final. This is also what keeps
    // demo mode from ever calling supabase.auth.getSession() against
    // whatever (possibly fake/Preview-only) Supabase URL is configured.
    if (isDemoModeEnabled) {
      return
    }

    async function applySession(session: Session | null) {
      if (!session) {
        if (mountedRef.current) {
          setState({
            status: 'unauthenticated',
            session: null,
            user: null,
            roles: [],
            branchIds: [],
            isDemo: false,
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
          isDemo: false,
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
      isDemo: state.isDemo,
      signInDemo(employeeCode: string, pin: string) {
        if (!isDemoModeEnabled) return null
        const demoUser = findDemoUser(employeeCode, pin)
        if (!demoUser) return null
        sessionStorage.setItem(DEMO_STORAGE_KEY, `${demoUser.employeeCode}:${demoUser.pin}`)
        setState(demoState(demoUser))
        return { roles: demoUser.roles }
      },
      async signOut() {
        if (state.isDemo) {
          sessionStorage.removeItem(DEMO_STORAGE_KEY)
          setState({
            status: 'unauthenticated',
            session: null,
            user: null,
            roles: [],
            branchIds: [],
            isDemo: false,
          })
          return
        }
        await signOutRequest()
      },
    }),
    [state],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * DEMO_STORAGE_KEY stores "CODE:PIN" together so a page reload re-validates
 * against demoUsers (via findDemoUser) rather than trusting a bare,
 * unverified employee code read back from storage.
 */
function readStoredDemoCredentials(): { employeeCode: string; pin: string } | null {
  const stored = sessionStorage.getItem(DEMO_STORAGE_KEY)
  if (!stored) return null
  const separatorIndex = stored.indexOf(':')
  if (separatorIndex === -1) return null
  return { employeeCode: stored.slice(0, separatorIndex), pin: stored.slice(separatorIndex + 1) }
}
