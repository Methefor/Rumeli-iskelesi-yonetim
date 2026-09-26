import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  DataBoundary,
  Input,
  Note,
  PageHeader,
  Select,
  Stack,
} from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import {
  assignableBranchIds,
  assignableRoles,
  canUseManagementCenter,
} from '../../../domain/management'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../hooks/useToast'
import { createEmployee, listBranches } from '../../../services/data'
import { roleLabel } from '../../../utils/roles'
import { ReasonSheet } from '../ReasonSheet'

/**
 * Creates an employee through the trusted `employee-provision` function. The
 * temporary PIN is typed here once and sent straight to the function; it is
 * never stored client-side, echoed back or shown again — a forgotten PIN is
 * fixed with "PIN sıfırla" on the employee page.
 */
export function EmployeeCreatePage() {
  const { user, roles, branchIds } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const allowedRoles = assignableRoles(roles)
  const branches = useAsync(user ? `mgmt-branches:${user.id}` : null, () => listBranches())
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [roleKey, setRoleKey] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!canUseManagementCenter(roles) || allowedRoles.length === 0 || !user) {
    return <Unauthorized message="Çalışan oluşturma yetkiniz yok." />
  }

  const orgWideRole = roleKey === 'owner' || roleKey === 'manager'
  const codeOk = /^[A-Za-z][0-9]{2,4}$/.test(code.trim())
  const ready =
    codeOk &&
    name.trim().length > 0 &&
    /^\d{4,6}$/.test(pin) &&
    roleKey !== '' &&
    (orgWideRole || chosen.length > 0)

  async function submit(reason: string) {
    setSaving(true)
    const result = await createEmployee({
      employeeCode: code,
      fullName: name,
      pin,
      roleKey,
      branchIds: chosen,
      reason,
    })
    setSaving(false)
    setPin('')
    if (result.error || !result.userId) {
      showToast(result.error ?? 'Çalışan oluşturulamadı.', 'danger')
      setConfirming(false)
      return
    }
    showToast('Çalışan oluşturuldu', 'success')
    navigate(`/app/manager/management/employees/${result.userId}`)
  }

  return (
    <Stack>
      <PageHeader
        title="Yeni Çalışan"
        back={{ to: '/app/manager/management/employees', label: 'Çalışanlar' }}
      />
      <DataBoundary state={branches} rows={2}>
        {(all) => {
          const allowedBranches = assignableBranchIds(
            { id: user.id, roles, branchIds },
            all.map((b) => b.id),
          )
          return (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (ready) setConfirming(true)
              }}
            >
              <Stack>
                <Input
                  label="Çalışan kodu"
                  hint="Bir harf ve 2-4 rakam, örn. K012"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={5}
                  autoComplete="off"
                />
                <Input
                  label="Ad soyad"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  autoComplete="off"
                />
                <Input
                  label="Geçici PIN"
                  hint="4-6 rakam. Yalnızca şimdi girilir, sonra görüntülenemez."
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  autoComplete="new-password"
                />
                <Select
                  label="Rol"
                  value={roleKey}
                  placeholder="Rol seçin"
                  onChange={(e) => setRoleKey(e.target.value)}
                  options={allowedRoles.map((r) => ({ value: r, label: roleLabel(r) }))}
                />
                <fieldset>
                  <legend>Şubeler{orgWideRole ? ' (opsiyonel)' : ' (en az bir)'}</legend>
                  <Stack gap="sm">
                    {all
                      .filter((b) => allowedBranches.includes(b.id))
                      .map((b) => (
                        <label key={b.id}>
                          <input
                            type="checkbox"
                            checked={chosen.includes(b.id)}
                            onChange={(e) =>
                              setChosen((prev) =>
                                e.target.checked
                                  ? [...prev, b.id]
                                  : prev.filter((id) => id !== b.id),
                              )
                            }
                          />{' '}
                          {b.name}
                        </label>
                      ))}
                  </Stack>
                </fieldset>
                <Note>
                  Oluşturulan çalışan bu kod ve geçici PIN ile giriş yapar. E-posta
                  gönderilmez.
                </Note>
                <Button type="submit" size="lg" fullWidth disabled={!ready}>
                  Devam
                </Button>
              </Stack>
            </form>
          )
        }}
      </DataBoundary>

      <ReasonSheet
        open={confirming}
        title="Çalışanı oluştur"
        confirmLabel="Oluştur"
        loading={saving}
        onConfirm={(reason) => void submit(reason)}
        onCancel={() => setConfirming(false)}
      >
        <p>
          {name.trim()} ({code.trim().toUpperCase()}) — {roleKey ? roleLabel(roleKey) : ''}
        </p>
      </ReasonSheet>
    </Stack>
  )
}
