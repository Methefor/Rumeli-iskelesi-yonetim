import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../services/supabase/client'
import { isDemoModeEnabled } from '../../services/supabase/env'
import {
  fetchAuthorizationContext,
  signOut as signOutRequest,
} from '../../services/supabase/auth'
import { findDemoUser, type DemoUser } from '../../features/auth/demoUsers'
import {
  clearStoredDemoCredentials,
  readStoredDemoCredentials,
  storeDemoCredentials,
} from '../../features/auth/demoSession'
import { AuthContext, type AuthProfile, type AuthStatus } from './AuthContext'

interface AuthState {
  status: AuthStatus
  session: Session | null
  user: User | null
  roles: string[]
  branchIds: string[]
  profile: AuthProfile | null
  isDemo: boolean
}

const initialState: AuthState = {
  status: 'loading',
  session: null,
  user: null,
  roles: [],
  branchIds: [],
  profile: null,
  isDemo: false,
}

const unauthenticatedState: AuthState = {
  status: 'unauthenticated',
  session: null,
  user: null,
  roles: [],
  branchIds: [],
  profile: null,
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

/** "M001 — Demo Yönetici" -> "Demo Yönetici" (the code is shown separately). */
function demoDisplayName(demoUser: DemoUser): string {
  const parts = demoUser.fullName.split(' — ')
  return parts.length > 1 ? parts.slice(1).join(' — ') : demoUser.fullName
}

function demoState(demoUser: DemoUser): AuthState {
  return {
    status: 'authenticated',
    session: null,
    user: toDemoAuthUser(demoUser),
    roles: demoUser.roles,
    branchIds: demoUser.branchIds,
    profile: { fullName: demoDisplayName(demoUser), employeeCode: demoUser.employeeCode },
    isDemo: true,
  }
}

/** Synchronous — sessionStorage + an array lookup, safe as a lazy useState initializer. */
function restoreDemoState(): AuthState | null {
  if (!isDemoModeEnabled) return null
  const stored = readStoredDemoCredentials()
  if (!stored) return null
  const demoUser = findDemoUser(stored.employeeCode, stored.pin)
  return demoUser ? demoState(demoUser) : null
}

/**
 * Restores/tracks the Supabase Auth session and, once one exists, loads the
 * user's roles/branch memberships. This never reads a `?cashier_id=` URL
 * parameter or any other client-supplied identity — the only source of
 * truth is the Supabase session itself (or, in Preview-only demo mode, the
 * synthetic demoUsers directory — see DECISIONS.md).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    if (isDemoModeEnabled) return restoreDemoState() ?? unauthenticatedState
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
        if (mountedRef.current) setState(unauthenticatedState)
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
          profile: authz.profile ?? null,
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
      profile: state.profile,
      isDemo: state.isDemo,
      signInDemo(employeeCode: string, pin: string) {
        if (!isDemoModeEnabled) return null
        const demoUser = findDemoUser(employeeCode, pin)
        if (!demoUser) return null
        storeDemoCredentials(demoUser)
        setState(demoState(demoUser))
        return { roles: demoUser.roles }
      },
      async signOut() {
        if (state.isDemo) {
          clearStoredDemoCredentials()
          setState(unauthenticatedState)
          return
        }
        await signOutRequest()
      },
    }),
    [state],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
