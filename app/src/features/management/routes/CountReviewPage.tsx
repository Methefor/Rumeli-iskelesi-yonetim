import { useParams } from 'react-router-dom'
import { DataBoundary, Note, PageHeader, RowCard, Stack, StatCard, StatusChip } from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import { canReviewControl } from '../../../domain/inventory/control'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { getInventoryCountReview } from '../../../services/data'
import { formatQuantity, formatSignedQuantity } from '../../../utils/format'
import { CostMetricText } from '../../inventory/components/CostMetricText'
import {
  CLASSIFICATION_LABELS,
  CLASSIFICATION_TONES,
  COUNT_STATUS_LABELS,
  EXPLANATION_LABELS,
  EXPLANATION_TONES,
} from '../../inventory/controlLabels'

/** One count, item by item: expected vs physical vs variance, and whether later fire explains a shortage. */
export function CountReviewPage() {
  const { countId = '' } = useParams()
  const { roles } = useAuth()
  const allowed = canReviewControl(roles)
  const state = useAsync(allowed && countId ? `count-review:${countId}` : null, () => getInventoryCountReview(countId))

  if (!allowed) return <Unauthorized message="Sayım incelemesi için yetkiniz yok." />

  return (
    <Stack>
      <PageHeader title="Sayım incelemesi" back={{ to: '/app/manager/management/count-review', label: 'Kapanış sayımı' }} />
      <DataBoundary state={state} rows={5}>
        {(r) => (
          <Stack>
            <RowCard
              title={`${r.count.businessDate}${r.count.shiftName ? ` · ${r.count.shiftName}` : ''}`}
              subtitle={[r.count.submittedBy.name, r.count.submittedBy.employeeCode].filter(Boolean).join(' · ') || undefined}
              meta={new Date(r.count.submittedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
              trailing={<StatusChip tone={r.count.status === 'voided' ? 'neutral' : 'info'}>{COUNT_STATUS_LABELS[r.count.status]}</StatusChip>}
            />
            {r.count.status === 'voided' && <Note>Bu sayım iptal edildi{r.count.voidReason ? `: ${r.count.voidReason}` : ''}. Toplamlara dahil edilmez.</Note>}
            <StatCard label="Satır" value={`${r.summary.shortageLines} eksik · ${r.summary.surplusLines} fazla · ${r.summary.balancedLines} tutan`} />
            <StatCard
              label="Zamanı belirsiz fire girişi / açıklanamayan"
              value={`${r.summary.timingUncertainLines} / ${r.summary.unexplainedLines}`}
            />
            <StatCard label="Fark değeri" value={<CostMetricText metric={r.summary.varianceValue} />} />
            <h2>Ürünler</h2>
            <Stack gap="sm">
              {[...r.lines]
                .sort((a, b) => Number(b.classification !== 'balanced') - Number(a.classification !== 'balanced'))
                .map((l) => (
                  <RowCard
                    key={l.inventoryItemId}
                    title={l.name}
                    subtitle={`Beklenen ${formatQuantity(l.expectedQuantity)} · Sayılan ${formatQuantity(l.physicalQuantity)} ${l.unit}`}
                    meta={
                      l.explanation.status === 'not_applicable'
                        ? l.code
                        : `${l.code} · sayımdan sonra girilen fire ${formatQuantity(l.explanation.candidateWasteQuantity)} ${l.unit}`
                    }
                    trailing={
                      <Stack gap="sm">
                        <StatusChip tone={CLASSIFICATION_TONES[l.classification]}>
                          {CLASSIFICATION_LABELS[l.classification]} {l.varianceQuantity !== 0 ? formatSignedQuantity(l.varianceQuantity) : ''}
                        </StatusChip>
                        {l.explanation.status !== 'not_applicable' && (
                          <StatusChip tone={EXPLANATION_TONES[l.explanation.status]}>{EXPLANATION_LABELS[l.explanation.status]}</StatusChip>
                        )}
                      </Stack>
                    }
                  >
                    {l.varianceQuantity !== 0 && (
                      <small>
                        Fark değeri: <CostMetricText metric={l.varianceValue} />
                        {l.explanation.unexplainedQuantity > 0 && ` · açıklanamayan ${formatQuantity(l.explanation.unexplainedQuantity)} ${l.unit}`}
                      </small>
                    )}
                  </RowCard>
                ))}
            </Stack>
            <Note>
              Beklenen miktar, sayım anındaki kayıtlı stoktur ve sayımdan ÖNCE girilmiş fireyi zaten düşmüştür. Sayımdan SONRA girilen fire (aynı vardiya,
              vardiya yoksa aynı iş günü) bir eksiği ASLA kesin olarak açıklamaz: sistem yalnızca girişin zamanını saklar, fireyin ne zaman gerçekleştiğini
              bilmez; bu yüzden “zamanı belirsiz” görünür. Tolerans uygulanmaz; sonuç vardiya/iş günü kesinliğindedir.
            </Note>
          </Stack>
        )}
      </DataBoundary>
    </Stack>
  )
}
