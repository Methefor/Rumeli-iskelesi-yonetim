import type { OrganizationSummary } from '../../domain/dashboard'
import { fromKurus } from '../../domain/dashboard'
import { formatMoney } from '../../utils/format'
import { partialSuffix, revenueHero } from './metricDisplay'
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
  const totalShifts =
    summary.shifts.scheduled +
    summary.shifts.inProgress +
    summary.shifts.submitted +
    summary.shifts.closed
  const inventoryAlerts =
    summary.inventoryAlertCount.status === 'available'
      ? summary.inventoryAlertCount.value
      : null
  const grossProfit =
    summary.grossProfit.status === 'available' || summary.grossProfit.status === 'partial'
      ? formatMoney(fromKurus(summary.grossProfit.value.amountKurus))
      : summary.grossProfit.status === 'not_applicable'
        ? 'Takip edilmiyor'
        : 'Veri yok'

  return (
    <section aria-labelledby="org-overview" className={styles.commandDeck}>
      <div className={styles.commandHeader}>
        <div>
          <span className={styles.liveSignal}>CANLI OPERASYON ÖZETİ</span>
          <h2 id="org-overview">
            {summary.period.label} · {summary.branchCount} şube
          </h2>
        </div>
        <span className={styles.timezone}>Europe / Istanbul</span>
      </div>

      <div className={styles.commandGrid}>
        <div className={styles.revenueHero}>
          <span className={styles.heroLabel}>Toplam Ciro</span>
          <strong>
            {summary.reportCount === 0
              ? 'Rapor yok'
              : revenueHero(summary.totalRevenue, summary.provisionalRevenueKurus).main}
          </strong>
          {summary.reportCount > 0 && revenueHero(summary.totalRevenue, summary.provisionalRevenueKurus).note && (
            <span>{revenueHero(summary.totalRevenue, summary.provisionalRevenueKurus).note}</span>
          )}
          {summary.provisionalDays > 0 && (
            <span>{summary.provisionalDays} günün Z raporu yok: ciro kesinleşmedi</span>
          )}
          {summary.zBelowXDays > 0 && <span>Uyarı: {summary.zBelowXDays} günde Z, X değerinden küçük</span>}
          <span>{summary.reportCount} Gönderilen Rapor</span>
        </div>

        <div className={styles.signalGrid}>
          <article
            className={
              summary.openReconciliationCount > 0
                ? styles.signalCritical
                : styles.signalCalm
            }
          >
            <span>Açık Mutabakat Sorunu</span>
            <strong>{summary.openReconciliationCount}</strong>
            <small>
              {summary.openReconciliationCount > 0 ? 'İnceleme gerekiyor' : 'Sorun yok'}
            </small>
          </article>
          <article>
            <span>Vardiya (tamamlanan / toplam)</span>
            <strong>
              {summary.shifts.completed} / {totalShifts}
            </strong>
            <small>
              {summary.shifts.inProgress > 0
                ? `${summary.shifts.inProgress} devam ediyor`
                : 'Anlık durum'}
            </small>
          </article>
          <article
            className={
              (inventoryAlerts ?? 0) > 0 ? styles.signalWarning : styles.signalCalm
            }
          >
            <span>Stok Uyarısı</span>
            <strong>
              {summary.inventoryTrackedBranchCount === 0 ? '—' : (inventoryAlerts ?? '—')}
            </strong>
            <small>{summary.inventoryTrackedBranchCount} şube stok izliyor</small>
          </article>
          <article>
            <span>Brüt Kâr{partialSuffix(summary.grossProfit)}</span>
            <strong className={styles.compactValue}>{grossProfit}</strong>
            <small>Net kâr değildir</small>
          </article>
        </div>
      </div>

      <div className={styles.commandFooter}>
        <span>{summary.branchCount} şube izleniyor</span>
        <p>
          Dönem:{' '}
          {summary.period.fromDate === summary.period.toDateInclusive
            ? summary.period.fromDate
            : `${summary.period.fromDate} – ${summary.period.toDateInclusive}`}{' '}
          · İstanbul saati
        </p>
      </div>
    </section>
  )
}
