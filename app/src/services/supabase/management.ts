import { supabase } from './client'
import { friendlyErrorMessage, friendlyFromSupabaseError } from '../errors'

/**
 * Management Center data access. Reads go through RLS-scoped table selects;
 * every change goes through an audited RPC (assign_role, admin_reset_pin, ...)
 * or, for creating an employee, the `employee-provision` Edge Function. No
 * service-role key is ever used here. Errors are turned into Turkish,
 * user-safe messages; raw database or function text never leaves this module.
 */
export interface ManagedEmployee {
  id: string
  fullName: string
  employeeCode: string | null
  isActive: boolean
  roles: string[]
  branchIds: string[]
}

interface EmployeeRow {
  id: string
  full_name: string
  employee_code: string | null
  is_active: boolean
  user_roles: Array<{ roles: { key: string } | null }> | null
  branch_memberships: Array<{ branch_id: string }> | null
}

export async function listEmployees(): Promise<ManagedEmployee[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, employee_code, is_active, user_roles!user_id(roles(key)), branch_memberships!user_id(branch_id)',
    )
    .order('full_name')
    .returns<EmployeeRow[]>()
  if (error) throw new Error(friendlyFromSupabaseError(error) ?? friendlyErrorMessage())
  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    employeeCode: row.employee_code,
    isActive: row.is_active,
    roles: (row.user_roles ?? [])
      .map((r) => r.roles?.key)
      .filter((k): k is string => Boolean(k)),
    branchIds: (row.branch_memberships ?? []).map((b) => b.branch_id),
  }))
}

export interface MgmtResult {
  error: string | null
}

async function callRpc(name: string, args: Record<string, unknown>): Promise<MgmtResult> {
  const { error } = await supabase.rpc(name, args)
  return { error: friendlyFromSupabaseError(error) }
}

export const setEmployeeActive = (input: { userId: string; isActive: boolean; reason: string }) =>
  callRpc('admin_set_employee_active', {
    p_user_id: input.userId,
    p_is_active: input.isActive,
    p_reason: input.reason,
  })

export const resetEmployeePin = (input: { userId: string; newPin: string; reason: string }) =>
  callRpc('admin_reset_pin', {
    p_user_id: input.userId,
    p_new_pin: input.newPin,
    p_reason: input.reason,
  })

export const setEmployeeCode = (input: { userId: string; employeeCode: string; reason: string }) =>
  callRpc('admin_set_employee_code', {
    p_user_id: input.userId,
    p_employee_code: input.employeeCode,
    p_reason: input.reason,
  })

export const assignEmployeeRole = (input: { userId: string; roleKey: string; reason: string }) =>
  callRpc('assign_role', {
    p_user_id: input.userId,
    p_role_key: input.roleKey,
    p_reason: input.reason,
  })

export const revokeEmployeeRole = (input: { userId: string; roleKey: string; reason: string }) =>
  callRpc('revoke_role', {
    p_user_id: input.userId,
    p_role_key: input.roleKey,
    p_reason: input.reason,
  })

export const assignEmployeeBranch = (input: {
  userId: string
  branchId: string
  reason: string
}) =>
  callRpc('assign_branch_membership', {
    p_user_id: input.userId,
    p_branch_id: input.branchId,
    p_is_primary: false,
    p_reason: input.reason,
  })

export const removeEmployeeBranch = (input: {
  userId: string
  branchId: string
  reason: string
}) =>
  callRpc('remove_branch_membership', {
    p_user_id: input.userId,
    p_branch_id: input.branchId,
    p_reason: input.reason,
  })

export interface CreateEmployeeInput {
  employeeCode: string
  fullName: string
  /** Temporary PIN: collected here once, sent to the function, never stored or shown again. */
  pin: string
  roleKey: string
  branchIds: string[]
  reason: string
}

export interface CreateEmployeeResult {
  userId: string | null
  error: string | null
}

const PROVISION_MESSAGES: Record<string, string> = {
  code_taken: 'Bu çalışan kodu zaten kullanımda.',
  forbidden: 'Bu işlem için yetkiniz yok.',
  invalid_request: 'Girilen bilgiler geçersiz. Lütfen kontrol edin.',
  unauthorized: 'Oturumunuz geçersiz. Lütfen tekrar giriş yapın.',
}
const PROVISION_FAILED =
  'Çalışan oluşturulamadı. Lütfen tekrar deneyin; sorun sürerse sistem yöneticisine bildirin.'

export async function createEmployee(input: CreateEmployeeInput): Promise<CreateEmployeeResult> {
  try {
    const { data, error } = await supabase.functions.invoke('employee-provision', {
      body: {
        employeeCode: input.employeeCode.trim().toUpperCase(),
        fullName: input.fullName.trim(),
        pin: input.pin,
        roleKey: input.roleKey,
        branchIds: input.branchIds,
        reason: input.reason.trim(),
      },
    })
    if (error) {
      if (error.name === 'FunctionsFetchError') {
        return { userId: null, error: friendlyErrorMessage('failed to fetch') }
      }
      let code: string | undefined
      try {
        const body = (await (error as { context?: Response }).context?.json()) as
          | { error?: string }
          | undefined
        code = body?.error
      } catch {
        code = undefined
      }
      return { userId: null, error: (code && PROVISION_MESSAGES[code]) || PROVISION_FAILED }
    }
    const userId = (data as { userId?: unknown } | null)?.userId
    if (typeof userId !== 'string') return { userId: null, error: PROVISION_FAILED }
    return { userId, error: null }
  } catch {
    return { userId: null, error: PROVISION_FAILED }
  }
}

// ---------------------------------------------------------------------------
// Supported settings: shift definitions and reconciliation thresholds
// ---------------------------------------------------------------------------
export interface ShiftSettings {
  id: string
  branchId: string
  key: string
  name: string
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
  cutoffHour: number
  cutoffMinute: number
  cutoffDayOffset: number
  isActive: boolean
}

export async function listShiftSettings(branchId: string): Promise<ShiftSettings[]> {
  const { data, error } = await supabase
    .from('shift_definitions')
    .select(
      'id, branch_id, key, name, start_hour, start_minute, end_hour, end_minute, cutoff_hour, cutoff_minute, cutoff_day_offset, is_active',
    )
    .eq('branch_id', branchId)
    .order('start_hour')
  if (error) throw new Error(friendlyFromSupabaseError(error) ?? friendlyErrorMessage())
  return (data ?? []).map((r) => ({
    id: r.id,
    branchId: r.branch_id,
    key: r.key,
    name: r.name,
    startHour: r.start_hour,
    startMinute: r.start_minute,
    endHour: r.end_hour,
    endMinute: r.end_minute,
    cutoffHour: r.cutoff_hour,
    cutoffMinute: r.cutoff_minute,
    cutoffDayOffset: r.cutoff_day_offset,
    isActive: r.is_active,
  }))
}

export const updateShiftSettings = (input: ShiftSettings & { reason: string }) =>
  callRpc('admin_update_shift_definition', {
    p_id: input.id,
    p_name: input.name,
    p_start_hour: input.startHour,
    p_start_minute: input.startMinute,
    p_end_hour: input.endHour,
    p_end_minute: input.endMinute,
    p_cutoff_hour: input.cutoffHour,
    p_cutoff_minute: input.cutoffMinute,
    p_cutoff_day_offset: input.cutoffDayOffset,
    p_is_active: input.isActive,
    p_reason: input.reason,
  })

export interface BranchThresholds {
  branchId: string
  warningPercentage: number
  errorPercentage: number
}

export async function getReconciliationThresholds(
  branchId: string,
): Promise<BranchThresholds | null> {
  const { data, error } = await supabase
    .from('reconciliation_thresholds')
    .select('branch_id, warning_percentage, error_percentage')
    .eq('branch_id', branchId)
    .maybeSingle()
  if (error) throw new Error(friendlyFromSupabaseError(error) ?? friendlyErrorMessage())
  if (!data) return null
  return {
    branchId: data.branch_id,
    warningPercentage: Number(data.warning_percentage),
    errorPercentage: Number(data.error_percentage),
  }
}

export const setReconciliationThresholds = (input: BranchThresholds & { reason: string }) =>
  callRpc('admin_set_reconciliation_thresholds', {
    p_branch_id: input.branchId,
    p_warning: input.warningPercentage,
    p_error: input.errorPercentage,
    p_reason: input.reason,
  })

// ---------------------------------------------------------------------------
// Critical-action audit trail (owner/manager only, enforced by RLS)
// ---------------------------------------------------------------------------
export const MANAGEMENT_AUDIT_ACTIONS = [
  'employee_create',
  'employee_activation',
  'employee_deactivation',
  'employee_code_change',
  'pin_reset',
  'pin_lockout',
  'role_change',
  'role_revoke',
  'branch_assignment',
  'shift_definition_change',
  'reconciliation_threshold_change',
] as const

export interface ManagementAuditEntry {
  id: string
  action: string
  actorId: string | null
  actorName: string
  /** Display name of the affected employee when the entity is a person. */
  targetName: string | null
  reason: string | null
  at: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export async function listManagementAudit(limit = 100): Promise<ManagementAuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id,actor_user_id,action,entity_id,reason,created_at,old_values,new_values')
    .in('action', [...MANAGEMENT_AUDIT_ACTIONS])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(friendlyFromSupabaseError(error) ?? friendlyErrorMessage())
  const rows = data ?? []
  const ids = [
    ...new Set(
      rows.flatMap((r) => [r.actor_user_id, r.entity_id].filter((v): v is string => Boolean(v))),
    ),
  ]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: profiles } = await supabase.from('profiles').select('id,full_name').in('id', ids)
    for (const p of profiles ?? []) names.set(p.id, p.full_name)
  }
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorId: r.actor_user_id,
    actorName: (r.actor_user_id && names.get(r.actor_user_id)) || 'Sistem',
    targetName: (r.entity_id && names.get(r.entity_id)) || null,
    reason: r.reason,
    at: r.created_at,
    before: r.old_values,
    after: r.new_values,
  }))
}
