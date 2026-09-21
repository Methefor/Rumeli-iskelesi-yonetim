import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatSignedQuantity, formatQuantity } from '../../../utils/format'
import { formatDate, formatShortDate } from '../../../utils/dates'
import {
  DataBoundary,
  EmptyState,
  Grid,
  Input,
  LinkButton,
  PageHeader,
  RowCard,
  Stack,
  StatCard,
  StatusChip,
} from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import { useBranchInventory, useInventoryBase, useInventoryContext } from '../hooks'
import styles from './InventoryOverviewPage.module.css'

/**
 * Stock status for the selected branch: theoretical quantity (ledger balance),
 * the last physical count and its variance, and alerts. Used by both the
 * manager and employee layouts; what is offered follows the role. Physical
 * counts never change the theoretical figure shown here — see
 * INVENTORY_MODEL.md.
 */
export function InventoryOverviewPage() {
  const { branchName, can } = useInventoryContext()
  const base = useInventoryBase()
  const state = useBranchInventory()
  const [query, setQuery] = useState('')

  if (!can('inventory.read')) {
    return <Unauthorized message="Stok bilgisini görüntüleme yetkiniz yok." />
  }

  return (
    <Stack>
      <PageHeader title="Stok" subtitle={branchName || undefined} />

      <div className={styles.actions}>
        {can('inventory.receive') && (
          <LinkButton to={`${base}/receive`} fullWidth size="lg">
            Stok Girişi
          </LinkButton>
        )}
        {can('inventory.record') && (
          <LinkButton to={`${base}/waste`} fullWidth size="lg" variant="secondary">
            Fire Kaydı
          </LinkButton>
        )}
        {can('inventory.count') && (
          <LinkButton to={`${base}/count`} fullWidth size="lg" variant="secondary">
            Kapanış Sayımı
          </LinkButton>
        )}
      </div>

      <DataBoundary state={state} rows={4}>
        {({ items, balances, lastCounts, alerts }) => {
          const balanceById = new Map(
            balances.map((b) => [b.inventoryItemId, b.theoreticalQuantity]),
          )
          const countById = new Map(lastCounts.map((c) => [c.inventoryItemId, c]))
          const activeItems = items.filter((i) => i.isActive)
          const lastCountedAt = lastCounts.reduce<string | null>(
            (max, c) => (max === null || c.countedAt > max ? c.countedAt : max),
            null,
          )

          const needle = query.trim().toLocaleLowerCase('tr-TR')
          const visible = items
            .filter(
              (i) =>
                needle === '' ||
                i.name.toLocaleLowerCase('tr-TR').includes(needle) ||
                i.code.toLocaleLowerCase('tr-TR').includes(needle),
            )
            .sort(
              (a, b) =>
                Number(b.isActive) - Number(a.isActive) ||
                a.name.localeCompare(b.name, 'tr'),
            )

          if (items.length === 0) {
            return (
              <EmptyState
                icon="📦"
                title="Bu şubede stok takibi yok"
                description={
                  can('inventory.item.manage')
                    ? 'Stok takibini başlatmak için önce ürünlerinizi ekleyin.'
                    : 'Bu şube için henüz tanımlı bir ürün yok.'
                }
                action={
                  can('inventory.item.manage') ? (
                    <LinkButton to={`${base}/items`}>Ürün Ekle</LinkButton>
                  ) : undefined
                }
              />
            )
          }

          return (
            <Stack>
              <Grid min={140}>
                <StatCard label="Aktif ürün" value={activeItems.length} />
                <StatCard label="Uyarı" value={alerts.length} />
                <StatCard
                  label="Son sayım"
                  value={lastCountedAt ? formatShortDate(lastCountedAt) : 'Yok'}
                />
              </Grid>

              {alerts.length > 0 && (
                <section aria-labelledby="alerts-title">
                  <h2 id="alerts-title" className={styles.sectionTitle}>
                    Uyarılar
                  </h2>
                  <Stack gap="sm">
                    {alerts.map((alert) => (
                      <div
                        key={`${alert.kind}-${alert.inventoryItemId}`}
                        className={styles.alert}
                        role="status"
                      >
                        <StatusChip
                          tone={alert.kind === 'negative_stock' ? 'danger' : 'warning'}
                        >
                          {alert.kind === 'negative_stock'
                            ? 'Eksi stok'
                            : alert.kind === 'count_variance'
                              ? 'Sayım farkı'
                              : 'Sayılmadı'}
                        </StatusChip>
                        <span>{alert.message}</span>
                      </div>
                    ))}
                  </Stack>
                </section>
              )}

              <Input
                label="Ürün ara"
                type="search"
                placeholder="Ad veya kod"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <section aria-labelledby="items-title">
                <h2 id="items-title" className={styles.sectionTitle}>
                  Ürünler ({visible.length})
                </h2>
                {visible.length === 0 ? (
                  <EmptyState
                    icon="🔎"
                    title="Eşleşen ürün yok"
                    description="Arama ölçütünüzü değiştirin."
                  />
                ) : (
                  <Stack gap="sm">
                    {visible.map((item) => {
                      const theoretical = balanceById.get(item.id) ?? 0
                      const count = countById.get(item.id)
                      return (
                        <RowCard
                          key={item.id}
                          title={item.name}
                          subtitle={`${item.code} · ${item.unit}`}
                          meta={
                            count
                              ? `Son sayım: ${formatQuantity(count.physicalQuantity)} ${item.unit} · ${formatDate(count.countedAt)}`
                              : 'Henüz sayılmadı'
                          }
                          trailing={
                            <>
                              <strong
                                className={
                                  theoretical < 0 ? styles.negative : styles.quantity
                                }
                              >
                                {formatQuantity(theoretical)} {item.unit}
                              </strong>
                              <span className={styles.caption}>kayıtlı stok</span>
                              {!item.isActive && <StatusChip>Pasif</StatusChip>}
                              {item.isActive && count && count.varianceQuantity !== 0 && (
                                <StatusChip tone="warning">
                                  Fark {formatSignedQuantity(count.varianceQuantity)}
                                </StatusChip>
                              )}
                            </>
                          }
                        />
                      )
                    })}
                  </Stack>
                )}
              </section>

              <nav className={styles.links} aria-label="Stok işlemleri">
                <Link to={`${base}/movements`}>
                  Hareket Geçmişi{can('inventory.adjust') ? ' ve Düzeltme' : ''}
                </Link>
                {can('inventory.item.manage') && (
                  <Link to={`${base}/items`}>Ürünleri Yönet</Link>
                )}
                {can('inventory.cost.read') && <Link to={`${base}/costs`}>Maliyet</Link>}
                {can('inventory.cost.read') && (
                  <Link to={`${base}/profit`}>Brüt Kâr</Link>
                )}
              </nav>
            </Stack>
          )
        }}
      </DataBoundary>
    </Stack>
  )
}
