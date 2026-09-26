export const AUDIT_LABELS: Record<string, string> = {
  employee_create: 'Çalışan oluşturuldu',
  employee_activation: 'Çalışan aktifleştirildi',
  employee_deactivation: 'Çalışan pasifleştirildi',
  employee_code_change: 'Çalışan kodu değişti',
  pin_reset: 'PIN sıfırlandı',
  pin_lockout: 'Hesap kilitlendi (5 hatalı PIN)',
  role_change: 'Rol verildi',
  role_revoke: 'Rol kaldırıldı',
  branch_assignment: 'Şube üyeliği değişti',
  shift_definition_change: 'Vardiya ayarı değişti',
  reconciliation_threshold_change: 'Mutabakat eşiği değişti',
}

/** A short, human summary of before/after values. Never includes a PIN (none is ever stored). */
export function summarizeAudit(
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string {
  const pick = (o: Record<string, unknown> | null, k: string) =>
    o && o[k] !== undefined && o[k] !== null ? String(o[k]) : '—'
  switch (action) {
    case 'employee_activation':
    case 'employee_deactivation':
      return `${pick(before, 'is_active') === 'true' ? 'Aktif' : 'Pasif'} → ${pick(after, 'is_active') === 'true' ? 'Aktif' : 'Pasif'}`
    case 'employee_code_change':
      return `${pick(before, 'employee_code')} → ${pick(after, 'employee_code')}`
    case 'role_change':
    case 'role_revoke':
      return `${pick(before, 'roles')} → ${pick(after, 'roles')}`
    case 'employee_create':
      return `${pick(after, 'employee_code')} · ${pick(after, 'role')}`
    case 'reconciliation_threshold_change':
      return `${pick(before, 'warning_percentage')}/${pick(before, 'error_percentage')} → ${pick(after, 'warning_percentage')}/${pick(after, 'error_percentage')}`
    case 'shift_definition_change':
      return `${pick(before, 'name')} ${pick(before, 'cutoff_hour')}:${pick(before, 'cutoff_minute')} → ${pick(after, 'name')} ${pick(after, 'cutoff_hour')}:${pick(after, 'cutoff_minute')}`
    default:
      return ''
  }
}
