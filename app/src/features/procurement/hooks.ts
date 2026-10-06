import { canProcurement, type ProcurementPermission } from '../../domain/procurement'
import { useAuth } from '../../hooks/useAuth'
import { useSelectedBranch } from '../../hooks/useSelectedBranch'

/** Who is acting and where, plus a UI-visibility permission check (the server re-checks everything). */
export function useProcurementContext() {
  const { roles } = useAuth()
  const { selectedBranchId, selectedBranch } = useSelectedBranch()
  return {
    roles,
    branchId: selectedBranchId,
    branchName: selectedBranch?.name ?? '',
    can: (permission: ProcurementPermission) => canProcurement(roles, permission),
  }
}

export const PROCUREMENT_BASE = '/app/manager/procurement'
