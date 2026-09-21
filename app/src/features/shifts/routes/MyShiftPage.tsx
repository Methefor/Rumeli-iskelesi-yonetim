import { useState } from 'react'
import { formatDate, formatTime } from '../../../utils/dates'
import {
  Button,
  DataBoundary,
  EmptyState,
  Inline,
  LinkButton,
  PageHeader,
  RowCard,
  Stack,
  StatusChip,
} from '../../../components/ui'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../hooks/useToast'
import { confirmShiftAssignment, listMyShiftAssignments } from '../../../services/data'

const STATUS_TONE = {
  assigned: 'warning',
  confirmed: 'success',
  cancelled: 'danger',
} as const
const STATUS_LABEL: Record<string, string> = {
  assigned: 'Onay bekliyor',
  confirmed: 'Onaylandı',
  cancelled: 'İptal',
}

/** The signed-in employee's own shift assignments. */
export function MyShiftPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const state = useAsync(user ? `my-shifts:${user.id}` : null, () =>
    user ? listMyShiftAssignments(user.id) : Promise.resolve([]),
  )
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  async function handleConfirm(assignmentId: string) {
    setConfirmingId(assignmentId)
    const { error } = await confirmShiftAssignment(assignmentId)
    setConfirmingId(null)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Vardiya onaylandı', 'success')
    state.reload()
  }

  return (
    <Stack>
      <PageHeader
        title="Vardiyalarım"
        actions={
          <LinkButton to="/app/employee/reports" variant="secondary">
            Raporlarım
          </LinkButton>
        }
      />

      <DataBoundary state={state} rows={3} rowHeight={96}>
        {(assignments) =>
          assignments.length === 0 ? (
            <EmptyState
              icon="🕒"
              title="Atanmış vardiya yok"
              description="Size atanmış bir vardiya bulunmuyor."
            />
          ) : (
            <Stack gap="sm">
              {assignments.map((a) => (
                <RowCard
                  key={a.assignmentId}
                  title={`${a.shift.branchName} — ${a.shift.definition.name}`}
                  subtitle={`${formatDate(a.shift.businessDate)} · ${formatTime(a.shift.definition.startHour, a.shift.definition.startMinute)}–${formatTime(a.shift.definition.endHour, a.shift.definition.endMinute)}`}
                  trailing={
                    <StatusChip
                      tone={
                        STATUS_TONE[a.status as keyof typeof STATUS_TONE] ?? 'neutral'
                      }
                    >
                      {STATUS_LABEL[a.status] ?? a.status}
                    </StatusChip>
                  }
                >
                  <Inline>
                    {a.status === 'assigned' && (
                      <Button
                        loading={confirmingId === a.assignmentId}
                        onClick={() => void handleConfirm(a.assignmentId)}
                      >
                        Onayla
                      </Button>
                    )}
                    {a.shift.status !== 'cancelled' && a.status !== 'cancelled' && (
                      <LinkButton to={`${a.shift.id}/report`} variant="secondary">
                        Satış Raporu Gir
                      </LinkButton>
                    )}
                  </Inline>
                </RowCard>
              ))}
            </Stack>
          )
        }
      </DataBoundary>
    </Stack>
  )
}
