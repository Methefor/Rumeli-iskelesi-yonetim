import { formatDate, formatTime } from '../../../utils/dates'
import {
  DataBoundary,
  EmptyState,
  LinkButton,
  PageHeader,
  RowCard,
  Stack,
  StatusChip,
} from '../../../components/ui'
import { useAsync } from '../../../hooks/useAsync'
import { useSelectedBranch } from '../../../hooks/useSelectedBranch'
import { listBranchShifts } from '../../../services/data'

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

export function ShiftOverviewPage() {
  const { selectedBranchId, selectedBranch } = useSelectedBranch()
  const state = useAsync(selectedBranchId ? `shifts:${selectedBranchId}` : null, () =>
    selectedBranchId ? listBranchShifts(selectedBranchId) : Promise.resolve([]),
  )

  return (
    <Stack>
      <PageHeader
        title="Vardiyalar"
        subtitle={selectedBranch?.name}
        actions={<LinkButton to="assign">Vardiya Ata</LinkButton>}
      />
      <DataBoundary state={state} rows={3}>
        {(shifts) =>
          shifts.length === 0 ? (
            <EmptyState
              icon="🕒"
              title="Vardiya yok"
              description="Bu şube için planlanmış bir vardiya yok."
            />
          ) : (
            <Stack gap="sm">
              {shifts.map((s) => (
                <RowCard
                  key={s.id}
                  title={s.definition.name}
                  subtitle={`${formatDate(s.businessDate)} · ${formatTime(s.definition.startHour, s.definition.startMinute)}–${formatTime(s.definition.endHour, s.definition.endMinute)}`}
                  trailing={
                    <StatusChip
                      tone={
                        STATUS_TONE[s.status as keyof typeof STATUS_TONE] ?? 'neutral'
                      }
                    >
                      {STATUS_LABEL[s.status] ?? s.status}
                    </StatusChip>
                  }
                />
              ))}
            </Stack>
          )
        }
      </DataBoundary>
    </Stack>
  )
}
