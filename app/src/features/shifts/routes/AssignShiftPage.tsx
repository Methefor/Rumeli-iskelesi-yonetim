import { useEffect, useState } from 'react'
import { useSelectedBranch } from '../../../hooks/useSelectedBranch'
import {
  listBranchShifts,
  listBranchEmployees,
  assignShift,
  type ShiftSummary,
  type BranchEmployee,
} from '../../../services/supabase'
import { Card, Button } from '../../../components/ui'
import { useToast } from '../../../hooks/useToast'

export function AssignShiftPage() {
  const { branches, selectedBranchId, setSelectedBranchId } = useSelectedBranch()
  const { showToast } = useToast()
  const [shifts, setShifts] = useState<ShiftSummary[]>([])
  const [employees, setEmployees] = useState<BranchEmployee[]>([])
  const [selectedShiftId, setSelectedShiftId] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    if (!selectedBranchId) return
    void listBranchShifts(selectedBranchId).then(setShifts)
    void listBranchEmployees(selectedBranchId).then(setEmployees)
  }, [selectedBranchId])

  async function handleAssign() {
    if (!selectedShiftId || !selectedEmployeeId) return
    setAssigning(true)
    const { error } = await assignShift({ shiftId: selectedShiftId, userId: selectedEmployeeId })
    setAssigning(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Vardiya atandı', 'success')
    setSelectedShiftId('')
    setSelectedEmployeeId('')
  }

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>Vardiya Ata</h1>

      {branches.length > 1 && (
        <select value={selectedBranchId ?? ''} onChange={(e) => setSelectedBranchId(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      <Card>
        <label style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
          <span>Vardiya</span>
          <select value={selectedShiftId} onChange={(e) => setSelectedShiftId(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
            <option value="">Seçin</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.businessDate} — {s.definition.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
          <span>Çalışan</span>
          <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
            <option value="">Seçin</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName} {e.employeeCode ? `(${e.employeeCode})` : ''}
              </option>
            ))}
          </select>
        </label>

        <Button fullWidth loading={assigning} disabled={!selectedShiftId || !selectedEmployeeId} onClick={() => void handleAssign()}>
          Ata
        </Button>
      </Card>
    </div>
  )
}
