import type { OrganizationSummary } from '../../domain/dashboard'
import { fromKurus } from '../../domain/dashboard'
import { Card, Grid, StatCard } from '../../components/ui'
import { formatMoney } from '../../utils/format'
import { metricMoneyText, partialSuffix } from './metricDisplay'
import styles from './Dashboard.module.css'

/**
 * Top-of-page organization overview. Every card comes straight from
 * `OrganizationSummary` (built by `domain/dashboard`) — no calculation
 * happens here, only presentation. A card is only shown when it is
 * something a manager can actually rely on; there is no "Ortalama Sepet",
 * "Saatlik Ciro" or "Net Kâr" card because nothing in this schema supports
 * them yet (see DASHBOARD_MODEL.md).
 */
export function OrganizationOverview({ summary }: { summary: OrganizationSummary }) {
  return (
    <section aria-labelledby="org-overview">
      <h2 id="org-overview" className={styles.sectionTitle}>
        Genel Bakış · {summary.period.label} · {summary.branchCount} şube
      </h2>
      <Grid min={160}>
        <StatCard label="Toplam Ciro" value={metricMoneyText(summary.totalRevenue)} />
        <StatCard label="Gönderilen Rapor" value={summary.reportCount} />
        <StatCard label="Açık Mutabakat Sorunu" value={summary.openReconciliationCount} />
        <StatCard
          label="Vardiya (tamamlanan / toplam)"
          value={`${summary.shifts.completed} / ${summary.shifts.scheduled + summary.shifts.inProgress + summary.shifts.submitted + summary.shifts.closed}`}
        />
        <StatCard
          label={`Brüt Kâr${partialSuffix(summary.grossProfit)}`}
          value={
            summary.grossProfit.status === 'available' || summary.grossProfit.status === 'partial'
              ? formatMoney(fromKurus(summary.grossProfit.value.amountKurus))
              : summary.grossProfit.status === 'not_applicable'
                ? 'Takip edilmiyor'
                : 'Veri yok'
          }
        />
        <StatCard
          label="Stok Uyarısı"
          value={
            summary.inventoryTrackedBranchCount === 0
              ? 'Takip edilmiyor'
              : summary.inventoryAlertCount.status === 'available'
                ? summary.inventoryAlertCount.value
                : 'Veri yok'
          }
        />
      </Grid>
      <Card className={styles.footnoteCard}>
        <p className={styles.footnote}>
          Dönem: {summary.period.fromDate === summary.period.toDateInclusive
            ? summary.period.fromDate
            : `${summary.period.fromDate} – ${summary.period.toDateInclusive}`}{' '}
          (İstanbul saati). Brüt Kâr, işletme giderlerini (kira, maaş vb.) içermez — Net Kâr değildir.
        </p>
      </Card>
    </section>
  )
}
