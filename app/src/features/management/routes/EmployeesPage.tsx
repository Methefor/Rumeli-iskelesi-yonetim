import { useMemo, useState } from 'react'
import {
  DataBoundary,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  RowCard,
  Select,
  Stack,
  StatusChip,
} from '../../../components/ui'
import { assignableRoles, canUseManagementCenter } from '../../../domain/management'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { listBranches, listEmployees } from '../../../services/data'
import { primaryRoleLabel, roleLabel } from '../../../utils/roles'
import { Unauthorized } from '../../../components/navigation/Unauthorized'

const ROLE_FILTERS = ['owner', 'manager', 'branch_manager', 'cashier', 'employee', 'viewer']

export function EmployeesPage() {
  const { user, roles } = useAuth()
  const allowed = canUseManagementCenter(roles)
  const data = useAsync(allowed && user ? `mgmt-employees:${user.id}` : null, async () => {
    const [employees, branches] = await Promise.all([listEmployees(), listBranches()])
    return { employees, branches }
  })
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('active')
  const [branch, setBranch] = useState('')

  const branchName = useMemo(
    () => new Map((data.data?.branches ?? []).map((b) => [b.id, b.name])),
    [data.data],
  )

  if (!allowed) {
    return <Unauthorized message="Çalışan yönetimi için yetkiniz yok." />
  }

  return (
    <Stack>
      <PageHeader
        title="Çalışanlar"
        subtitle="Ara, filtrele ve yönet"
        back={{ to: '/app/manager/management', label: 'Yönetim' }}
        actions={
          assignableRoles(roles).length > 0 ? (
            <LinkButton to="/app/manager/management/employees/new">Yeni Çalışan</LinkButton>
          ) : undefined
        }
      />
      <Input
        label="Ara"
        placeholder="Ad veya çalışan kodu"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Select
        label="Rol"
        value={role}
        placeholder="Tüm roller"
        onChange={(e) => setRole(e.target.value)}
        options={ROLE_FILTERS.map((r) => ({ value: r, label: roleLabel(r) }))}
      />
      <Select
        label="Durum"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        options={[
          { value: 'active', label: 'Aktif' },
          { value: 'inactive', label: 'Pasif' },
          { value: 'all', label: 'Tümü' },
        ]}
      />
      <Select
        label="Şube"
        value={branch}
        placeholder="Tüm şubeler"
        onChange={(e) => setBranch(e.target.value)}
        options={(data.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))}
      />

      <DataBoundary state={data} rows={4}>
        {({ employees }) => {
          const q = search.trim().toLowerCase()
          const visible = employees.filter(
            (e) =>
              (status === 'all' || (status === 'active') === e.isActive) &&
              (role === '' || e.roles.includes(role)) &&
              (branch === '' || e.branchIds.includes(branch)) &&
              (q === '' ||
                e.fullName.toLowerCase().includes(q) ||
                (e.employeeCode ?? '').toLowerCase().includes(q)),
          )
          if (visible.length === 0) {
            return (
              <EmptyState
                icon="👥"
                title="Çalışan bulunamadı"
                description="Arama veya filtreleri değiştirmeyi deneyin."
              />
            )
          }
          return (
            <Stack gap="sm">
              {visible.map((e) => (
                <RowCard
                  key={e.id}
                  title={e.fullName}
                  subtitle={`${e.employeeCode ?? 'Kodsuz'} · ${primaryRoleLabel(e.roles) || 'Rolsüz'}`}
                  meta={
                    e.branchIds.map((b) => branchName.get(b) ?? 'Şube').join(', ') || 'Şube yok'
                  }
                  trailing={
                    <StatusChip tone={e.isActive ? 'success' : 'danger'}>
                      {e.isActive ? 'Aktif' : 'Pasif'}
                    </StatusChip>
                  }
                >
                  <LinkButton
                    to={`/app/manager/management/employees/${e.id}`}
                    variant="secondary"
                  >
                    Detay
                  </LinkButton>
                </RowCard>
              ))}
            </Stack>
          )
        }}
      </DataBoundary>
    </Stack>
  )
}
