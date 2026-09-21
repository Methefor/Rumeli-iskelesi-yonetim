const ROLE_LABELS: Record<string, string> = {
  owner: 'Sahip',
  manager: 'Yönetici',
  branch_manager: 'Şube Müdürü',
  cashier: 'Kasiyer',
  employee: 'Çalışan',
  viewer: 'Görüntüleyici',
}

/** Highest authority first — used to pick ONE label for a user who holds several roles. */
const ROLE_PRECEDENCE = [
  'owner',
  'manager',
  'branch_manager',
  'cashier',
  'employee',
  'viewer',
]

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role
}

/** The single most senior role's Turkish label, or an empty string when there are no roles. */
export function primaryRoleLabel(roles: readonly string[]): string {
  const primary = ROLE_PRECEDENCE.find((r) => roles.includes(r)) ?? roles[0]
  return primary ? roleLabel(primary) : ''
}
