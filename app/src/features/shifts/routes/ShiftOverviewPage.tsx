import { useState } from 'react'
import { formatDate, formatTime } from '../../../utils/dates'
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
  Stack,
  StatusChip,
} from '../../../components/ui'
import { useAsync } from '../../../hooks/useAsync'
import { useSelectedBranch } from '../../../hooks/useSelectedBranch'
import { useToast } from '../../../hooks/useToast'
import {
  decideShiftChangeRequest,
  listBranchShiftChangeRequests,
  listBranchShifts,
  type ShiftChangeRequestSummary,
} from '../../../services/data'

const STATUS_TONE = {
  scheduled: 'neutral',
  in_progress: 'info',
  submitted: 'success',
  closed: 'success',
  cancelled: 'danger',
} as const
const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Planlandı',
  in_progress: 'Devam ediyor',
  submitted: 'Gönderildi',
  closed: 'Kapandı',
  cancelled: 'İptal',
}
const REQUEST_TONE = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
} as const
const REQUEST_LABEL: Record<string, string> = {
  pending: 'Karar bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
}

export function ShiftOverviewPage() {
  const { selectedBranchId, selectedBranch } = useSelectedBranch()
  const { showToast } = useToast()
  const state = useAsync(
    selectedBranchId ? `shifts:${selectedBranchId}` : null,
    async () => {
      if (!selectedBranchId) return { shifts: [], requests: [] }
      const [shifts, requests] = await Promise.all([
        listBranchShifts(selectedBranchId),
        listBranchShiftChangeRequests(selectedBranchId),
      ])
      return { shifts, requests }
    },
  )
  const [deciding, setDeciding] = useState<ShiftChangeRequestSummary | null>(null)
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved')
  const [decisionNote, setDecisionNote] = useState('')
  const [saving, setSaving] = useState(false)

  function openDecision(
    request: ShiftChangeRequestSummary,
    nextDecision: 'approved' | 'rejected',
  ) {
    setDeciding(request)
    setDecision(nextDecision)
    setDecisionNote('')
  }

  async function saveDecision() {
    if (!deciding) return
    setSaving(true)
    const { error } = await decideShiftChangeRequest({
      requestId: deciding.id,
      decision,
      decisionNote,
    })
    setSaving(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    setDeciding(null)
    showToast(
      decision === 'approved'
        ? 'Vardiya değişikliği onaylandı'
        : 'Vardiya değişikliği reddedildi',
      'success',
    )
    window.dispatchEvent(new Event('shift-requests-changed'))
    state.reload()
  }

  return (
    <Stack>
      <PageHeader
        title="Vardiyalar"
        subtitle={selectedBranch?.name}
        actions={<LinkButton to="assign">Vardiya Ata</LinkButton>}
      />
      <DataBoundary state={state} rows={3}>
        {({ shifts, requests }) => {
          const pending = requests.filter((request) => request.status === 'pending')
          return (
            <Stack>
              <Inline>
                <h2>Değişiklik Talepleri</h2>
                <StatusChip tone={pending.length > 0 ? 'warning' : 'success'}>
                  {pending.length} bekleyen
                </StatusChip>
              </Inline>
              {pending.length === 0 ? (
                <Card>Bekleyen vardiya değişiklik talebi yok.</Card>
              ) : (
                <Stack gap="sm">
                  {pending.map((request) => (
                    <RowCard
                      key={request.id}
                      title={`${request.requesterName}${request.requesterEmployeeCode ? ` (${request.requesterEmployeeCode})` : ''}`}
                      subtitle={`${formatDate(request.currentShift.businessDate)} ${request.currentShift.definition.name} → ${formatDate(request.requestedShift.businessDate)} ${request.requestedShift.definition.name}`}
                      trailing={<StatusChip tone="warning">Karar bekliyor</StatusChip>}
                    >
                      <p>Sebep: {request.reason}</p>
                      <Inline>
                        <Button onClick={() => openDecision(request, 'approved')}>
                          Onayla
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => openDecision(request, 'rejected')}
                        >
                          Reddet
                        </Button>
                      </Inline>
                    </RowCard>
                  ))}
                </Stack>
              )}

              {requests.some((request) => request.status !== 'pending') && (
                <>
                  <h2>Sonuçlanan Talepler</h2>
                  <Stack gap="sm">
                    {requests
                      .filter((request) => request.status !== 'pending')
                      .map((request) => (
                        <RowCard
                          key={request.id}
                          title={request.requesterName}
                          subtitle={`${formatDate(request.currentShift.businessDate)} ${request.currentShift.definition.name} → ${formatDate(request.requestedShift.businessDate)} ${request.requestedShift.definition.name}`}
                          trailing={
                            <StatusChip tone={REQUEST_TONE[request.status]}>
                              {REQUEST_LABEL[request.status]}
                            </StatusChip>
                          }
                        >
                          <p>Sebep: {request.reason}</p>
                          {request.decisionNote && (
                            <p>Karar notu: {request.decisionNote}</p>
                          )}
                        </RowCard>
                      ))}
                  </Stack>
                </>
              )}

              <h2>Planlanan Vardiyalar</h2>
              {shifts.length === 0 ? (
                <EmptyState
                  icon="🕒"
                  title="Vardiya yok"
                  description="Bu şube için planlanmış bir vardiya yok."
                />
              ) : (
                <Stack gap="sm">
                  {shifts.map((shift) => (
                    <RowCard
                      key={shift.id}
                      title={shift.definition.name}
                      subtitle={`${formatDate(shift.businessDate)} · ${formatTime(shift.definition.startHour, shift.definition.startMinute)}–${formatTime(shift.definition.endHour, shift.definition.endMinute)}`}
                      trailing={
                        <StatusChip
                          tone={
                            STATUS_TONE[shift.status as keyof typeof STATUS_TONE] ??
                            'neutral'
                          }
                        >
                          {STATUS_LABEL[shift.status] ?? shift.status}
                        </StatusChip>
                      }
                    />
                  ))}
                </Stack>
              )}
            </Stack>
          )
        }}
      </DataBoundary>

      <Modal
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={decision === 'approved' ? 'Değişikliği Onayla' : 'Değişikliği Reddet'}
      >
        <Stack>
          {deciding && (
            <Card>
              <strong>{deciding.requesterName}</strong>
              <p>{deciding.reason}</p>
            </Card>
          )}
          <Input
            label={
              decision === 'rejected' ? 'Ret açıklaması' : 'Karar notu (isteğe bağlı)'
            }
            value={decisionNote}
            minLength={decision === 'rejected' ? 3 : undefined}
            maxLength={500}
            onChange={(event) => setDecisionNote(event.target.value)}
          />
          <Button
            fullWidth
            variant={decision === 'approved' ? 'primary' : 'danger'}
            loading={saving}
            disabled={decision === 'rejected' && decisionNote.trim().length < 3}
            onClick={() => void saveDecision()}
          >
            {decision === 'approved' ? 'Onayla ve Vardiyayı Değiştir' : 'Talebi Reddet'}
          </Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
