import type { OperationalSummary } from '../../domain/dashboard'
import type { CSSProperties } from 'react'
import { Note } from '../../components/ui'
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
    summary.shifts.scheduled +
    summary.shifts.inProgress +
    summary.shifts.submitted +
    summary.shifts.closed
  const completionRatio =
    totalNonCancelled > 0 ? summary.shifts.completed / totalNonCancelled : null
  const completionPercent =
    completionRatio === null ? 0 : Math.round(completionRatio * 100)
  const reconciliationTotal =
    summary.reconciliation.OK +
    summary.reconciliation.WARNING +
    summary.reconciliation.ERROR

  return (
    <section aria-labelledby="operational" className={styles.operationsPanel}>
      <h2 id="operational" className={styles.sectionTitle}>
        Operasyonel Verimlilik
      </h2>
      <div className={styles.operationsGrid}>
        <article className={styles.completionCard}>
          <div
            className={styles.completionRing}
            style={{ '--completion': `${completionPercent * 3.6}deg` } as CSSProperties}
          >
            <span>
              {completionRatio === null ? '—' : formatRatioPercent(completionRatio)}
            </span>
          </div>
          <div>
            <span className={styles.metaLabel}>Vardiya Tamamlanma</span>
            <strong>
              {summary.shifts.completed} / {totalNonCancelled}
            </strong>
            <small>tamamlanan / planlanan</small>
          </div>
        </article>

        <article className={styles.reconciliationCard}>
          <div className={styles.panelHeading}>
            <span>Mutabakat Kalitesi</span>
            <strong>{reconciliationTotal} rapor</strong>
          </div>
          <div className={styles.reconciliationTrack} aria-hidden="true">
            <span
              style={{ flex: summary.reconciliation.OK }}
              className={styles.trackOk}
            />
            <span
              style={{ flex: summary.reconciliation.WARNING }}
              className={styles.trackWarning}
            />
            <span
              style={{ flex: summary.reconciliation.ERROR }}
              className={styles.trackError}
            />
          </div>
          <div className={styles.reconciliationLegend}>
            <span>
              Mutabakat: Uygun <strong>{summary.reconciliation.OK}</strong>
            </span>
            <span>
              Mutabakat: Uyarı <strong>{summary.reconciliation.WARNING}</strong>
            </span>
            <span>
              Mutabakat: Hata <strong>{summary.reconciliation.ERROR}</strong>
            </span>
          </div>
        </article>

        <article className={styles.activityCard}>
          <div>
            <span>Gönderilen Rapor</span>
            <strong>{summary.reportsSubmitted}</strong>
          </div>
          <div>
            <span>Tamamlanan Kapanış Sayımı</span>
            <strong>{summary.countsSubmittedInPeriod}</strong>
          </div>
          <div>
            <span>Fire Kaydı</span>
            <strong>{summary.wasteEntryCountInPeriod}</strong>
          </div>
        </article>
      </div>
      <Note>
        Vardiya Tamamlanma = (Gönderildi + Kapandı) / (Planlandı + Devam ediyor +
        Gönderildi + Kapandı). İptal edilen vardiyalar sayılmaz.
      </Note>
    </section>
  )
}
