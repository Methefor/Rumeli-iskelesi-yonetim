import { createContext } from 'react'
import type { BranchOption } from '../../services/data'

export interface SelectedBranchValue {
  /** Branches this user may switch between (org-wide roles: all; everyone else: their own memberships). */
  branches: BranchOption[]
  selectedBranchId: string | null
  selectedBranch: BranchOption | null
  setSelectedBranchId: (branchId: string) => void
  /** True while the branch list is still loading. */
  loading: boolean
  /** More than one selectable branch — show a switcher. */
  canSwitch: boolean
}

export const SelectedBranchContext = createContext<SelectedBranchValue | null>(null)
