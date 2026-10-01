import type { BranchDashboardDetail } from '../../domain/dashboard'
import { fromKurus } from '../../domain/dashboard'
import { computeBranchRevenueKurus } from '../../domain/dashboard'
import {
  Card,
  EmptyState,
  LinkButton,
  RowCard,
  Stack,
  StatusChip,
} from '../../components/ui'
import { formatDate } from '../../utils/dates'
import { formatMoney } from '../../utils/format'
import { metricMoneyText } from './metricDisplay'
import styles from './Dashboard.module.css'

const SHIFT_LABEL: Record<string, string> = {
  scheduled: 'Planlandı',
  in_progress: 'Devam ediyor',
  submitted: 'Gönderildi',
  closed: 'Kapandı',
  cancelled: 'İptal',
}
const SHIFT_TONE: Record<string, 'neutral' | 'info' | 'success' | 'danger'> = {
  scheduled: 'neutral',
  in_progress: 'info',
  submitted: 'success',
  closed: 'success',
  cancelled: 'danger',
}
const RECONCILIATION_TONE = {
  OK: 'success',
  WARNING: 'warning',
  ERROR: 'danger',
} as const

/**
 * Drill-down for one branch: its own comparison row plus a per-shift
 * timeline for the same period — no separate fetch, this is the same raw
 * data already loaded for the comparison table (see ManagerDashboardPage).
 */
export function BranchDetail({ detail }: { detail: BranchDashboardDetail }) {
  const { row, recentReports, recentShifts } = detail
  const reportsByShift = new Map<string, typeof recentReports>()
  for (const r of recentReports) {
    const list = reportsByShift.get(r.shiftId)
    if (list) list.push(r)
    else reportsByShift.set(r.shiftId, [r])
  }

  return (
    <section aria-labelledby="branch-detail">
      <h2 id="branch-detail" className={styles.sectionTitle}>
        Şube Detayı · {row.branchName}
      </h2>
      <Card>
        <Stack gap="sm">
          <p className={styles.footnote}>
            Ciro:{' '}
            <strong>
              {row.reportCount === 0 ? 'Rapor yok' : metricMoneyText(row.revenue)}
            </strong>{' '}
            · Rapor: {row.reportCount} · Bekleyen mutabakat: {row.openReconciliationCount}
          </p>
          <div className={styles.chipRow}>
            <LinkButton to="reports/reconciliation" variant="secondary">
              Mutabakat Kuyruğuna Git
            </LinkButton>
            {row.inventoryTracked && (
              <LinkButton to="inventory" variant="secondary">
                Stok Durumuna Git
              </LinkButton>
            )}
          </div>
        </Stack>
      </Card>

      {recentShifts.length === 0 ? (
        <EmptyState
          icon="🕒"
          title="Bu dönemde vardiya yok"
          description="Seçili dönem için kayıt bulunamadı."
        />
      ) : (
        <Stack gap="sm">
          {recentShifts.map((s) => {
            const reports = reportsByShift.get(s.id) ?? []
            const revenue = computeBranchRevenueKurus(reports)
            return (
              <RowCard
                key={s.id}
                title={formatDate(s.businessDate)}
                subtitle={reports.length > 0 ? metricMoneyText(revenue) : 'Rapor yok'}
                trailing={
                  <StatusChip tone={SHIFT_TONE[s.status] ?? 'neutral'}>
                    {SHIFT_LABEL[s.status] ?? s.status}
                  </StatusChip>
                }
              >
                {reports.length > 0 && (
                  <div className={styles.chipRow}>
                    {reports.map((r, i) => (
                      <StatusChip
                        key={i}
                        tone={
                          r.status === 'cancelled'
                            ? 'neutral'
                            : RECONCILIATION_TONE[r.reconciliationStatus]
                        }
                      >
                        {r.reportType} · {formatMoney(r.grossRevenue)}
                        {r.status === 'cancelled' ? ' (iptal)' : ''}
                      </StatusChip>
                    ))}
                  </div>
                )}
              </RowCard>
            )
          })}
        </Stack>
      )}
      {row.grossProfit.status !== 'not_applicable' && (
        <Card>
          <p className={styles.footnote}>
            Brüt Kâr
            {row.grossProfit.status === 'partial' ? ' (Kısmi)' : ''}:{' '}
            {row.grossProfit.status === 'available' ||
            row.grossProfit.status === 'partial'
              ? formatMoney(fromKurus(row.grossProfit.value.amountKurus))
              : (row.grossProfit.reason ?? 'Veri yok')}
          </p>
        </Card>
      )}
    </section>
  )
}
