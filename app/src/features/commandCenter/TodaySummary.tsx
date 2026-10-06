import type { BranchComparisonRow, OrganizationSummary } from '../../domain/dashboard'
import { fromKurus } from '../../domain/dashboard'
import { formatMoney } from '../../utils/format'
import { revenueHero } from '../dashboard/metricDisplay'
import styles from './CommandCenter.module.css'

/**
 * A. TODAY SUMMARY. Every number comes from the existing dashboard model (domain/dashboard): Z = finalized revenue, an X-only day is
 * provisional and shown SEPARATELY (never added), partial is labelled, unavailable is "Veri yok", never 0. Transactions and average
 * basket are not part of the dashboard model and are not shown (not supported here).
 */
export function TodaySummary({ organization, rows, businessDate }: { organization: OrganizationSummary; rows: BranchComparisonRow[]; businessDate: string }) {
  const hero = revenueHero(organization.totalRevenue, organization.provisionalRevenueKurus)
  const complete = rows.filter((r) => r.revenueBreakdown.finalizedDays > 0).length
  const waiting = rows.filter((r) => r.revenueBreakdown.provisionalDays > 0).length
  const noReport = rows.filter((r) => r.reportCount === 0).length
  const gp = organization.grossProfit
  return (
    <section aria-labelledby="cc-today" className={styles.hero}>
      <span className={styles.heroLabel} id="cc-today">
        Bugün · {businessDate}
      </span>
      <strong className={styles.heroValue}>{organization.reportCount === 0 ? 'Rapor yok' : hero.main}</strong>
      {organization.reportCount > 0 && <p className={styles.heroNote}>Kesinleşmiş ciro (Z)</p>}
      {hero.note && <p className={styles.heroNote}>{hero.note}</p>}
      {organization.provisionalRevenueKurus > 0 && (
        <p className={styles.heroNote}>
          Geçici X: {formatMoney(fromKurus(organization.provisionalRevenueKurus))} — kesinleşmiş ciroya dahil değil
        </p>
      )}
      <div className={styles.heroRow}>
        <span>
          {complete}/{rows.length} şubenin Z raporu tamam
        </span>
        {waiting > 0 && <span>{waiting} şube Z bekliyor</span>}
        {noReport > 0 && <span>{noReport} şubede rapor yok</span>}
        <span>{organization.reportCount} rapor</span>
      </div>
      {(gp.status === 'available' || gp.status === 'partial') && (
        <p className={styles.heroNote}>
          Brüt kâr: {formatMoney(fromKurus(gp.value.amountKurus))}
          {gp.status === 'partial' ? ' · Kısmi' : ''}
        </p>
      )}
    </section>
  )
}
