import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Button,
  DataBoundary,
  EmptyState,
  Input,
  Note,
  PageHeader,
  Select,
  Stack,
  StatusChip,
} from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import {
  assignableBranchIds,
  canChangeEmployeeCode,
  canManageTarget,
  canUseManagementCenter,
  grantableRolesFor,
  revocableRolesFor,
} from '../../../domain/management'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../hooks/useToast'
import {
  assignEmployeeBranch,
  assignEmployeeRole,
  listBranches,
  listEmployees,
  removeEmployeeBranch,
  resetEmployeePin,
  revokeEmployeeRole,
  setEmployeeActive,
  setEmployeeCode,
  type ManagedEmployee,
  type MgmtResult,
} from '../../../services/data'
import { roleLabel } from '../../../utils/roles'
import { ReasonSheet } from '../ReasonSheet'

type Action =
  | { kind: 'active'; next: boolean }
  | { kind: 'pin' }
  | { kind: 'code' }
  | { kind: 'grant'; role: string }
  | { kind: 'revoke'; role: string }
  | { kind: 'branchAdd'; branchId: string }
  | { kind: 'branchRemove'; branchId: string }

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, roles, branchIds } = useAuth()
  const { showToast } = useToast()
  const allowed = canUseManagementCenter(roles)
  const data = useAsync(allowed && user && id ? `mgmt-employee:${id}` : null, async () => {
    const [employees, branches] = await Promise.all([listEmployees(), listBranches()])
    return { employee: employees.find((e) => e.id === id) ?? null, branches }
  })
  const [action, setAction] = useState<Action | null>(null)
  const [saving, setSaving] = useState(false)
  const [pin, setPin] = useState('')
  const [newCode, setNewCode] = useState('')
  const [roleToGrant, setRoleToGrant] = useState('')
  const [branchToAdd, setBranchToAdd] = useState('')

  if (!allowed || !user) return <Unauthorized message="Çalışan yönetimi için yetkiniz yok." />

  const actor = { id: user.id, roles, branchIds }

  function close() {
    setAction(null)
    setPin('')
    setNewCode('')
    setRoleToGrant('')
    setBranchToAdd('')
  }

  async function run(reason: string, target: ManagedEmployee) {
    if (!action) return
    setSaving(true)
    let result: MgmtResult
    switch (action.kind) {
      case 'active':
        result = await setEmployeeActive({ userId: target.id, isActive: action.next, reason })
        break
      case 'pin':
        result = await resetEmployeePin({ userId: target.id, newPin: pin, reason })
        break
      case 'code':
        result = await setEmployeeCode({ userId: target.id, employeeCode: newCode, reason })
        break
      case 'grant':
        result = await assignEmployeeRole({ userId: target.id, roleKey: action.role, reason })
        break
      case 'revoke':
        result = await revokeEmployeeRole({ userId: target.id, roleKey: action.role, reason })
        break
      case 'branchAdd':
        result = await assignEmployeeBranch({ userId: target.id, branchId: action.branchId, reason })
        break
      default:
        result = await removeEmployeeBranch({ userId: target.id, branchId: action.branchId, reason })
    }
    setSaving(false)
    setPin('') // a typed PIN never outlives the request
    if (result.error) {
      showToast(result.error, 'danger')
      return
    }
    showToast('İşlem kaydedildi', 'success')
    close()
    data.reload()
  }

  const titles: Record<Action['kind'], string> = {
    active: 'Durumu değiştir',
    pin: 'PIN sıfırla',
    code: 'Çalışan kodunu değiştir',
    grant: 'Rol ver',
    revoke: 'Rolü kaldır',
    branchAdd: 'Şubeye ekle',
    branchRemove: 'Şubeden çıkar',
  }

  return (
    <Stack>
      <PageHeader
        title="Çalışan"
        back={{ to: '/app/manager/management/employees', label: 'Çalışanlar' }}
      />
      <DataBoundary state={data} rows={3}>
        {({ employee, branches }) => {
          if (!employee) {
            return <EmptyState icon="👤" title="Çalışan bulunamadı" description="Kayıt yok veya erişiminiz yok." />
          }
          const manageable = canManageTarget(actor, employee)
          const grantable = grantableRolesFor(actor, employee)
          const revocable = revocableRolesFor(actor, employee)
          const addable = assignableBranchIds(
            actor,
            branches.map((b) => b.id),
          ).filter((b) => !employee.branchIds.includes(b))
          const nameOf = (b: string) => branches.find((x) => x.id === b)?.name ?? 'Şube'
          const isSelf = employee.id === user.id

          const pinReady = /^\d{4,6}$/.test(pin)
          const codeReady = /^[A-Za-z][0-9]{2,4}$/.test(newCode.trim())
          const ready =
            action?.kind === 'pin'
              ? pinReady
              : action?.kind === 'code'
                ? codeReady
                : action?.kind === 'grant'
                  ? action.role !== ''
                  : true

          return (
            <Stack>
              <Stack gap="sm">
                <h2>{employee.fullName}</h2>
                <p>
                  {employee.employeeCode ?? 'Kodsuz'}{' '}
                  <StatusChip tone={employee.isActive ? 'success' : 'danger'}>
                    {employee.isActive ? 'Aktif' : 'Pasif'}
                  </StatusChip>
                </p>
                <p>Roller: {employee.roles.map(roleLabel).join(', ') || 'Yok'}</p>
                <p>Şubeler: {employee.branchIds.map(nameOf).join(', ') || 'Yok'}</p>
              </Stack>

              {!manageable && (
                <Note>
                  {isSelf
                    ? 'Kendi hesabınızı bu ekrandan değiştiremezsiniz.'
                    : 'Bu kullanıcı üzerinde işlem yetkiniz yok.'}
                </Note>
              )}

              {manageable && (
                <Stack gap="sm">
                  <Button
                    variant={employee.isActive ? 'danger' : 'secondary'}
                    onClick={() => setAction({ kind: 'active', next: !employee.isActive })}
                  >
                    {employee.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                  </Button>
                  <Button variant="secondary" onClick={() => setAction({ kind: 'pin' })}>
                    PIN Sıfırla
                  </Button>
                  {canChangeEmployeeCode(actor, employee) && (
                    <Button variant="secondary" onClick={() => setAction({ kind: 'code' })}>
                      Çalışan Kodunu Değiştir
                    </Button>
                  )}

                  {grantable.length > 0 && (
                    <>
                      <Select
                        label="Rol ver"
                        value={roleToGrant}
                        placeholder="Rol seçin"
                        onChange={(e) => setRoleToGrant(e.target.value)}
                        options={grantable.map((r) => ({ value: r, label: roleLabel(r) }))}
                      />
                      <Button
                        variant="secondary"
                        disabled={!roleToGrant}
                        onClick={() => setAction({ kind: 'grant', role: roleToGrant })}
                      >
                        Rolü Ver
                      </Button>
                    </>
                  )}
                  {revocable.map((r) => (
                    <Button
                      key={r}
                      variant="ghost"
                      onClick={() => setAction({ kind: 'revoke', role: r })}
                    >
                      {roleLabel(r)} rolünü kaldır
                    </Button>
                  ))}

                  {addable.length > 0 && (
                    <>
                      <Select
                        label="Şubeye ekle"
                        value={branchToAdd}
                        placeholder="Şube seçin"
                        onChange={(e) => setBranchToAdd(e.target.value)}
                        options={addable.map((b) => ({ value: b, label: nameOf(b) }))}
                      />
                      <Button
                        variant="secondary"
                        disabled={!branchToAdd}
                        onClick={() => setAction({ kind: 'branchAdd', branchId: branchToAdd })}
                      >
                        Şubeye Ekle
                      </Button>
                    </>
                  )}
                  {employee.branchIds
                    .filter((b) => assignableBranchIds(actor, [b]).length > 0)
                    .map((b) => (
                      <Button
                        key={b}
                        variant="ghost"
                        onClick={() => setAction({ kind: 'branchRemove', branchId: b })}
                      >
                        {nameOf(b)} şubesinden çıkar
                      </Button>
                    ))}
                </Stack>
              )}

              <ReasonSheet
                open={action !== null}
                title={action ? titles[action.kind] : ''}
                confirmLabel="Onayla"
                tone={action?.kind === 'active' && !employee.isActive ? 'primary' : action?.kind === 'active' || action?.kind === 'revoke' || action?.kind === 'branchRemove' ? 'danger' : 'primary'}
                loading={saving}
                ready={ready}
                onConfirm={(reason) => void run(reason, employee)}
                onCancel={close}
              >
                <Stack gap="sm">
                  <p>{employee.fullName}</p>
                  {action?.kind === 'pin' && (
                    <Input
                      label="Yeni PIN"
                      hint="4-6 rakam. Onaydan sonra görüntülenemez."
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="new-password"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    />
                  )}
                  {action?.kind === 'code' && (
                    <Input
                      label="Yeni çalışan kodu"
                      hint="Bir harf ve 2-4 rakam"
                      value={newCode}
                      maxLength={5}
                      onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    />
                  )}
                  {action?.kind === 'active' && !action.next && (
                    <Note>
                      Pasifleştirilen çalışan hemen giriş yapamaz; açık oturumları da
                      sunucuda geçersiz olur.
                    </Note>
                  )}
                </Stack>
              </ReasonSheet>
            </Stack>
          )
        }}
      </DataBoundary>
    </Stack>
  )
}
