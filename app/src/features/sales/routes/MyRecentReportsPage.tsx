import { formatDateTime } from '../../../utils/dates'
import { formatMoney } from '../../../utils/format'
import {
  DataBoundary,
  EmptyState,
  PageHeader,
  RowCard,
  Stack,
  StatusChip,
} from '../../../components/ui'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { listMyRecentReports } from '../../../services/data'

const RECONCILIATION_TONE = {
  OK: 'success',
  WARNING: 'warning',
  ERROR: 'danger',
} as const
const RECONCILIATION_LABEL = { OK: 'Uyumlu', WARNING: 'Uyarı', ERROR: 'Hata' } as const
const STATUS_TONE = { submitted: 'neutral', edited: 'info', cancelled: 'danger' } as const
const STATUS_LABEL: Record<string, string> = {
  submitted: 'Gönderildi',
  edited: 'Düzenlendi',
  cancelled: 'İptal',
}

export function MyRecentReportsPage() {
  const { user } = useAuth()
  const state = useAsync(user ? `my-reports:${user.id}` : null, () =>
    user ? listMyRecentReports(user.id) : Promise.resolve([]),
  )

  return (
    <Stack>
      <PageHeader title="Raporlarım" subtitle="Son gönderdiğiniz satış raporları" />
      <DataBoundary state={state} rows={3}>
        {(reports) =>
          reports.length === 0 ? (
            <EmptyState
              icon="🧾"
              title="Henüz rapor yok"
              description="Gönderdiğiniz satış raporları burada görünür."
            />
          ) : (
            <Stack gap="sm">
              {reports.map((r) => (
                <RowCard
                  key={r.id}
                  title={`${r.branchName} — ${r.reportType} Raporu`}
                  subtitle={formatDateTime(r.submittedAt)}
                  meta={r.notes ?? undefined}
                  trailing={
                    <>
                      <strong>{formatMoney(r.grossRevenue)}</strong>
                      <StatusChip
                        tone={
                          STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? 'neutral'
                        }
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </StatusChip>
                      <StatusChip tone={RECONCILIATION_TONE[r.reconciliationStatus]}>
                        {RECONCILIATION_LABEL[r.reconciliationStatus]}
                      </StatusChip>
                    </>
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
