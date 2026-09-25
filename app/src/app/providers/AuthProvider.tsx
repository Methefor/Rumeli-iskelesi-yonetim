import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../../services/supabase/client'
import { isDemoModeEnabled } from '../../services/supabase/env'
import {
  fetchAuthorizationContext,
  signOut as signOutRequest,
} from '../../services/supabase/auth'
import {
  establishSession,
  requestPinLogin,
  type PinLoginFailure,
} from '../../services/supabase/pinLogin'
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
  // Only the newest authorization lookup may write state: a slow lookup for an
  // old session must never overwrite a newer login/logout.
  const sequenceRef = useRef(0)
  // While signInWithPin is applying its own session, the SIGNED_IN event it
  // triggers is skipped so the lookup is not done twice.
  const explicitSignInRef = useRef(false)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  /**
   * Applies a session. Fail-closed: if the user's authorization cannot be
   * loaded, the profile is inactive, or they hold no role, the session is
   * discarded and the app is unauthenticated. Returns whether the session
   * was honoured.
   */
  const applySession = useCallback(async (session: Session | null): Promise<boolean> => {
    const sequence = ++sequenceRef.current
    if (!session) {
      if (mountedRef.current) setState(unauthenticatedState)
      return false
    }

    const authz = await fetchAuthorizationContext(session.user.id)
    if (!mountedRef.current || sequence !== sequenceRef.current) return false

    if (!authz.active) {
      setState(unauthenticatedState)
      try {
        await signOutRequest()
      } catch {
        // Local session state is already cleared above; nothing else to do.
      }
      return false
    }

    setState({
      status: 'authenticated',
      session,
      user: session.user,
      roles: authz.roles,
      branchIds: authz.branchIds,
      profile: authz.profile ?? null,
      isDemo: false,
    })
    return true
  }, [])

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

    supabase.auth.getSession().then(({ data }) => {
      void applySession(data.session)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && explicitSignInRef.current) return
      // A silent access-token refresh keeps the same user: swap the session in
      // place instead of reloading authorization (which would flash the whole
      // app back to "loading").
      const current = stateRef.current
      if (
        event === 'TOKEN_REFRESHED' &&
        session &&
        current.status === 'authenticated' &&
        current.user?.id === session.user.id
      ) {
        setState({ ...current, session, user: session.user })
        return
      }
      void applySession(session)
    })

    return () => {
      mountedRef.current = false
      subscription.subscription.unsubscribe()
    }
  }, [applySession])

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
      async signInWithPin(
        employeeCode: string,
        pin: string,
      ): Promise<{ ok: true } | { ok: false; reason: PinLoginFailure }> {
        if (isDemoModeEnabled) return { ok: false, reason: 'unexpected' }
        const result = await requestPinLogin({ employeeCode, pin })
        if (!result.ok) return result
        explicitSignInRef.current = true
        try {
          if (!(await establishSession(result))) return { ok: false, reason: 'unexpected' }
          const { data } = await supabase.auth.getSession()
          const honoured = await applySession(data.session)
          return honoured ? { ok: true } : { ok: false, reason: 'unexpected' }
        } finally {
          explicitSignInRef.current = false
        }
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
    [state, applySession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
