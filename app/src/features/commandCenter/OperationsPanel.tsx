import { LinkButton, RowCard, Stack, StatusChip } from '../../components/ui'
import type { BranchSignals } from '../../domain/commandCenter'
import { ROUTES } from '../../domain/commandCenter'
import type { BranchComparisonRow } from '../../domain/dashboard'
import { metricValue } from '../../domain/dashboard'
import styles from './CommandCenter.module.css'

const COUNT_TEXT = { submitted: 'Sayım yapıldı', voided_only: 'Sayım iptal', missing: 'Sayım yok' } as const

/** C. OPERATIONS: compact per-branch inventory / count / procurement state. Summary first, detail by tap. */
export function OperationsPanel({ rows, signals }: { rows: BranchComparisonRow[]; signals: Record<string, BranchSignals | null> }) {
  return (
    <section aria-labelledby="cc-ops">
      <div className={styles.sectionHead}>
        <h2 id="cc-ops">Operasyon</h2>
      </div>
      <Stack gap="sm">
        {rows.map((row) => {
          const s = signals[row.branchId]
          const alerts = metricValue(row.inventoryAlertCount)
          const parts: string[] = []
          if (alerts !== null) parts.push(alerts > 0 ? `${alerts} stok uyarısı` : 'Stok uyarısı yok')
          if (s?.counts.state === 'available' && row.inventoryTracked) parts.push(COUNT_TEXT[s.counts.data.todayStatus])
          if (s?.waste.state === 'available') parts.push(`${s.waste.data.entries} fire kaydı`)
          if (s?.procurement.state === 'available') {
            const p = s.procurement.data
            parts.push(`${p.awaitingApproval.length} onay bekleyen · ${p.dueToday.length} bugün teslim · ${p.overdueDelivery.length} geciken`)
          }
          const unavailable = !s || [s.counts, s.waste, s.procurement].some((p) => p.state === 'unavailable')
          return (
            <RowCard
              key={row.branchId}
              title={row.branchName}
              subtitle={parts.length > 0 ? parts.join(' · ') : 'Operasyon verisi görüntülenemiyor'}
              trailing={unavailable ? <StatusChip tone="neutral">Kısmi görünüm</StatusChip> : undefined}
            >
              <Stack gap="sm">
                <LinkButton to={ROUTES.procurement} variant="secondary">Tedarik ve siparişler</LinkButton>
                <LinkButton to={ROUTES.countOverview} variant="secondary">Kapanış sayımı</LinkButton>
              </Stack>
            </RowCard>
          )
        })}
      </Stack>
    </section>
  )
}
