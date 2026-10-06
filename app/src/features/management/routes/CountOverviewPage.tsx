import { Note, PageHeader, RowCard, Stack, StatCard, StatusChip, DataBoundary, LinkButton } from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import { canReviewControl, type CountSummary, type QuantityByUnit } from '../../../domain/inventory/control'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { useSelectedBranch } from '../../../hooks/useSelectedBranch'
import { getBranchCountOverview } from '../../../services/data'
import { formatQuantity } from '../../../utils/format'
import { CostMetricText } from '../../inventory/components/CostMetricText'
import { COUNT_STATUS_LABELS, TODAY_COUNT_LABELS, TODAY_COUNT_TONES } from '../../inventory/controlLabels'

const units = (rows: QuantityByUnit[]) => rows.map((r) => `${formatQuantity(r.quantity)} ${r.unit}`).join(' · ') || '—'

export function CountSummaryLine({ s }: { s: CountSummary }) {
  return (
    <span>
      {s.shortageLines} eksik · {s.surplusLines} fazla · {s.unexplainedLines} açıklanamayan · {s.timingUncertainLines} zamanı belirsiz
    </span>
  )
}

/** Manager closing-count overview for the selected branch: today's status, latest variance totals, recent counts. */
export function CountOverviewPage() {
  const { roles } = useAuth()
  const { selectedBranchId, selectedBranch } = useSelectedBranch()
  const allowed = canReviewControl(roles)
  const state = useAsync(allowed && selectedBranchId ? `count-overview:${selectedBranchId}` : null, () => getBranchCountOverview(selectedBranchId as string))

  if (!allowed) return <Unauthorized message="Kapanış sayımı özeti için yetkiniz yok." />

  return (
    <Stack>
      <PageHeader title="Kapanış sayımı" subtitle={selectedBranch?.name} back={{ to: '/app/manager/management', label: 'Yönetim' }} />
      <DataBoundary state={state} rows={4}>
        {(o) => (
          <Stack>
            <StatusChip tone={TODAY_COUNT_TONES[o.todayStatus]}>{TODAY_COUNT_LABELS[o.todayStatus]}</StatusChip>
            {o.latestSummary && o.latestCountId ? (
              <Stack gap="sm">
                <StatCard label="Son sayım: eksik" value={units(o.latestSummary.shortageQuantityByUnit)} />
                <StatCard label="Son sayım: fazla" value={units(o.latestSummary.surplusQuantityByUnit)} />
                <StatCard label="Açıklanamayan fark" value={units(o.latestSummary.unexplainedQuantityByUnit)} changeLabel={`${o.latestSummary.unexplainedLines} satır`} />
                <StatCard label="Fire girişi var, zamanı belirsiz" value={units(o.latestSummary.timingUncertainQuantityByUnit)} changeLabel={`${o.latestSummary.timingUncertainLines} satır`} />
                <StatCard label="Fark değeri" value={<CostMetricText metric={o.latestSummary.varianceValue} />} />
                <LinkButton to={`/app/manager/management/count-review/${o.latestCountId}`} variant="secondary">
                  Son sayımın satırlarını gör
                </LinkButton>
              </Stack>
            ) : (
              <Note>Gönderilmiş sayım bulunamadı.</Note>
            )}
            <h2>Son sayımlar</h2>
            <Stack gap="sm">
              {o.recent.map((c) => (
                <RowCard
                  key={c.id}
                  title={`${c.businessDate} · ${COUNT_STATUS_LABELS[c.status]}`}
                  subtitle={c.summary ? <CountSummaryLine s={c.summary} /> : (c.voidReason ?? undefined)}
                  meta={[c.submittedBy, new Date(c.submittedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })].filter(Boolean).join(' · ')}
                  trailing={<StatusChip tone={c.status === 'voided' ? 'neutral' : 'info'}>{COUNT_STATUS_LABELS[c.status]}</StatusChip>}
                >
                  <LinkButton to={`/app/manager/management/count-review/${c.id}`} variant="secondary">
                    Satırlar
                  </LinkButton>
                </RowCard>
              ))}
            </Stack>
            <Note>İptal edilen sayımlar listelenir ama toplamlara ve “son sayım” özetine dahil edilmez.</Note>
          </Stack>
        )}
      </DataBoundary>
    </Stack>
  )
}
