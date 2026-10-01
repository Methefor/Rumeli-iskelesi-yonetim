import { useState } from 'react'
import { formatDate, formatTime, istanbulDate } from '../../../utils/dates'
import {
  Button,
  Card,
  DataBoundary,
  EmptyState,
  Inline,
  Input,
  LinkButton,
  Modal,
  PageHeader,
  RowCard,
  Select,
  Stack,
  StatusChip,
} from '../../../components/ui'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../hooks/useToast'
import {
  confirmShiftAssignment,
  createShiftChangeRequest,
  listBranchShifts,
  listMyShiftAssignments,
  listMyShiftChangeRequests,
  type ShiftAssignmentSummary,
  type ShiftSummary,
} from '../../../services/data'

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
const REQUEST_TONE = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
} as const
const REQUEST_LABEL: Record<string, string> = {
  pending: 'Yönetici kararı bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
}

function shiftLabel(shift: ShiftSummary) {
  return `${formatDate(shift.businessDate)} — ${shift.definition.name} (${formatTime(shift.definition.startHour, shift.definition.startMinute)}–${formatTime(shift.definition.endHour, shift.definition.endMinute)})`
}

/** The signed-in employee's own shifts and audited change requests. */
export function MyShiftPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const state = useAsync(user ? `my-shifts:${user.id}` : null, async () => {
    if (!user) return { assignments: [], requests: [] }
    const [assignments, requests] = await Promise.all([
      listMyShiftAssignments(user.id),
      listMyShiftChangeRequests(user.id),
    ])
    return { assignments, requests }
  })
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [requestingFor, setRequestingFor] = useState<ShiftAssignmentSummary | null>(null)
  const [alternatives, setAlternatives] = useState<ShiftSummary[]>([])
  const [requestedShiftId, setRequestedShiftId] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  async function openRequest(assignment: ShiftAssignmentSummary) {
    const shifts = await listBranchShifts(assignment.shift.branchId)
    const assignedShiftIds = new Set(
      (state.data?.assignments ?? [])
        .filter((entry) => entry.status !== 'cancelled')
        .map((entry) => entry.shift.id),
    )
    const today = istanbulDate(new Date())
    setAlternatives(
      shifts.filter(
        (shift) =>
          shift.id !== assignment.shift.id &&
          shift.status !== 'cancelled' &&
          shift.businessDate >= today &&
          !assignedShiftIds.has(shift.id),
      ),
    )
    setRequestingFor(assignment)
    setRequestedShiftId('')
    setReason('')
  }

  async function submitRequest() {
    if (!requestingFor) return
    setSubmitting(true)
    const { error } = await createShiftChangeRequest({
      currentAssignmentId: requestingFor.assignmentId,
      requestedShiftId,
      reason,
    })
    setSubmitting(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    setRequestingFor(null)
    showToast('Vardiya değişiklik talebi yöneticiye gönderildi', 'success')
    window.dispatchEvent(new Event('shift-requests-changed'))
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
        {({ assignments, requests }) => (
          <Stack>
            {assignments.length === 0 ? (
              <EmptyState
                icon="🕒"
                title="Atanmış vardiya yok"
                description="Size atanmış bir vardiya bulunmuyor."
              />
            ) : (
              <Stack gap="sm">
                {assignments.map((assignment) => {
                  const hasPendingRequest = requests.some(
                    (request) =>
                      request.currentAssignmentId === assignment.assignmentId &&
                      request.status === 'pending',
                  )
                  const canRequest =
                    assignment.status !== 'cancelled' &&
                    assignment.shift.status !== 'cancelled' &&
                    assignment.shift.businessDate >= istanbulDate(new Date())
                  return (
                    <RowCard
                      key={assignment.assignmentId}
                      title={`${assignment.shift.branchName} — ${assignment.shift.definition.name}`}
                      subtitle={`${formatDate(assignment.shift.businessDate)} · ${formatTime(assignment.shift.definition.startHour, assignment.shift.definition.startMinute)}–${formatTime(assignment.shift.definition.endHour, assignment.shift.definition.endMinute)}`}
                      trailing={
                        <StatusChip
                          tone={
                            STATUS_TONE[assignment.status as keyof typeof STATUS_TONE] ??
                            'neutral'
                          }
                        >
                          {STATUS_LABEL[assignment.status] ?? assignment.status}
                        </StatusChip>
                      }
                    >
                      <Inline>
                        {assignment.status === 'assigned' && (
                          <Button
                            loading={confirmingId === assignment.assignmentId}
                            onClick={() => void handleConfirm(assignment.assignmentId)}
                          >
                            Onayla
                          </Button>
                        )}
                        {assignment.shift.status !== 'cancelled' &&
                          assignment.status !== 'cancelled' && (
                            <LinkButton
                              to={`${assignment.shift.id}/report`}
                              variant="secondary"
                            >
                              Satış Raporu Gir
                            </LinkButton>
                          )}
                        {canRequest && (
                          <Button
                            variant="secondary"
                            disabled={hasPendingRequest}
                            onClick={() => void openRequest(assignment)}
                          >
                            {hasPendingRequest ? 'Talep bekliyor' : 'Değişiklik İste'}
                          </Button>
                        )}
                      </Inline>
                    </RowCard>
                  )
                })}
              </Stack>
            )}

            <h2>Değişiklik Taleplerim</h2>
            {requests.length === 0 ? (
              <Card>Henüz vardiya değişiklik talebiniz yok.</Card>
            ) : (
              <Stack gap="sm">
                {requests.map((request) => (
                  <RowCard
                    key={request.id}
                    title={`${request.currentShift.definition.name} → ${request.requestedShift.definition.name}`}
                    subtitle={`${formatDate(request.currentShift.businessDate)} → ${formatDate(request.requestedShift.businessDate)} · ${request.reason}`}
                    trailing={
                      <StatusChip tone={REQUEST_TONE[request.status]}>
                        {REQUEST_LABEL[request.status]}
                      </StatusChip>
                    }
                  >
                    {request.decisionNote && <p>Yönetici notu: {request.decisionNote}</p>}
                  </RowCard>
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </DataBoundary>

      <Modal
        open={requestingFor !== null}
        onClose={() => setRequestingFor(null)}
        title="Vardiya Değişikliği İste"
      >
        <Stack>
          {requestingFor && <Card>Mevcut: {shiftLabel(requestingFor.shift)}</Card>}
          <Select
            label="İstediğiniz vardiya"
            value={requestedShiftId}
            placeholder="Vardiya seçin"
            onChange={(event) => setRequestedShiftId(event.target.value)}
            options={alternatives.map((shift) => ({
              value: shift.id,
              label: shiftLabel(shift),
            }))}
          />
          <Input
            label="Değişiklik sebebi"
            value={reason}
            minLength={5}
            maxLength={500}
            placeholder="Yöneticinizin karar verebilmesi için açıklayın"
            onChange={(event) => setReason(event.target.value)}
          />
          {alternatives.length === 0 && (
            <p>Bu şubede seçebileceğiniz başka güncel vardiya bulunmuyor.</p>
          )}
          <Button
            fullWidth
            loading={submitting}
            disabled={!requestedShiftId || reason.trim().length < 5}
            onClick={() => void submitRequest()}
          >
            Yöneticiye Gönder
          </Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
