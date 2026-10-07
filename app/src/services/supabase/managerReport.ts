import { supabase } from './client'
import { friendlyErrorMessage } from '../errors'
import type { ManagerReportBranchInput, ManagerReportInputs } from '../../domain/managerReport'

/**
 * Manager report data access: ONE batch read model for all branches (get_manager_report_inputs), so the request count does not grow
 * with the number of branches. The database only bundles the existing analytics snapshots / waste / count read models; nothing is
 * calculated here. A branch the caller may not read comes back as `null` (listed as an unavailable source, never as "all clear").
 */
export type ReportScope = 'daily' | 'weekly'

export async function getManagerReportInputs(branchIds: readonly string[], scope: ReportScope, date: string): Promise<ManagerReportInputs> {
  if (branchIds.length === 0) return {}
  const { data, error } = await supabase.rpc('get_manager_report_inputs', { p_branch_ids: [...branchIds], p_scope: scope, p_date: date })
  if (error) throw new Error(friendlyErrorMessage(error.message, error.code))
  const out: ManagerReportInputs = {}
  for (const id of branchIds) out[id] = null
  for (const row of data as Array<{ branchId: string; input?: Omit<ManagerReportBranchInput, 'branchId'>; error?: string }>) {
    out[row.branchId] = row.input ? { branchId: row.branchId, ...row.input } : null
  }
  return out
}
