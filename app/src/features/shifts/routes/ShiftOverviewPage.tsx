import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSelectedBranch } from '../../../hooks/useSelectedBranch'
import { listBranchShifts, type ShiftSummary } from '../../../services/supabase'
import { Card, StatusChip, Button, EmptyState, Skeleton } from '../../../components/ui'

const STATUS_TONE = {
  scheduled: 'neutral',
  in_progress: 'info',
  submitted: 'success',
  closed: 'success',
  cancelled: 'danger',
} as const

export function ShiftOverviewPage() {
  const { branches, selectedBranchId, setSelectedBranchId } = useSelectedBranch()
  const [shifts, setShifts] = useState<ShiftSummary[] | null>(null)

  useEffect(() => {
    if (!selectedBranchId) return
    void listBranchShifts(selectedBranchId).then(setShifts)
  }, [selectedBranchId])

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Vardiya Genel Bakış</h1>
        <Link to="assign">
          <Button size="md">Vardiya Ata</Button>
        </Link>
      </div>

      {branches.length > 1 && (
        <select
          value={selectedBranchId ?? ''}
          onChange={(e) => setSelectedBranchId(e.target.value)}
          style={{ padding: 8, borderRadius: 8 }}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      {shifts === null && <Skeleton height={160} />}
      {shifts !== null && shifts.length === 0 && (
        <EmptyState icon="🕒" title="Vardiya yok" description="Bu şube için henüz planlanmış bir vardiya yok." />
      )}
      {shifts?.map((s) => (
        <Card key={s.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontWeight: 600 }}>{s.definition.name}</p>
              <p style={{ fontSize: 13, opacity: 0.75 }}>{s.businessDate}</p>
            </div>
            <StatusChip tone={STATUS_TONE[s.status as keyof typeof STATUS_TONE] ?? 'neutral'}>{s.status}</StatusChip>
          </div>
        </Card>
      ))}
    </div>
  )
}
