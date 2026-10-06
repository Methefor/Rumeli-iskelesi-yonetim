import { useState } from 'react'
import { DataBoundary, LinkButton, Note, PageHeader, RowCard, SegmentedControl, Stack, StatCard, StatusChip } from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import { PENDING_STATUSES } from '../../../domain/procurement'
import { useAsync } from '../../../hooks/useAsync'
import { getOrderSuggestions, getProcurementAttention, listPurchaseOrders } from '../../../services/data'
import { formatQuantity } from '../../../utils/format'
import { PROCUREMENT_BASE, useProcurementContext } from '../hooks'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from '../labels'

type Filter = 'open' | 'all'

/** Procurement home: what needs attention, the orders of the selected branch and the deterministic order suggestions. */
export function PurchaseOrdersPage() {
  const { branchId, branchName, can } = useProcurementContext()
  const allowed = can('procurement.order.read')
  const [filter, setFilter] = useState<Filter>('open')
  const state = useAsync(allowed && branchId ? `procurement:${branchId}` : null, async () => ({
    attention: await getProcurementAttention(branchId as string),
    orders: await listPurchaseOrders(branchId as string),
    suggestions: await getOrderSuggestions(branchId as string),
  }))

  if (!allowed) return <Unauthorized message="Sipariş yönetimi için yetkiniz yok." />

  return (
    <Stack>
      <PageHeader title="Tedarik ve siparişler" subtitle={branchName || undefined} back={{ to: '/app/manager/management', label: 'Yönetim' }} />
      <Stack gap="sm">
        {can('procurement.order.create') && <LinkButton to={`${PROCUREMENT_BASE}/orders/new`}>Yeni sipariş</LinkButton>}
        <LinkButton to={`${PROCUREMENT_BASE}/suppliers`} variant="secondary">Tedarikçiler</LinkButton>
        <LinkButton to={`${PROCUREMENT_BASE}/supply`} variant="secondary">Tedarik ayarları</LinkButton>
      </Stack>
      <DataBoundary state={state} rows={4}>
        {({ attention, orders, suggestions }) => {
          const shown = orders.filter((o) => (filter === 'all' ? true : o.status === 'DRAFT' || PENDING_STATUSES.includes(o.status)))
          const reorder = suggestions.filter((s) => s.reorderNeeded === true)
          return (
            <Stack>
              <h2>Dikkat gerekenler</h2>
              <Stack gap="sm">
                <StatCard label="Onay bekleyen" value={attention.awaitingApproval.length} />
                <StatCard label="Bugün teslim beklenen" value={attention.dueToday.length} />
                <StatCard label="Teslimatı geciken" value={attention.overdueDelivery.length} changeLabel={attention.overdueDelivery.length ? 'Beklenen tarih geçti' : undefined} trend={attention.overdueDelivery.length ? 'down' : undefined} />
                <StatCard label="Kısmen teslim alınan" value={attention.partiallyReceived.length} />
                <StatCard label="Stoğu az, açık siparişi yok" value={attention.lowStockNoOpenOrder.length} />
                {attention.reconciliationWarnings.length > 0 && (
                  <StatCard label="Stok kaydıyla uyuşmayan teslimat" value={attention.reconciliationWarnings.length} changeLabel="Teslim alınan bir stok girişi geri alınmış olabilir" trend="down" />
                )}
              </Stack>

              <h2>Siparişler</h2>
              <SegmentedControl label="Filtre" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Açık' }, { value: 'all', label: 'Tümü' }]} />
              {shown.length === 0 && <Note>Gösterilecek sipariş yok.</Note>}
              <Stack gap="sm">
                {shown.map((o) => (
                  <RowCard
                    key={o.id}
                    title={`${o.orderNumber} · ${o.supplierName}`}
                    subtitle={`${o.receivedLineCount} / ${o.lineCount} satır tamamen teslim alındı${o.partialLineCount ? ` · ${o.partialLineCount} satır kısmi` : ''}`}
                    meta={o.expectedDeliveryDate ? `Beklenen teslim: ${o.expectedDeliveryDate}` : 'Beklenen teslim tarihi yok'}
                    trailing={<StatusChip tone={ORDER_STATUS_TONES[o.status]}>{ORDER_STATUS_LABELS[o.status]}</StatusChip>}
                  >
                    <LinkButton to={`${PROCUREMENT_BASE}/orders/${o.id}`} variant="secondary">Detay</LinkButton>
                  </RowCard>
                ))}
              </Stack>

              <h2>Sipariş önerileri</h2>
              {reorder.length === 0 && <Note>Şu an yeniden sipariş gereken ürün yok veya eşikler tanımlı değil.</Note>}
              <Stack gap="sm">
                {reorder.map((s) => (
                  <RowCard
                    key={s.inventoryItemId}
                    title={s.name}
                    subtitle={`Stok birimi (${s.unit}): eldeki ${formatQuantity(s.onHand)} + bekleyen ${formatQuantity(s.pendingOrderQuantity)} = ${formatQuantity(s.effectiveStock)}`}
                    meta={
                      s.calendar.configured
                        ? `${s.calendar.canOrderToday ? 'Bugün sipariş verilebilir' : `Sonraki sipariş günü: ${s.calendar.nextOrderDate ?? '—'}`} · teslim ${s.calendar.expectedDelivery.state === 'estimated' ? `tahmini ${s.calendar.expectedDelivery.date}` : 'belirsiz'}`
                        : 'Sipariş günleri tanımlı değil'
                    }
                    trailing={
                      <StatusChip tone={s.status === 'configured' && s.conversionStatus !== 'missing' ? 'success' : 'warning'}>
                        {s.conversionStatus === 'missing'
                          ? 'Paket dönüşümü eksik'
                          : s.suggestedQuantity === null
                            ? 'Miktar önerilmiyor'
                            : s.conversionStatus === 'pack'
                              ? `Öneri: ${formatQuantity(s.suggestedQuantity)} ${s.orderUnit} (${formatQuantity(s.suggestedBaseQuantity ?? 0)} ${s.unit})`
                              : `Öneri: ${formatQuantity(s.suggestedQuantity)} ${s.unit}`}
                      </StatusChip>
                    }
                  >
                    {can('procurement.order.create') && (
                      <LinkButton to={`${PROCUREMENT_BASE}/orders/new?supplier=${s.supplierId}&item=${s.inventoryItemId}${s.suggestedQuantity ? `&qty=${s.suggestedQuantity}` : ''}`} variant="secondary">
                        Taslak oluştur
                      </LinkButton>
                    )}
                  </RowCard>
                ))}
              </Stack>
              <Note>Stok, eşikler ve bekleyen sipariş stok birimindedir. Öneri = (hedef stok − (eldeki + açık sipariş)) ÷ koli içi miktar; asgari sipariş miktarına yükseltilip sipariş katına (koli paylaşılmaz: yukarı yuvarlanır) tamamlanır. Hedef tanımlı değilse veya paket dönüşümü eksikse miktar önerilmez. Satış hızı ve hava durumu kullanılmaz.</Note>
            </Stack>
          )
        }}
      </DataBoundary>
    </Stack>
  )
}
