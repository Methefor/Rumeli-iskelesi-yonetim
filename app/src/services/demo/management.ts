/**
 * Synthetic Management Center API for Preview demo mode. Same signatures as
 * services/supabase/management.ts (enforced through the DataApi type), zero
 * network, and it only ever mutates the in-memory demo store. The rules come
 * from the same pure module the screens use to hide buttons
 * (domain/management), which mirrors supabase/migrations/016: hierarchy, no
 * self-modification, protected owners, branch scope, mandatory reason. It is
 * a demo aid, not a security boundary; the database is the real one.
 * The demo never stores or checks a PIN.
 */
import {
  assignableBranchIds,
  assignableRoles,
  canChangeEmployeeCode,
  canEditShiftSettings,
  canEditThresholds,
  canManageTarget,
  highestRank,
  type ManagementActor,
} from '../../domain/management'
import { currentDemoUser } from '../../features/auth/demoSession'
import type {
  BranchThresholds,
  CreateEmployeeInput,
  CreateEmployeeResult,
  ManagedEmployee,
  ManagementAuditEntry,
  MgmtResult,
  ShiftSettings,
} from '../supabase/management'
import { demoState } from './state'
import type { DemoEmployee, DemoState } from './store'

const NOT_AUTHORIZED = 'Bu işlem için yetkiniz yok.'
const REASON_REQUIRED = 'Gerekçe zorunludur.'
const CODE_PATTERN = /^[A-Z][0-9]{2,4}$/

function actorOf(state: DemoState): ManagementActor | null {
  const user = currentDemoUser()
  if (!user) return null
  const profile = state.employees.find((e) => e.id === user.id)
  return {
    id: user.id,
    roles: profile?.roles ?? user.roles,
    branchIds: profile?.branchIds ?? user.branchIds,
  }
}

function audit(
  state: DemoState,
  actor: ManagementActor,
  action: string,
  entityId: string,
  reason: string | null,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  state.seq += 1
  const target = state.employees.find((e) => e.id === entityId)
  state.managementAudit.push({
    id: `demo-mgmt-audit-${state.seq}`,
    action,
    actorId: actor.id,
    actorName: state.employees.find((e) => e.id === actor.id)?.fullName ?? actor.id,
    targetName: target?.fullName ?? null,
    reason,
    at: state.now().toISOString(),
    before,
    after,
  })
}

/** The shared front door for every action on an existing person. */
function guard(
  reason: string,
  targetId: string,
  branchId?: string,
): { state: DemoState; actor: ManagementActor; target: DemoEmployee } | { error: string } {
  const state = demoState()
  const actor = actorOf(state)
  if (!actor || highestRank(actor.roles) < 2) return { error: NOT_AUTHORIZED }
  if (!reason.trim()) return { error: REASON_REQUIRED }
  const target = state.employees.find((e) => e.id === targetId)
  if (!target) return { error: 'Çalışan bulunamadı.' }
  if (target.id === actor.id) return { error: 'Kendi hesabınızı bu ekrandan değiştiremezsiniz.' }
  if (!canManageTarget(actor, target)) return { error: NOT_AUTHORIZED }
  if (branchId && highestRank(actor.roles) === 2 && !actor.branchIds.includes(branchId)) {
    return { error: NOT_AUTHORIZED }
  }
  return { state, actor, target }
}

const done: MgmtResult = { error: null }

export const demoManagement = {
  async listEmployees(): Promise<ManagedEmployee[]> {
    const state = demoState()
    const actor = actorOf(state)
    if (!actor || highestRank(actor.roles) < 2) return []
    const rank = highestRank(actor.roles)
    return state.employees
      .filter(
        (e) =>
          rank >= 3 ||
          e.id === actor.id ||
          e.branchIds.some((b) => actor.branchIds.includes(b)),
      )
      .map((e) => ({
        id: e.id,
        fullName: e.fullName,
        employeeCode: e.employeeCode,
        isActive: e.isActive,
        roles: [...e.roles],
        branchIds: [...e.branchIds],
      }))
  },

  async createEmployee(input: CreateEmployeeInput): Promise<CreateEmployeeResult> {
    const state = demoState()
    const actor = actorOf(state)
    if (!actor || highestRank(actor.roles) < 2) return { userId: null, error: NOT_AUTHORIZED }
    if (!input.reason.trim()) return { userId: null, error: REASON_REQUIRED }
    const code = input.employeeCode.trim().toUpperCase()
    if (!CODE_PATTERN.test(code) || !/^\d{4,6}$/.test(input.pin) || !input.fullName.trim()) {
      return { userId: null, error: 'Girilen bilgiler geçersiz. Lütfen kontrol edin.' }
    }
    if (!(assignableRoles(actor.roles) as string[]).includes(input.roleKey)) {
      return { userId: null, error: NOT_AUTHORIZED }
    }
    const allowedBranches = assignableBranchIds(
      actor,
      state.branches.map((b) => b.id),
    )
    const orgWideRole = input.roleKey === 'owner' || input.roleKey === 'manager'
    if (
      input.branchIds.some((b) => !allowedBranches.includes(b)) ||
      (!orgWideRole && input.branchIds.length === 0)
    ) {
      return { userId: null, error: NOT_AUTHORIZED }
    }
    if (state.employees.some((e) => e.employeeCode === code)) {
      return { userId: null, error: 'Bu çalışan kodu zaten kullanımda.' }
    }
    state.seq += 1
    const id = `demo-emp-${state.seq}`
    state.employees.push({
      id,
      fullName: input.fullName.trim(),
      employeeCode: code,
      branchIds: [...input.branchIds],
      roles: [input.roleKey],
      isActive: true,
    })
    audit(state, actor, 'employee_create', id, input.reason.trim(), null, {
      employee_code: code,
      role: input.roleKey,
      branch_ids: input.branchIds,
    })
    return { userId: id, error: null }
  },

  async setEmployeeActive(input: { userId: string; isActive: boolean; reason: string }): Promise<MgmtResult> {
    const g = guard(input.reason, input.userId)
    if ('error' in g) return g
    const before = g.target.isActive
    g.target.isActive = input.isActive
    audit(
      g.state,
      g.actor,
      input.isActive ? 'employee_activation' : 'employee_deactivation',
      g.target.id,
      input.reason.trim(),
      { is_active: before },
      { is_active: input.isActive },
    )
    return done
  },

  async resetEmployeePin(input: { userId: string; newPin: string; reason: string }): Promise<MgmtResult> {
    const g = guard(input.reason, input.userId)
    if ('error' in g) return g
    if (!/^\d{4,6}$/.test(input.newPin)) return { error: 'PIN 4-6 haneli olmalıdır.' }
    audit(g.state, g.actor, 'pin_reset', g.target.id, input.reason.trim(), null, null)
    return done
  },

  async setEmployeeCode(input: { userId: string; employeeCode: string; reason: string }): Promise<MgmtResult> {
    const g = guard(input.reason, input.userId)
    if ('error' in g) return g
    if (!canChangeEmployeeCode(g.actor, g.target)) return { error: NOT_AUTHORIZED }
    const code = input.employeeCode.trim().toUpperCase()
    if (!CODE_PATTERN.test(code)) return { error: 'Girilen bilgiler geçersiz. Lütfen kontrol edin.' }
    if (g.state.employees.some((e) => e.employeeCode === code && e.id !== g.target.id)) {
      return { error: 'Bu kayıt zaten mevcut.' }
    }
    const before = g.target.employeeCode
    g.target.employeeCode = code
    audit(g.state, g.actor, 'employee_code_change', g.target.id, input.reason.trim(), { employee_code: before }, { employee_code: code })
    return done
  },

  async assignEmployeeRole(input: { userId: string; roleKey: string; reason: string }): Promise<MgmtResult> {
    const g = guard(input.reason, input.userId)
    if ('error' in g) return g
    if (!(assignableRoles(g.actor.roles) as string[]).includes(input.roleKey)) {
      return { error: NOT_AUTHORIZED }
    }
    const before = [...g.target.roles].sort()
    if (!g.target.roles.includes(input.roleKey)) g.target.roles.push(input.roleKey)
    audit(g.state, g.actor, 'role_change', g.target.id, input.reason.trim(), { roles: before }, { roles: [...g.target.roles].sort(), granted: input.roleKey })
    return done
  },

  async revokeEmployeeRole(input: { userId: string; roleKey: string; reason: string }): Promise<MgmtResult> {
    const g = guard(input.reason, input.userId)
    if ('error' in g) return g
    if (!(assignableRoles(g.actor.roles) as string[]).includes(input.roleKey)) {
      return { error: NOT_AUTHORIZED }
    }
    const before = [...g.target.roles].sort()
    g.target.roles = g.target.roles.filter((r) => r !== input.roleKey)
    audit(g.state, g.actor, 'role_revoke', g.target.id, input.reason.trim(), { roles: before, revoked: input.roleKey }, { roles: [...g.target.roles].sort() })
    return done
  },

  async assignEmployeeBranch(input: { userId: string; branchId: string; reason: string }): Promise<MgmtResult> {
    const g = guard(input.reason, input.userId, input.branchId)
    if ('error' in g) return g
    if (!g.state.branches.some((b) => b.id === input.branchId)) return { error: 'Girilen bilgiler geçersiz. Lütfen kontrol edin.' }
    if (!g.target.branchIds.includes(input.branchId)) g.target.branchIds.push(input.branchId)
    audit(g.state, g.actor, 'branch_assignment', g.target.id, input.reason.trim(), null, { branch_id: input.branchId, is_primary: false })
    return done
  },

  async removeEmployeeBranch(input: { userId: string; branchId: string; reason: string }): Promise<MgmtResult> {
    const g = guard(input.reason, input.userId, input.branchId)
    if ('error' in g) return g
    g.target.branchIds = g.target.branchIds.filter((b) => b !== input.branchId)
    audit(g.state, g.actor, 'branch_assignment', g.target.id, input.reason.trim(), { branch_id: input.branchId }, null)
    return done
  },

  async listShiftSettings(branchId: string): Promise<ShiftSettings[]> {
    const state = demoState()
    const actor = actorOf(state)
    if (!actor || highestRank(actor.roles) < 2) return []
    return state.shiftDefinitions
      .filter((d) => d.branchId === branchId)
      .map((d) => ({
        id: d.id,
        branchId: d.branchId,
        key: d.key,
        name: d.name,
        startHour: d.startHour,
        startMinute: d.startMinute,
        endHour: d.endHour,
        endMinute: d.endMinute,
        cutoffHour: d.cutoffHour,
        cutoffMinute: d.cutoffMinute,
        cutoffDayOffset: d.cutoffDayOffset,
        isActive: d.isActive,
      }))
  },

  async updateShiftSettings(input: ShiftSettings & { reason: string }): Promise<MgmtResult> {
    const state = demoState()
    const actor = actorOf(state)
    const def = state.shiftDefinitions.find((d) => d.id === input.id)
    if (!actor || !def) return { error: 'Vardiya tanımı bulunamadı.' }
    if (!canEditShiftSettings(actor, def.branchId)) return { error: NOT_AUTHORIZED }
    if (!input.reason.trim()) return { error: REASON_REQUIRED }
    if (!input.name.trim()) return { error: 'Girilen bilgiler geçersiz. Lütfen kontrol edin.' }
    const before = { name: def.name, cutoff_hour: def.cutoffHour, cutoff_minute: def.cutoffMinute, cutoff_day_offset: def.cutoffDayOffset, is_active: def.isActive }
    Object.assign(def, {
      name: input.name.trim(),
      startHour: input.startHour,
      startMinute: input.startMinute,
      endHour: input.endHour,
      endMinute: input.endMinute,
      cutoffHour: input.cutoffHour,
      cutoffMinute: input.cutoffMinute,
      cutoffDayOffset: input.cutoffDayOffset,
      isActive: input.isActive,
    })
    audit(state, actor, 'shift_definition_change', def.id, input.reason.trim(), before, { name: def.name, cutoff_hour: def.cutoffHour, cutoff_minute: def.cutoffMinute, cutoff_day_offset: def.cutoffDayOffset, is_active: def.isActive })
    return done
  },

  async getReconciliationThresholds(branchId: string): Promise<BranchThresholds | null> {
    const state = demoState()
    const actor = actorOf(state)
    const t = state.thresholds[branchId]
    if (!actor || highestRank(actor.roles) < 2 || !t) return null
    return { branchId, ...t }
  },

  async setReconciliationThresholds(input: BranchThresholds & { reason: string }): Promise<MgmtResult> {
    const state = demoState()
    const actor = actorOf(state)
    if (!actor || !canEditThresholds(actor.roles)) return { error: NOT_AUTHORIZED }
    if (!input.reason.trim()) return { error: REASON_REQUIRED }
    if (input.warningPercentage < 0 || input.errorPercentage < input.warningPercentage || input.errorPercentage > 100) {
      return { error: 'Girilen bilgiler geçersiz. Lütfen kontrol edin.' }
    }
    const before = state.thresholds[input.branchId]
    if (!before) return { error: 'Girilen bilgiler geçersiz. Lütfen kontrol edin.' }
    state.thresholds[input.branchId] = { warningPercentage: input.warningPercentage, errorPercentage: input.errorPercentage }
    audit(state, actor, 'reconciliation_threshold_change', input.branchId, input.reason.trim(), { warning_percentage: before.warningPercentage, error_percentage: before.errorPercentage }, { warning_percentage: input.warningPercentage, error_percentage: input.errorPercentage })
    return done
  },

  async listManagementAudit(limit = 100): Promise<ManagementAuditEntry[]> {
    const state = demoState()
    const actor = actorOf(state)
    // RLS: only owner/manager read the audit trail.
    if (!actor || highestRank(actor.roles) < 3) return []
    return state.managementAudit.slice().reverse().slice(0, limit)
  },
}
