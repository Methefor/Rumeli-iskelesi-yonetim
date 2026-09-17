import { supabase } from './client'

export interface ShiftDefinitionSummary {
  id: string
  key: string
  name: string
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
}

export interface ShiftSummary {
  id: string
  branchId: string
  branchName: string
  businessDate: string
  status: string
  definition: ShiftDefinitionSummary
}

export interface ShiftAssignmentSummary {
  assignmentId: string
  status: string
  isOnTime: boolean | null
  lateOverride: boolean | null
  shift: ShiftSummary
}

interface ShiftAssignmentRow {
  id: string
  status: string
  is_on_time: boolean | null
  late_override: boolean | null
  shifts: {
    id: string
    branch_id: string
    business_date: string
    status: string
    branches: { name: string } | null
    shift_definitions: {
      id: string
      key: string
      name: string
      start_hour: number
      start_minute: number
      end_hour: number
      end_minute: number
    } | null
  } | null
}

function mapAssignmentRow(row: ShiftAssignmentRow): ShiftAssignmentSummary | null {
  if (!row.shifts || !row.shifts.shift_definitions) return null
  return {
    assignmentId: row.id,
    status: row.status,
    isOnTime: row.is_on_time,
    lateOverride: row.late_override,
    shift: {
      id: row.shifts.id,
      branchId: row.shifts.branch_id,
      branchName: row.shifts.branches?.name ?? '',
      businessDate: row.shifts.business_date,
      status: row.shifts.status,
      definition: {
        id: row.shifts.shift_definitions.id,
        key: row.shifts.shift_definitions.key,
        name: row.shifts.shift_definitions.name,
        startHour: row.shifts.shift_definitions.start_hour,
        startMinute: row.shifts.shift_definitions.start_minute,
        endHour: row.shifts.shift_definitions.end_hour,
        endMinute: row.shifts.shift_definitions.end_minute,
      },
    },
  }
}

/** The signed-in employee's own shift assignments, most recent business_date first. */
export async function listMyShiftAssignments(userId: string): Promise<ShiftAssignmentSummary[]> {
  const { data, error } = await supabase
    .from('shift_assignments')
    .select(
      'id, status, is_on_time, late_override, shifts(id, branch_id, business_date, status, branches(name), shift_definitions(id, key, name, start_hour, start_minute, end_hour, end_minute))',
    )
    .eq('user_id', userId)
    .order('id', { ascending: false })
    .limit(20)
    .returns<ShiftAssignmentRow[]>()

  if (error || !data) return []
  return data.map(mapAssignmentRow).filter((row): row is ShiftAssignmentSummary => row !== null)
}

interface ShiftRow {
  id: string
  branch_id: string
  business_date: string
  status: string
  branches: { name: string } | null
  shift_definitions: {
    id: string
    key: string
    name: string
    start_hour: number
    start_minute: number
    end_hour: number
    end_minute: number
  } | null
}

function mapShiftRow(row: ShiftRow): ShiftSummary | null {
  if (!row.shift_definitions) return null
  return {
    id: row.id,
    branchId: row.branch_id,
    branchName: row.branches?.name ?? '',
    businessDate: row.business_date,
    status: row.status,
    definition: {
      id: row.shift_definitions.id,
      key: row.shift_definitions.key,
      name: row.shift_definitions.name,
      startHour: row.shift_definitions.start_hour,
      startMinute: row.shift_definitions.start_minute,
      endHour: row.shift_definitions.end_hour,
      endMinute: row.shift_definitions.end_minute,
    },
  }
}

/** Shifts visible to the caller for a branch (RLS scopes this to the caller's own branches unless org-wide). */
export async function listBranchShifts(branchId: string): Promise<ShiftSummary[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select('id, branch_id, business_date, status, branches(name), shift_definitions(id, key, name, start_hour, start_minute, end_hour, end_minute)')
    .eq('branch_id', branchId)
    .order('business_date', { ascending: false })
    .limit(50)
    .returns<ShiftRow[]>()

  if (error || !data) return []
  return data.map(mapShiftRow).filter((row): row is ShiftSummary => row !== null)
}

export interface BranchOption {
  id: string
  key: string
  name: string
}

export async function listBranches(): Promise<BranchOption[]> {
  const { data, error } = await supabase.from('branches').select('id, key, name').eq('is_active', true)
  if (error || !data) return []
  return data
}

export async function listShiftDefinitions(branchId: string): Promise<ShiftDefinitionSummary[]> {
  const { data, error } = await supabase
    .from('shift_definitions')
    .select('id, key, name, start_hour, start_minute, end_hour, end_minute')
    .eq('branch_id', branchId)
    .eq('is_active', true)
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    startHour: row.start_hour,
    startMinute: row.start_minute,
    endHour: row.end_hour,
    endMinute: row.end_minute,
  }))
}

export interface BranchEmployee {
  id: string
  fullName: string
  employeeCode: string | null
}

/** Employees who are members of a branch (RLS scopes visibility to the caller's own branches unless org-wide). */
export async function listBranchEmployees(branchId: string): Promise<BranchEmployee[]> {
  const { data, error } = await supabase
    .from('branch_memberships')
    .select('profiles(id, full_name, employee_code)')
    .eq('branch_id', branchId)
    .returns<Array<{ profiles: { id: string; full_name: string; employee_code: string | null } | null }>>()

  if (error || !data) return []
  return data
    .map((row) => row.profiles)
    .filter((p): p is { id: string; full_name: string; employee_code: string | null } => p !== null)
    .map((p) => ({ id: p.id, fullName: p.full_name, employeeCode: p.employee_code }))
}

export async function scheduleShift(input: {
  branchId: string
  shiftDefinitionId: string
  businessDate: string
  reason?: string
}): Promise<{ shiftId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('schedule_shift', {
    p_branch_id: input.branchId,
    p_shift_definition_id: input.shiftDefinitionId,
    p_business_date: input.businessDate,
    p_reason: input.reason ?? null,
  })
  return { shiftId: error ? null : (data as string), error: error?.message ?? null }
}

export async function assignShift(input: {
  shiftId: string
  userId: string
  reason?: string
}): Promise<{ assignmentId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('assign_shift', {
    p_shift_id: input.shiftId,
    p_user_id: input.userId,
    p_reason: input.reason ?? null,
  })
  return { assignmentId: error ? null : (data as string), error: error?.message ?? null }
}

export async function confirmShiftAssignment(assignmentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_shift_assignment_status', {
    p_assignment_id: assignmentId,
    p_new_status: 'confirmed',
  })
  return { error: error?.message ?? null }
}
