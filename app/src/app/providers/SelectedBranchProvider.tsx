import { useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useAsync } from '../../hooks/useAsync'
import { listBranches } from '../../services/data'
import { SelectedBranchContext } from './SelectedBranchContext'

const STORAGE_PREFIX = 'v4-selected-branch'

function readStored(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * One shared branch selection for every screen in a layout, so switching
 * branch in the header applies everywhere (instead of each page holding its
 * own selector). Only branches the user may actually see are offered:
 * owner/manager see all, everyone else only their own memberships. This is
 * navigation convenience — data access is still enforced by RLS.
 */
export function SelectedBranchProvider({ children }: { children: ReactNode }) {
  const { roles, branchIds, user } = useAuth()
  // Keyed per user so one person's selection never leaks to the next login on the same device.
  const storageKey = `${STORAGE_PREFIX}:${user?.id ?? 'anonymous'}`
  const [explicitId, setExplicitId] = useState<string | null>(() =>
    readStored(storageKey),
  )
  const { data: allBranches, loading } = useAsync(
    user ? `branches:${user.id}` : null,
    () => listBranches(),
  )

  const orgWide = roles.includes('owner') || roles.includes('manager')

  const value = useMemo(() => {
    const all = allBranches ?? []
    const branches = orgWide ? all : all.filter((b) => branchIds.includes(b.id))
    const valid = (id: string | null) =>
      id !== null && branches.some((b) => b.id === id) ? id : null
    const selectedBranchId =
      valid(explicitId) ?? valid(branchIds[0] ?? null) ?? branches[0]?.id ?? null

    return {
      branches,
      selectedBranchId,
      selectedBranch: branches.find((b) => b.id === selectedBranchId) ?? null,
      loading,
      canSwitch: branches.length > 1,
      setSelectedBranchId(branchId: string) {
        setExplicitId(branchId)
        try {
          sessionStorage.setItem(storageKey, branchId)
        } catch {
          // Storage can be unavailable (private mode); the selection still works for this render tree.
        }
      },
    }
  }, [allBranches, orgWide, branchIds, explicitId, loading, storageKey])

  return (
    <SelectedBranchContext.Provider value={value}>
      {children}
    </SelectedBranchContext.Provider>
  )
}
