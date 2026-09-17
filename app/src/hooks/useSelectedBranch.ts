import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { listBranches, type BranchOption } from '../services/supabase'

/**
 * Resolves which branch a manager screen should show data for: the
 * caller's own branch when they have exactly one (typically a
 * branch_manager), or a full branch list to choose from when they can see
 * more than one (owner/manager, org-wide).
 */
export function useSelectedBranch() {
  const { branchIds } = useAuth()
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [explicitBranchId, setExplicitBranchId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listBranches().then((data) => {
      if (!cancelled) setBranches(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Derived, not stored: the effective selection is whatever the user
  // explicitly picked, else their own branch, else the first branch once
  // loaded. Computing this during render (rather than syncing it into state
  // via an effect) avoids an extra render pass for what is just a fallback
  // chain over already-available values.
  const selectedBranchId = explicitBranchId ?? branchIds[0] ?? branches[0]?.id ?? null

  return { branches, selectedBranchId, setSelectedBranchId: setExplicitBranchId }
}
