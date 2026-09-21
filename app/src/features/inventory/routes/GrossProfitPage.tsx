import { useState } from 'react'
import { summarizeGrossProfit, type GrossProfitStatus } from '../../../domain/inventory'
import { formatMoney, formatQuantity, formatRatioPercent } from '../../../utils/format'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import {
  DataBoundary,
  EmptyState,
  Grid,
  Note,
  PageHeader,
  RowCard,
  SegmentedControl,
  Stack,
  StatCard,
  StatusChip,
} from '../../../components/ui'
import { useAsync } from '../../../hooks/useAsync'
import { getInventoryGrossProfit } from '../../../services/data'
import { useInventoryBase, useInventoryContext } from '../hooks'
import styles from './GrossProfitPage.module.css'

type Period = 'today' | 'week' | 'month'

const STATUS_LABEL: Record<GrossProfitStatus, string> = {
  complete: 'Tam',
  partial: 'Kısmi',
  unavailable: 'Hesaplanamadı',
}
const STATUS_TONE: Record<GrossProfitStatus, 'success' | 'warning' | 'neutral'> = {
  complete: 'success',
  partial: 'warning',
  unavailable: 'neutral',
}

function periodRange(period: Period): { from: string; to: string } {
  const to = new Date(Date.now() + 60_000)
  const days = period === 'today' ? 1 : period === 'week' ? 7 : 30
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
  return { from: from.toISOString(), to: to.toISOString() }
}

/**
 * Gross profit per product. GROSS profit only: product revenue minus the cost
 * of the goods sold. Payroll, rent, utilities and other overhead are NOT
 * included, so this is never labelled net profit. When revenue cannot be
 * reliably mapped to products or a cost is missing, the figure is shown as
 * partial/unavailable — never invented.
 */
export function GrossProfitPage() {
  const { branchId, branchName, can } = useInventoryContext()
  const base = useInventoryBase()
  const [period, setPeriod] = useState<Period>('week')

  const data = useAsync(
    branchId && can('inventory.cost.read') ? `gp:${branchId}:${period}` : null,
    async () => {
      if (!branchId) return summarizeGrossProfit([], 0)
      const { from, to } = periodRange(period)
      const result = await getInventoryGrossProfit(branchId, from, to)
      return summarizeGrossProfit(result.lines, result.unmappedCategoryRevenue)
    },
  )

  if (!can('inventory.cost.read')) {
    return <Unauthorized message="Brüt kâr bilgisini görüntüleme yetkiniz yok." />
  }

  return (
    <Stack>
      <PageHeader
        title="Brüt Kâr"
        subtitle={branchName || undefined}
        back={{ to: base, label: 'Stok' }}
      />

      <SegmentedControl
        label="Dönem"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'today', label: 'Bugün' },
          { value: 'week', label: 'Son 7 gün' },
          { value: 'month', label: 'Son 30 gün' },
        ]}
      />

      <DataBoundary state={data} rows={3}>
        {(summary) => {
          return (
            <Stack>
              <Grid min={150}>
                <StatCard
                  label="Brüt kâr"
                  value={
                    summary.status === 'unavailable'
                      ? '—'
                      : formatMoney(summary.grossProfit)
                  }
                />
                <StatCard
                  label="Kapsanan ürün geliri"
                  value={formatMoney(summary.coveredRevenue)}
                />
              </Grid>

              <div className={styles.statusRow}>
                <StatusChip tone={STATUS_TONE[summary.status]}>
                  {STATUS_LABEL[summary.status]}
                </StatusChip>
                <span className={styles.statusText}>
                  {summary.status === 'complete' &&
                    'Ürüne bağlı tüm satışların maliyeti biliniyor.'}
                  {summary.status === 'partial' &&
                    'Bu rakam yalnızca maliyeti bilinen ve ürüne bağlanan satışları kapsar.'}
                  {summary.status === 'unavailable' &&
                    'Bu dönem için güvenilir bir brüt kâr hesaplanamadı; rakam uydurulmaz.'}
                </span>
              </div>

              {summary.unmappedCategoryRevenue > 0 && (
                <Note>
                  Ürüne bağlanmamış kategori geliri:{' '}
                  <strong>{formatMoney(summary.unmappedCategoryRevenue)}</strong>. Bu
                  gelirin ürün bazlı maliyeti bilinmediği için brüt kâra dahil edilmedi.
                </Note>
              )}
              {summary.uncoveredProductRevenue > 0 && (
                <Note>
                  Maliyeti eksik ürünlerin geliri:{' '}
                  <strong>{formatMoney(summary.uncoveredProductRevenue)}</strong>.
                </Note>
              )}

              {summary.lines.length === 0 ? (
                <EmptyState
                  icon="🧾"
                  title="Ürüne bağlı satış yok"
                  description="Bu dönemde ürün bazlı satış kaydı bulunmuyor."
                />
              ) : (
                <Stack gap="sm">
                  {summary.lines.map((line) => (
                    <RowCard
                      key={line.inventoryItemId}
                      title={line.name}
                      subtitle={`${formatQuantity(line.soldQuantity)} ${line.unit} satıldı · Gelir ${formatMoney(line.productRevenue)}`}
                      meta={
                        line.note ?? `Satılan malın maliyeti ${formatMoney(line.cogs)}`
                      }
                      trailing={
                        line.status === 'complete' && line.grossProfit !== null ? (
                          <>
                            <strong>{formatMoney(line.grossProfit)}</strong>
                            {line.grossMargin !== null && (
                              <span className={styles.margin}>
                                Marj {formatRatioPercent(line.grossMargin)}
                              </span>
                            )}
                          </>
                        ) : (
                          <StatusChip tone={STATUS_TONE[line.status]}>
                            {STATUS_LABEL[line.status]}
                          </StatusChip>
                        )
                      }
                    />
                  ))}
                </Stack>
              )}

              <Note>
                Brüt kâr = ürün satış geliri − satılan malın maliyeti (satış anındaki
                maliyet kaydıyla). Personel, kira, enerji ve diğer giderler dahil
                değildir; bu bir net kâr değildir.
              </Note>
            </Stack>
          )
        }}
      </DataBoundary>
    </Stack>
  )
}
