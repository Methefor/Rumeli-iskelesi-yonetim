import { deriveInventoryAlerts } from '../../domain/inventory'
import { calculateDailyRevenue } from '../../domain/revenue'
import { formatDate, formatTime, istanbulDate } from '../../utils/dates'
import { formatMoney } from '../../utils/format'
import {
  DataBoundary,
  EmptyState,
  Grid,
  LinkButton,
  PageHeader,
  RowCard,
  Stack,
  StatCard,
  StatusChip,
} from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../hooks/useAuth'
import { useSelectedBranch } from '../../hooks/useSelectedBranch'
import {
  listBranchReports,
  listBranchShifts,
  listInventoryCounts,
  listInventoryItems,
  listLastCounts,
  listReconciliationQueue,
  listStockBalances,
} from '../../services/data'
import styles from './Home.module.css'

const SHIFT_TONE = {
  scheduled: 'neutral',
  in_progress: 'info',
  submitted: 'success',
  closed: 'success',
  cancelled: 'danger',
} as const
const SHIFT_LABEL: Record<string, string> = {
  scheduled: 'Planlandı',
  in_progress: 'Devam ediyor',
  submitted: 'Gönderildi',
  closed: 'Kapandı',
  cancelled: 'İptal',
}

/** Operational overview for the selected branch: today's shifts, reports, reconciliation and stock at a glance. */
export function ManagerHomePage() {
  const { profile } = useAuth()
  const { selectedBranchId, selectedBranch } = useSelectedBranch()
  const today = istanbulDate()

  const state = useAsync(
    selectedBranchId ? `manager-home:${selectedBranchId}:${today}` : null,
    async () => {
      if (!selectedBranchId) return null
      const branchId = selectedBranchId
      const [shifts, reports, queue, items] = await Promise.all([
        listBranchShifts(branchId),
        listBranchReports(branchId),
        listReconciliationQueue(branchId),
        listInventoryItems(branchId).catch(() => []),
      ])

      const tracksInventory = items.length > 0
      let alertCount = 0
      let countedToday = false
      if (tracksInventory) {
        const [balances, lastCounts, counts] = await Promise.all([
          listStockBalances(branchId),
          listLastCounts(items.map((i) => i.id)),
          listInventoryCounts(branchId, 5),
        ])
        alertCount = deriveInventoryAlerts(items, balances, lastCounts).length
        countedToday = counts.some(
          (c) => c.status === 'submitted' && c.businessDate === today,
        )
      }

      const todaysShifts = shifts.filter(
        (s) => s.businessDate === today && s.status !== 'cancelled',
      )
      const shiftIds = new Set(todaysShifts.map((s) => s.id))
      const todaysReports = reports.filter(
        (r) => r.status !== 'cancelled' && shiftIds.has(r.shiftId),
      )

      // Shared X/Z rule (never re-derived here): morning X + (evening Z - X).
      const latest = (type: 'X' | 'Z') =>
        todaysReports.filter((r) => r.reportType === type).at(0)?.grossRevenue ?? null
      const todaysRevenue = calculateDailyRevenue({
        morningX: latest('X'),
        eveningZ: latest('Z'),
      })

      return {
        todaysShifts,
        todaysReports,
        todaysRevenue,
        flagged: queue.length,
        tracksInventory,
        alertCount,
        countedToday,
      }
    },
  )

  return (
    <Stack>
      <PageHeader
        title="Genel Bakış"
        subtitle={`${selectedBranch?.name ?? ''} · ${formatDate(today)}`}
      />
      {profile?.fullName && (
        <p className={styles.greeting}>Merhaba, {profile.fullName}.</p>
      )}

      <DataBoundary state={state} rows={4}>
        {(data) => {
          if (data === null) {
            return (
              <EmptyState
                icon="🏬"
                title="Şube seçilmedi"
                description="Görüntülenecek bir şube bulunamadı."
              />
            )
          }
          return (
            <Stack>
              <Grid min={150}>
                <StatCard label="Bugünkü vardiya" value={data.todaysShifts.length} />
                <StatCard label="Gönderilen rapor" value={data.todaysReports.length} />
                <StatCard
                  label="Bugünkü ciro (X/Z)"
                  value={formatMoney(data.todaysRevenue)}
                />
                <StatCard label="Mutabakat bekleyen" value={data.flagged} />
                <StatCard
                  label={data.tracksInventory ? 'Stok uyarısı' : 'Stok takibi'}
                  value={data.tracksInventory ? data.alertCount : 'Yok'}
                />
              </Grid>

              {(data.flagged > 0 ||
                (data.tracksInventory && !data.countedToday) ||
                data.alertCount > 0) && (
                <section aria-labelledby="attention">
                  <h2 id="attention" className={styles.sectionTitle}>
                    Dikkat gerektirenler
                  </h2>
                  <Stack gap="sm">
                    {data.flagged > 0 && (
                      <RowCard
                        title={`${data.flagged} raporun mutabakatı bekliyor`}
                        subtitle="Kasa toplamı ile kategori toplamı arasında fark var."
                        trailing={<StatusChip tone="danger">İncele</StatusChip>}
                      >
                        <LinkButton to="reports/reconciliation" variant="secondary">
                          Mutabakat Kuyruğu
                        </LinkButton>
                      </RowCard>
                    )}
                    {data.tracksInventory && !data.countedToday && (
                      <RowCard
                        title="Bugün kapanış sayımı yapılmadı"
                        subtitle="Fiziksel sayım henüz gönderilmedi."
                        trailing={<StatusChip tone="warning">Bekliyor</StatusChip>}
                      >
                        <LinkButton to="inventory/count" variant="secondary">
                          Sayım Yap
                        </LinkButton>
                      </RowCard>
                    )}
                    {data.alertCount > 0 && (
                      <RowCard
                        title={`${data.alertCount} stok uyarısı`}
                        subtitle="Eksi stok veya sayım farkı olan ürünler var."
                        trailing={<StatusChip tone="warning">İncele</StatusChip>}
                      >
                        <LinkButton to="inventory" variant="secondary">
                          Stok Durumu
                        </LinkButton>
                      </RowCard>
                    )}
                  </Stack>
                </section>
              )}

              <section aria-labelledby="shifts-today">
                <h2 id="shifts-today" className={styles.sectionTitle}>
                  Bugünün vardiyaları
                </h2>
                {data.todaysShifts.length === 0 ? (
                  <EmptyState
                    icon="🕒"
                    title="Bugün için vardiya yok"
                    description="Vardiya planlamak için Vardiyalar bölümünü kullanın."
                  />
                ) : (
                  <Stack gap="sm">
                    {data.todaysShifts.map((s) => (
                      <RowCard
                        key={s.id}
                        title={s.definition.name}
                        subtitle={`${formatTime(s.definition.startHour, s.definition.startMinute)}–${formatTime(s.definition.endHour, s.definition.endMinute)}`}
                        trailing={
                          <StatusChip
                            tone={
                              SHIFT_TONE[s.status as keyof typeof SHIFT_TONE] ?? 'neutral'
                            }
                          >
                            {SHIFT_LABEL[s.status] ?? s.status}
                          </StatusChip>
                        }
                      />
                    ))}
                  </Stack>
                )}
              </section>

              <section aria-labelledby="quick">
                <h2 id="quick" className={styles.sectionTitle}>
                  Hızlı işlemler
                </h2>
                <div className={styles.quick}>
                  <LinkButton to="shifts/assign" variant="secondary" fullWidth>
                    Vardiya Ata
                  </LinkButton>
                  <LinkButton to="reports" variant="secondary" fullWidth>
                    Satış Raporları
                  </LinkButton>
                  <LinkButton to="inventory/receive" variant="secondary" fullWidth>
                    Stok Girişi
                  </LinkButton>
                  <LinkButton to="inventory/waste" variant="secondary" fullWidth>
                    Fire Kaydı
                  </LinkButton>
                </div>
              </section>
            </Stack>
          )
        }}
      </DataBoundary>
    </Stack>
  )
}
