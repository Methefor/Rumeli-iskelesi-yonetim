import type { CSSProperties } from 'react'
import { getBranchTheme, BRANCH_THEME_ACCENT } from '../../components/navigation/branchTheme'
import type { BranchComparisonRow } from '../../domain/dashboard'
import { fromKurus } from '../../domain/dashboard'
import { Card, RowCard, Stack, StatusChip } from '../../components/ui'
import { formatMoney, formatRatioPercent } from '../../utils/format'
import { metricIntText, metricMoneyText, partialSuffix } from './metricDisplay'
import styles from './Dashboard.module.css'

function ShareText({ row }: { row: BranchComparisonRow }) {
  const share = row.revenueShare
  if (share.status === 'available' || share.status === 'partial') return <>{formatRatioPercent(share.value)}</>
  return <>{share.reason ?? 'Veri yok'}</>
}

function GrossProfitText({ row }: { row: BranchComparisonRow }) {
  const gp = row.grossProfit
  if (gp.status === 'available' || gp.status === 'partial') {
    return (
      <>
        {formatMoney(fromKurus(gp.value.amountKurus))}
        {partialSuffix(gp)}
      </>
    )
  }
  return <>{gp.status === 'not_applicable' ? 'Takip edilmiyor' : 'Veri yok'}</>
}

/**
 * Same period, same status/cancellation rules for every branch (enforced by
 * `domain/dashboard`, not here) — this component only renders whatever each
 * row already says. A branch without inventory tracking shows "Takip
 * edilmiyor" for inventory-only metrics rather than a misleading dash or
 * zero, and never the same visual treatment as a branch that IS tracked but
 * has zero alerts.
 */
export function BranchComparison({
  rows,
  onSelectBranch,
  selectedBranchId,
}: {
  rows: BranchComparisonRow[]
  onSelectBranch: (branchId: string) => void
  selectedBranchId: string | null
}) {
  return (
    <section aria-labelledby="branch-comparison">
      <h2 id="branch-comparison" className={styles.sectionTitle}>
        Şube Karşılaştırması
      </h2>
      <Stack gap="sm">
        {rows.map((row) => {
          const theme = getBranchTheme({ id: row.branchId, key: row.branchKey, name: row.branchName })
          const selected = row.branchId === selectedBranchId
          return (
            <Card
              key={row.branchId}
              interactive
              className={[styles.branchCard, selected ? styles.branchCardSelected : ''].join(' ')}
              style={{ '--dot': BRANCH_THEME_ACCENT[theme] } as CSSProperties}
            >
              <button
                type="button"
                className={styles.branchCardButton}
                onClick={() => onSelectBranch(row.branchId)}
                aria-pressed={selected}
              >
                <span className={styles.branchDot} aria-hidden="true" />
                <span className={styles.branchName}>{row.branchName}</span>
                <span className={styles.branchRevenue}>{metricMoneyText(row.revenue)}</span>
              </button>
              <div className={styles.branchMetaGrid}>
                <div>
                  <span className={styles.metaLabel}>Ciro payı</span>
                  <span className={styles.metaValue}>
                    <ShareText row={row} />
                  </span>
                </div>
                <div>
                  <span className={styles.metaLabel}>Rapor</span>
                  <span className={styles.metaValue}>{row.reportCount}</span>
                </div>
                <div>
                  <span className={styles.metaLabel}>Vardiya</span>
                  <span className={styles.metaValue}>
                    {row.shifts.completed}/
                    {row.shifts.scheduled + row.shifts.inProgress + row.shifts.submitted + row.shifts.closed}
                  </span>
                </div>
                <div>
                  <span className={styles.metaLabel}>Brüt Kâr</span>
                  <span className={styles.metaValue}>
                    <GrossProfitText row={row} />
                  </span>
                </div>
              </div>
              <div className={styles.chipRow}>
                {row.reconciliation.ERROR > 0 && (
                  <StatusChip tone="danger">{row.reconciliation.ERROR} Hata</StatusChip>
                )}
                {row.reconciliation.WARNING > 0 && (
                  <StatusChip tone="warning">{row.reconciliation.WARNING} Uyarı</StatusChip>
                )}
                {row.reconciliation.OK > 0 && (
                  <StatusChip tone="success">{row.reconciliation.OK} Uygun</StatusChip>
                )}
                {row.openReconciliationCount > 0 && (
                  <StatusChip tone="danger">{row.openReconciliationCount} bekleyen mutabakat</StatusChip>
                )}
                {row.inventoryTracked ? (
                  <StatusChip tone={row.inventoryAlertCount.status === 'available' && row.inventoryAlertCount.value > 0 ? 'warning' : 'neutral'}>
                    Stok uyarısı: {metricIntText(row.inventoryAlertCount)}
                  </StatusChip>
                ) : (
                  <StatusChip tone="neutral">Stok takibi yok</StatusChip>
                )}
              </div>
            </Card>
          )
        })}
        {rows.length === 0 && (
          <RowCard title="Görüntülenecek şube yok" subtitle="Erişiminiz olan bir şube bulunamadı." />
        )}
      </Stack>
    </section>
  )
}
