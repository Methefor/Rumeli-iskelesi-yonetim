import type { ReactNode } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { AuthLoading } from '../../../components/navigation/AuthLoading'
import { Unauthorized } from '../../../components/navigation/Unauthorized'

const ORG_WIDE_ROLES = ['owner', 'manager']

export interface BranchGuardProps {
  /** The branch this route/content is scoped to. */
  branchId: string
  children: ReactNode
}

/**
 * Restricts content to users who are members of `branchId` — mirrors the
 * RLS design in RLS_PLAN.md (branch_manager/cashier/employee access is
 * scoped via branch_memberships; owner/manager bypass branch scoping).
 *
 * Not wired into any route yet (Phase B/C ship no branch-specific routes) —
 * ready for Phase E, when branch-scoped screens exist.
 */
export function BranchGuard({ branchId, children }: BranchGuardProps) {
  const { status, roles, branchIds } = useAuth()

  if (status === 'loading') return <AuthLoading />

  const isOrgWide = roles.some((role) => ORG_WIDE_ROLES.includes(role))
  const isMember = branchIds.includes(branchId)

  if (!isOrgWide && !isMember) {
    return <Unauthorized message="Bu şubeye atanmış değilsiniz." />
  }

  return <>{children}</>
}
