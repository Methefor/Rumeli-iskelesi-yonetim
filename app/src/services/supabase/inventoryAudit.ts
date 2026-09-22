import { supabase } from './client'
import { friendlyFromSupabaseError } from '../errors'
export interface InventoryAuditEntry {
  id: string
  actorId: string | null
  actorName: string
  action: string
  entityId: string | null
  reason: string | null
  at: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}
export async function listInventoryAudit(
  branchId: string,
  limit = 100,
): Promise<InventoryAuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id,actor_user_id,action,entity_id,reason,created_at,old_values,new_values')
    .in('action', [
      'inventory_adjustment',
      'inventory_movement_reversal',
      'inventory_count_void',
    ])
    .or(`new_values->>branch_id.eq.${branchId},old_values->>branch_id.eq.${branchId}`)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error)
    throw new Error(friendlyFromSupabaseError(error) ?? 'Denetim kayıtları yüklenemedi.')
  const rows = data ?? []
  const ids = [
    ...new Set(rows.flatMap((r) => (r.actor_user_id ? [r.actor_user_id as string] : []))),
  ]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: profiles, error: e } = await supabase
      .from('profiles')
      .select('id,full_name')
      .in('id', ids)
    if (e)
      throw new Error(friendlyFromSupabaseError(e) ?? 'Kullanıcı bilgileri yüklenemedi.')
    for (const p of profiles ?? []) names.set(p.id, p.full_name)
  }
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actor_user_id,
    actorName: names.get(r.actor_user_id) ?? r.actor_user_id ?? 'Sistem',
    action: r.action,
    entityId: r.entity_id,
    reason: r.reason,
    at: r.created_at,
    before: r.old_values,
    after: r.new_values,
  }))
}
