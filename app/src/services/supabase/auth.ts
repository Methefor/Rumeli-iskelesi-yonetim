import { supabase } from './client'

export interface AuthorizationContext {
  roles: string[]
  branchIds: string[]
}

const EMPTY_CONTEXT: AuthorizationContext = { roles: [], branchIds: [] }

/**
 * Loads the current user's roles + branch memberships from the Phase D
 * schema (`user_roles`/`roles`/`branch_memberships` — see
 * supabase/migrations/001-003, NOT YET APPLIED to production).
 *
 * TODO(Phase D): until those migrations are applied, these queries will
 * fail (relation does not exist) and this deliberately degrades to an
 * empty authorization context rather than throwing — the caller (AuthProvider)
 * treats "no roles known yet" as a real, displayable state, not a crash.
 * This function starts working automatically the moment the schema exists;
 * nothing here needs to change.
 */
export async function fetchAuthorizationContext(
  userId: string,
): Promise<AuthorizationContext> {
  try {
    const [rolesResult, membershipsResult] = await Promise.all([
      supabase.from('user_roles').select('roles(key)').eq('user_id', userId),
      supabase.from('branch_memberships').select('branch_id').eq('user_id', userId),
    ])

    if (rolesResult.error || membershipsResult.error) {
      return EMPTY_CONTEXT
    }

    const roles = (rolesResult.data ?? [])
      .map((row) => (row as { roles?: { key?: string } | null }).roles?.key)
      .filter((key): key is string => Boolean(key))

    const branchIds = (membershipsResult.data ?? [])
      .map((row) => (row as { branch_id?: string }).branch_id)
      .filter((id): id is string => Boolean(id))

    return { roles, branchIds }
  } catch {
    return EMPTY_CONTEXT
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
