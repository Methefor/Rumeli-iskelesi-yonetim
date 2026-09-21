import { useContext } from 'react'
import { SelectedBranchContext } from '../app/providers/SelectedBranchContext'

/**
 * The branch every screen in the current layout is showing data for
 * (chosen in the app-shell header for org-wide roles; otherwise the user's
 * own branch). Must be used under SelectedBranchProvider (both layouts
 * provide it).
 */
export function useSelectedBranch() {
  const ctx = useContext(SelectedBranchContext)
  if (!ctx) {
    throw new Error('useSelectedBranch must be used within a SelectedBranchProvider')
  }
  return ctx
}
