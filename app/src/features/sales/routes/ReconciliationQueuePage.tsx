import { useState } from 'react'
import { formatDateTime } from '../../../utils/dates'
import { formatMoney } from '../../../utils/format'
import {
  Button,
  DataBoundary,
  EmptyState,
  Input,
  PageHeader,
  RowCard,
  Stack,
  StatusChip,
} from '../../../components/ui'
import { useAsync } from '../../../hooks/useAsync'
import { useSelectedBranch } from '../../../hooks/useSelectedBranch'
import { useToast } from '../../../hooks/useToast'
import { listReconciliationQueue, overrideReconciliation } from '../../../services/data'

const TONE = { OK: 'success', WARNING: 'warning', ERROR: 'danger' } as const
const LABEL = { OK: 'Uyumlu', WARNING: 'Uyarı', ERROR: 'Hata' } as const

/** Reports whose register total and category total disagree. A manager may override with a mandatory, audited reason. */
export function ReconciliationQueuePage() {
  const { selectedBranchId, selectedBranch } = useSelectedBranch()
  const { showToast } = useToast()
  const state = useAsync(selectedBranchId ? `queue:${selectedBranchId}` : null, () =>
    selectedBranchId ? listReconciliationQueue(selectedBranchId) : Promise.resolve([]),
  )
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleOverride(reportId: string) {
    const reason = reasons[reportId]?.trim()
    if (!reason) {
      showToast('Gerekçe zorunludur.', 'danger')
      return
    }
    setBusyId(reportId)
    const { error } = await overrideReconciliation({ reportId, newStatus: 'OK', reason })
    setBusyId(null)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Mutabakat durumu güncellendi', 'success')
    state.reload()
  }

  return (
    <Stack>
      <PageHeader
        title="Mutabakat Kuyruğu"
        subtitle={selectedBranch?.name}
        back={{ to: '/app/manager/reports', label: 'Satış Raporları' }}
      />
      <DataBoundary state={state} rows={2} rowHeight={130}>
        {(reports) =>
          reports.length === 0 ? (
            <EmptyState
              icon="✅"
              title="Kuyruk boş"
              description="Mutabakat gerektiren rapor yok."
            />
          ) : (
            <Stack gap="sm">
              {reports.map((r) => (
                <RowCard
                  key={r.id}
                  title={`${r.reportType} Raporu — ${formatMoney(r.grossRevenue)}`}
                  subtitle={formatDateTime(r.submittedAt)}
                  trailing={
                    <StatusChip tone={TONE[r.reconciliationStatus]}>
                      {LABEL[r.reconciliationStatus]}
                    </StatusChip>
                  }
                >
                  <Stack gap="sm">
                    <Input
                      label="Onay gerekçesi (zorunlu)"
                      value={reasons[r.id] ?? ''}
                      onChange={(e) =>
                        setReasons((p) => ({ ...p, [r.id]: e.target.value }))
                      }
                      maxLength={200}
                    />
                    <Button
                      loading={busyId === r.id}
                      disabled={!reasons[r.id]?.trim()}
                      onClick={() => void handleOverride(r.id)}
                    >
                      Uyumlu Olarak Onayla
                    </Button>
                  </Stack>
                </RowCard>
              ))}
            </Stack>
          )
        }
      </DataBoundary>
    </Stack>
  )
}
