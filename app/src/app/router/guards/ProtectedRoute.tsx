import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { AuthLoading } from '../../../components/navigation/AuthLoading'

export interface ProtectedRouteProps {
  children: ReactNode
}

/**
 * Requires a real Supabase Auth session. Unauthenticated users are sent to
 * `/` (Login) — never granted access based on a URL parameter or any
 * client-supplied identity, unlike the legacy `?cashier_id=` pattern.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { status } = useAuth()

  if (status === 'loading') return <AuthLoading />
  if (status === 'unauthenticated') return <Navigate to="/" replace />

  return <>{children}</>
}
