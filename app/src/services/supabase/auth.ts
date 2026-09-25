import { supabase } from './client'

export interface UserProfileSummary {
  fullName: string
  employeeCode: string | null
}

export interface AuthorizationContext {
  roles: string[]
  branchIds: string[]
  /** Display identity for the app shell; null when it could not be loaded (never blocks authorization). */
  profile: UserProfileSummary | null
  /**
   * False when the session must NOT be honoured: the lookup failed, the
   * profile is missing or deactivated, or the user holds no role. The
   * caller fails closed (signs out) — an empty context is never "logged in
   * with no permissions".
   */
  active: boolean
}

const DENIED_CONTEXT: AuthorizationContext = {
  roles: [],
  branchIds: [],
  profile: null,
  active: false,
}

/**
 * Loads the current user's roles, branch memberships and profile
 * (supabase/migrations 001-003). FAILS CLOSED: any error, a missing or
 * deactivated profile, or a user with no role returns `active: false` so the
 * caller signs the session out instead of treating "nothing known" as
 * "logged in with no permissions". Authorization is still enforced by RLS;
 * this only decides whether the client honours the session at all.
 */
export async function fetchAuthorizationContext(
  userId: string,
): Promise<AuthorizationContext> {
  try {
    const [rolesResult, membershipsResult, profileResult] = await Promise.all([
      supabase.from('user_roles').select('roles(key)').eq('user_id', userId),
      supabase.from('branch_memberships').select('branch_id').eq('user_id', userId),
      supabase
        .from('profiles')
        .select('full_name, employee_code, is_active')
        .eq('id', userId)
        .maybeSingle(),
    ])

    if (rolesResult.error || membershipsResult.error || profileResult.error) {
      return DENIED_CONTEXT
    }

    const roles = (rolesResult.data ?? [])
      .map((row) => (row as { roles?: { key?: string } | null }).roles?.key)
      .filter((key): key is string => Boolean(key))

    const branchIds = (membershipsResult.data ?? [])
      .map((row) => (row as { branch_id?: string }).branch_id)
      .filter((id): id is string => Boolean(id))

    const profileRow = profileResult.data as {
      full_name?: string
      employee_code?: string | null
      is_active?: boolean
    } | null
    if (!profileRow || profileRow.is_active !== true) return DENIED_CONTEXT
    if (roles.length === 0) return DENIED_CONTEXT

    const profile: UserProfileSummary | null = profileRow?.full_name
      ? { fullName: profileRow.full_name, employeeCode: profileRow.employee_code ?? null }
      : null

    return { roles, branchIds, profile, active: true }
  } catch {
    return DENIED_CONTEXT
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
