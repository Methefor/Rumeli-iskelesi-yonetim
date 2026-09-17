import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { listMyShiftAssignments, confirmShiftAssignment, type ShiftAssignmentSummary } from '../../../services/supabase'
import { Card, Button, StatusChip, EmptyState, Skeleton } from '../../../components/ui'
import { useToast } from '../../../hooks/useToast'

const STATUS_TONE = { assigned: 'neutral', confirmed: 'success', cancelled: 'danger' } as const

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function MyShiftPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [assignments, setAssignments] = useState<ShiftAssignmentSummary[] | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    listMyShiftAssignments(user.id).then((data) => {
      if (!cancelled) setAssignments(data)
    })
    return () => {
      cancelled = true
    }
  }, [user, reloadKey])

  async function handleConfirm(assignmentId: string) {
    setConfirmingId(assignmentId)
    const { error } = await confirmShiftAssignment(assignmentId)
    setConfirmingId(null)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Vardiya onaylandı', 'success')
    setReloadKey((k) => k + 1)
  }

  if (assignments === null) {
    return (
      <div style={{ padding: 16, display: 'grid', gap: 12 }}>
        <Skeleton height={80} />
        <Skeleton height={80} />
      </div>
    )
  }

  if (assignments.length === 0) {
    return (
      <EmptyState
        icon="🕒"
        title="Vardiyam"
        description="Size atanmış bir vardiya bulunmuyor."
        action={
          <Link to="reports">
            <Button variant="secondary">Son Raporlarım</Button>
          </Link>
        }
      />
    )
  }

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Vardiyam</h1>
        <Link to="reports">
          <Button variant="ghost" size="md">
            Son Raporlarım
          </Button>
        </Link>
      </div>

      {assignments.map((a) => (
        <Card key={a.assignmentId}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontWeight: 600 }}>
                {a.shift.branchName} — {a.shift.definition.name}
              </p>
              <p style={{ fontSize: 13, opacity: 0.75 }}>
                {a.shift.businessDate} · {formatTime(a.shift.definition.startHour, a.shift.definition.startMinute)}–
                {formatTime(a.shift.definition.endHour, a.shift.definition.endMinute)}
              </p>
            </div>
            <StatusChip tone={STATUS_TONE[a.status as keyof typeof STATUS_TONE] ?? 'neutral'}>{a.status}</StatusChip>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {a.status === 'assigned' && (
              <Button size="md" loading={confirmingId === a.assignmentId} onClick={() => void handleConfirm(a.assignmentId)}>
                Onayla
              </Button>
            )}
            {a.shift.status !== 'cancelled' && (
              <Link to={`${a.shift.id}/report`}>
                <Button variant="secondary" size="md">
                  Satış Raporu Gir
                </Button>
              </Link>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}
