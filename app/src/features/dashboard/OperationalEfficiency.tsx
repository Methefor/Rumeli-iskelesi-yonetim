import type { OperationalSummary } from '../../domain/dashboard'
import { Grid, Note, StatCard } from '../../components/ui'
import { formatRatioPercent } from '../../utils/format'
import styles from './Dashboard.module.css'

/**
 * Only measurable, existing facts — no invented "efficiency score". The one
 * ratio shown (shift completion) has an explicit, documented formula:
 * completed shifts (status submitted or closed) / all non-cancelled shifts
 * scheduled in the period. See DASHBOARD_MODEL.md "Operational efficiency".
 */
export function OperationalEfficiency({ summary }: { summary: OperationalSummary }) {
  const totalNonCancelled =
    summary.shifts.scheduled + summary.shifts.inProgress + summary.shifts.submitted + summary.shifts.closed
  const completionRatio = totalNonCancelled > 0 ? summary.shifts.completed / totalNonCancelled : null

  return (
    <section aria-labelledby="operational">
      <h2 id="operational" className={styles.sectionTitle}>
        Operasyonel Verimlilik
      </h2>
      <Grid min={160}>
        <StatCard label="Gönderilen Rapor" value={summary.reportsSubmitted} />
        <StatCard
          label="Vardiya Tamamlanma"
          value={completionRatio === null ? 'Veri yok' : formatRatioPercent(completionRatio)}
        />
        <StatCard label="Mutabakat: Uygun" value={summary.reconciliation.OK} />
        <StatCard label="Mutabakat: Uyarı" value={summary.reconciliation.WARNING} />
        <StatCard label="Mutabakat: Hata" value={summary.reconciliation.ERROR} />
        <StatCard label="Tamamlanan Kapanış Sayımı" value={summary.countsSubmittedInPeriod} />
        <StatCard label="Fire Kaydı" value={summary.wasteEntryCountInPeriod} />
      </Grid>
      <Note>
        Vardiya Tamamlanma = (Gönderildi + Kapandı) / (Planlandı + Devam ediyor + Gönderildi + Kapandı). İptal edilen
        vardiyalar sayılmaz.
      </Note>
    </section>
  )
}
