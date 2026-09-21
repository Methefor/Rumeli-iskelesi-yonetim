import { useState } from 'react'
import { formatDate } from '../../../utils/dates'
import {
  Button,
  Card,
  DataBoundary,
  PageHeader,
  Select,
  Stack,
} from '../../../components/ui'
import { useAsync } from '../../../hooks/useAsync'
import { useSelectedBranch } from '../../../hooks/useSelectedBranch'
import { useToast } from '../../../hooks/useToast'
import {
  assignShift,
  listBranchEmployees,
  listBranchShifts,
} from '../../../services/data'

export function AssignShiftPage() {
  const { selectedBranchId, selectedBranch } = useSelectedBranch()
  const { showToast } = useToast()
  const state = useAsync(
    selectedBranchId ? `assign:${selectedBranchId}` : null,
    async () => {
      if (!selectedBranchId) return { shifts: [], employees: [] }
      const [shifts, employees] = await Promise.all([
        listBranchShifts(selectedBranchId),
        listBranchEmployees(selectedBranchId),
      ])
      return { shifts: shifts.filter((s) => s.status !== 'cancelled'), employees }
    },
  )
  const [shiftId, setShiftId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [assigning, setAssigning] = useState(false)

  async function handleAssign() {
    setAssigning(true)
    const { error } = await assignShift({ shiftId, userId: employeeId })
    setAssigning(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Vardiya atandı', 'success')
    setShiftId('')
    setEmployeeId('')
  }

  return (
    <Stack>
      <PageHeader
        title="Vardiya Ata"
        subtitle={selectedBranch?.name}
        back={{ to: '/app/manager/shifts', label: 'Vardiyalar' }}
      />
      <DataBoundary state={state} rows={2}>
        {({ shifts, employees }) => (
          <Card>
            <Stack gap="sm">
              <Select
                label="Vardiya"
                value={shiftId}
                placeholder="Seçin"
                onChange={(e) => setShiftId(e.target.value)}
                options={shifts.map((s) => ({
                  value: s.id,
                  label: `${formatDate(s.businessDate)} — ${s.definition.name}`,
                }))}
              />
              <Select
                label="Çalışan"
                value={employeeId}
                placeholder="Seçin"
                onChange={(e) => setEmployeeId(e.target.value)}
                options={employees.map((e) => ({
                  value: e.id,
                  label: `${e.fullName}${e.employeeCode ? ` (${e.employeeCode})` : ''}`,
                }))}
              />
              <Button
                size="lg"
                fullWidth
                loading={assigning}
                disabled={!shiftId || !employeeId}
                onClick={() => void handleAssign()}
              >
                Ata
              </Button>
            </Stack>
          </Card>
        )}
      </DataBoundary>
    </Stack>
  )
}
