/**
 * Preview-only synthetic demo directory — never real accounts, never a
 * network call. Gated entirely behind VITE_DEMO_MODE (see
 * services/supabase/env.ts); this module has no Supabase import and no
 * side effects, so it is safe to import even when demo mode is off.
 *
 * PINs are intentionally uniform and obviously fake (2027, the project's
 * own "V4/2027" codename) — this is a demo fixture, not a credential.
 */
export interface DemoUser {
  id: string
  employeeCode: string
  pin: string
  fullName: string
  roles: string[]
  branchIds: string[]
  branchName: string
}

export const DEMO_USERS: readonly DemoUser[] = [
  {
    id: 'demo-m001',
    employeeCode: 'M001',
    pin: '2027',
    fullName: 'M001 — Demo Yönetici',
    roles: ['manager'],
    branchIds: ['demo-branch-rumeli'],
    branchName: 'Rumeli İskelesi',
  },
  {
    id: 'demo-k001',
    employeeCode: 'K001',
    pin: '2027',
    fullName: 'K001 — Demo Kasiyer',
    roles: ['cashier'],
    branchIds: ['demo-branch-rumeli'],
    branchName: 'Rumeli İskelesi',
  },
  {
    id: 'demo-d001',
    employeeCode: 'D001',
    pin: '2027',
    fullName: 'D001 — Demo Çalışan',
    roles: ['employee'],
    branchIds: ['demo-branch-dondurma'],
    branchName: 'İskele Dondurma',
  },
]

const MANAGER_ROLES = ['owner', 'manager', 'branch_manager']

/** The employee-code/PIN match, or undefined — case/whitespace-insensitive on the code, exact on the PIN. */
export function findDemoUser(employeeCode: string, pin: string): DemoUser | undefined {
  const normalizedCode = employeeCode.trim().toUpperCase()
  return DEMO_USERS.find((u) => u.employeeCode === normalizedCode && u.pin === pin)
}

/** Home route for a set of role keys — mirrors the router's manager/employee split. */
export function homePathForRoles(roles: readonly string[]): string {
  return roles.some((role) => MANAGER_ROLES.includes(role)) ? '/app/manager' : '/app/employee'
}

/** Where a demo user should land after "logging in" — mirrors the real router's role split. */
export function demoHomePath(user: DemoUser): string {
  return user.roles.some((role) => MANAGER_ROLES.includes(role))
    ? '/app/manager'
    : '/app/employee'
}
