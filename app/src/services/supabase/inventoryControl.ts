import { supabase } from './client'
import { friendlyErrorMessage, friendlyFromSupabaseError } from '../errors'
import type {
  BranchCountOverview,
  CountReview,
  WasteReasonRow,
  WasteReport,
} from '../../domain/inventory/control'

/**
 * Fire reasons, fire report, and closing-count review. Every number is calculated by the
 * database (supabase/migrations/20261006000200..400); this module only fetches and maps. Authorization
 * (permission + branch scope + cost visibility) is enforced by RLS and the RPCs.
 */

export interface ControlResult {
  error: string | null
}

function failRead(error: { message?: string; code?: string }): never {
  throw new Error(friendlyErrorMessage(error.message, error.code))
}

interface ReasonRow {
  id: string
  code: string
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
}

/** Active reasons for entry; managers also see inactive ones (RLS decides). */
export async function listWasteReasons(): Promise<WasteReasonRow[]> {
  const { data, error } = await supabase
    .from('waste_reasons')
    .select('id, code, name, description, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) failRead(error)
  return (data as ReasonRow[]).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    isActive: r.is_active,
    sortOrder: r.sort_order,
  }))
}

export interface UpsertWasteReasonInput {
  id: string | null
  code: string
  name: string
  description: string | null
  sortOrder: number
  reason: string
}

export async function upsertWasteReason(input: UpsertWasteReasonInput): Promise<ControlResult> {
  const { error } = await supabase.rpc('upsert_waste_reason', {
    p_reason_id: input.id,
    p_code: input.code,
    p_name: input.name,
    p_description: input.description,
    p_sort_order: input.sortOrder,
    p_reason: input.reason,
  })
  return { error: friendlyFromSupabaseError(error) }
}

export async function setWasteReasonActive(reasonId: string, active: boolean, reason: string): Promise<ControlResult> {
  const { error } = await supabase.rpc('set_waste_reason_active', { p_reason_id: reasonId, p_active: active, p_reason: reason })
  return { error: friendlyFromSupabaseError(error) }
}

export async function getWasteReport(branchId: string, from: string, to: string): Promise<WasteReport> {
  const { data, error } = await supabase.rpc('get_waste_report', { p_branch_id: branchId, p_from: from, p_to: to })
  if (error) failRead(error)
  return data as WasteReport
}

export async function getInventoryCountReview(countId: string): Promise<CountReview> {
  const { data, error } = await supabase.rpc('get_inventory_count_review', { p_count_id: countId })
  if (error) failRead(error)
  return data as CountReview
}

export async function getBranchCountOverview(branchId: string): Promise<BranchCountOverview> {
  const { data, error } = await supabase.rpc('get_branch_count_overview', { p_branch_id: branchId, p_limit: 10 })
  if (error) failRead(error)
  return data as BranchCountOverview
}
