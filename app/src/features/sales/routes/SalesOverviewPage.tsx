import { formatDateTime } from '../../../utils/dates'
import { formatMoney } from '../../../utils/format'
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
import { listBranchReports } from '../../../services/data'

const RECONCILIATION_TONE = {
  OK: 'success',
  WARNING: 'warning',
  ERROR: 'danger',
} as const
const RECONCILIATION_LABEL = { OK: 'Uyumlu', WARNING: 'Uyarı', ERROR: 'Hata' } as const

export function SalesOverviewPage() {
  const { selectedBranchId, selectedBranch } = useSelectedBranch()
  const state = useAsync(selectedBranchId ? `reports:${selectedBranchId}` : null, () =>
    selectedBranchId ? listBranchReports(selectedBranchId) : Promise.resolve([]),
  )
  const flagged =
    state.data?.filter((r) => r.reconciliationStatus !== 'OK' && r.status !== 'cancelled')
      .length ?? 0

  return (
    <Stack>
      <PageHeader
        title="Satış Raporları"
        subtitle={selectedBranch?.name}
        actions={
          <LinkButton to="reconciliation" variant={flagged > 0 ? 'danger' : 'secondary'}>
            Mutabakat{flagged > 0 ? ` (${flagged})` : ''}
          </LinkButton>
        }
      />
      <DataBoundary state={state} rows={3}>
        {(reports) =>
          reports.length === 0 ? (
            <EmptyState
              icon="🧾"
              title="Rapor yok"
              description="Bu şube için gönderilmiş satış raporu yok."
            />
          ) : (
            <Stack gap="sm">
              {reports.map((r) => (
                <RowCard
                  key={r.id}
                  title={`${r.reportType} Raporu`}
                  subtitle={formatDateTime(r.submittedAt)}
                  trailing={
                    <>
                      <strong>{formatMoney(r.grossRevenue)}</strong>
                      <StatusChip tone={RECONCILIATION_TONE[r.reconciliationStatus]}>
                        {RECONCILIATION_LABEL[r.reconciliationStatus]}
                      </StatusChip>
                      {r.status === 'cancelled' && (
                        <StatusChip tone="danger">İptal</StatusChip>
                      )}
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
