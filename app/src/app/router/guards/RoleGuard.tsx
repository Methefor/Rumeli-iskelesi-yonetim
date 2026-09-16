import type { ReactNode } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { AuthLoading } from '../../../components/navigation/AuthLoading'
import { Unauthorized } from '../../../components/navigation/Unauthorized'

export interface RoleGuardProps {
  /** Role keys that may see this route, e.g. ['owner', 'manager']. */
  allow: string[]
  children: ReactNode
}

/**
 * Restricts a route to specific role keys. Assumes a ProtectedRoute already
 * guarantees an authenticated session further up the tree — this only
 * decides whether THAT user's roles are sufficient.
 *
 * NOTE: until the Phase D roles schema is applied, `roles` from useAuth()
 * is always empty (see services/supabase/auth.ts), so every RoleGuard will
 * show Unauthorized for real logged-in users until then. That is the
 * correct, honest behavior for this phase — not a bug to work around here.
 */
export function RoleGuard({ allow, children }: RoleGuardProps) {
  const { status, roles } = useAuth()

  if (status === 'loading') return <AuthLoading />

  const isAllowed = roles.some((role) => allow.includes(role))
  if (!isAllowed) {
    return <Unauthorized message={`Bu sayfa için gereken rol: ${allow.join(', ')}`} />
  }

  return <>{children}</>
}
