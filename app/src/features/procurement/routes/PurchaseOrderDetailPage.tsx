import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, ConfirmSheet, DataBoundary, Input, Note, PageHeader, RowCard, Stack, StatCard, StatusChip } from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import { canInventory } from '../../../domain/inventory'
import { RECEIVABLE_STATUSES, availableTransitions, transitionNeedsReason, type PurchaseOrderDetail, type PurchaseOrderStatus } from '../../../domain/procurement'
import { useAsync } from '../../../hooks/useAsync'
import { useToast } from '../../../hooks/useToast'
import { getPurchaseOrder, listInventoryItems, receivePurchaseOrder, replacePurchaseOrderLines, transitionPurchaseOrder } from '../../../services/data'
import { formatMoney, formatQuantity } from '../../../utils/format'
import { ItemLinesEditor } from '../../inventory/components/ItemLinesEditor'
import { isCompleteLine, newLine, type ItemLine } from '../../inventory/components/itemLines'
import { ReasonSheet } from '../../management/ReasonSheet'
import { PROCUREMENT_BASE, useProcurementContext } from '../hooks'
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES, TRANSITION_LABELS, parseOptionalNumber } from '../labels'

const when = (iso: string) => new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })

/** One purchase order: ordered vs received, lifecycle actions, receiving into stock, history and the stock receipts it created. */
export function PurchaseOrderDetailPage() {
  const { orderId = '' } = useParams()
  const { roles, can } = useProcurementContext()
  const { showToast } = useToast()
  const allowed = can('procurement.order.read')
  const state = useAsync(allowed && orderId ? `po:${orderId}` : null, () => getPurchaseOrder(orderId))
  const [target, setTarget] = useState<PurchaseOrderStatus | null>(null)
  const [receiving, setReceiving] = useState<Record<string, string> | null>(null)
  const [unitCosts, setUnitCosts] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<ItemLine[] | null>(null)
  const [saving, setSaving] = useState(false)

  const items = useAsync(editing && state.data ? `po-items:${state.data.branchId}` : null, () => listInventoryItems((state.data as PurchaseOrderDetail).branchId))

  if (!allowed) return <Unauthorized message="Sipariş detayı için yetkiniz yok." />

  async function runTransition(reason: string | null) {
    if (!target) return
    setSaving(true)
    const result = await transitionPurchaseOrder(orderId, target, reason)
    setSaving(false)
    if (result.error) return showToast(result.error, 'danger')
    showToast('Sipariş durumu güncellendi', 'success')
    setTarget(null)
    state.reload()
  }

  async function runReceive(order: PurchaseOrderDetail) {
    if (!receiving) return
    const parsed = order.lines.map((l) => ({ line: l, qty: parseOptionalNumber(receiving[l.id] ?? ''), cost: parseOptionalNumber(unitCosts[l.id] ?? '') }))
    if (parsed.some((p) => (p.qty !== null && Number.isNaN(p.qty)) || (p.cost !== null && Number.isNaN(p.cost)))) return showToast('Geçersiz sayı.', 'danger')
    const lines = parsed.filter((p) => p.qty !== null && p.qty > 0).map((p) => ({ lineId: p.line.id, quantity: p.qty as number, unitCost: p.cost }))
    if (lines.length === 0) return showToast('Teslim alınacak miktar girin.', 'danger')
    setSaving(true)
    const result = await receivePurchaseOrder(orderId, lines, null)
    setSaving(false)
    if (result.error) return showToast(result.error, 'danger')
    showToast(result.status === 'RECEIVED' ? 'Sipariş tamamen teslim alındı; stok güncellendi' : 'Kısmi teslim alındı; stok güncellendi', 'success')
    setReceiving(null)
    setUnitCosts({})
    state.reload()
  }

  async function saveLines() {
    if (!editing) return
    const complete = editing.filter(isCompleteLine)
    if (complete.length === 0) return showToast('En az bir satır girin.', 'danger')
    setSaving(true)
    const result = await replacePurchaseOrderLines(orderId, complete.map((l) => ({ inventoryItemId: l.itemId, quantity: l.quantity ?? 0, unitCostEstimateKurus: l.unitCost === null ? null : Math.round(l.unitCost * 100) })))
    setSaving(false)
    if (result.error) return showToast(result.error, 'danger')
    showToast('Satırlar güncellendi', 'success')
    setEditing(null)
    state.reload()
  }

  return (
    <Stack>
      <PageHeader title="Sipariş detayı" back={{ to: PROCUREMENT_BASE, label: 'Tedarik' }} />
      <DataBoundary state={state} rows={5}>
        {(o) => {
          const moves = availableTransitions(o.status, roles).filter((s) => s !== 'RECEIVED' || o.status === 'PARTIALLY_RECEIVED')
          const canReceive = can('procurement.order.receive') && RECEIVABLE_STATUSES.includes(o.status)
          const canCost = canInventory(roles, 'inventory.cost.manage')
          return (
            <Stack>
              <RowCard
                title={`${o.orderNumber} · ${o.supplier.name}`}
                subtitle={`${o.branchName}${o.expectedDeliveryDate ? ` · beklenen teslim ${o.expectedDeliveryDate}` : ''}`}
                meta={`Oluşturuldu ${when(o.createdAt)}`}
                trailing={<StatusChip tone={ORDER_STATUS_TONES[o.status]}>{ORDER_STATUS_LABELS[o.status]}</StatusChip>}
              />
              {o.notes && <Note>{o.notes}</Note>}
              <StatCard label="Tamamen teslim alınan satır" value={`${o.lines.filter((l) => l.openQuantity <= 0).length} / ${o.lines.length}`} />
              {o.reconciliation.state === 'warning' && (
                <Note>
                  Dikkat: bu siparişte teslim alınan bir stok girişi sonradan geri alınmış (geri alınan {formatQuantity(o.reconciliation.reversedBaseQuantity)}, net teslim {formatQuantity(o.reconciliation.netReceivedBaseQuantity)} stok birimi).
                  Sipariş otomatik yeniden açılmaz; teslim edilen miktar kayıtlı kalır. Stok düzeltmesi için yönetici bir stok girişi veya düzeltme kaydı yapmalıdır.
                </Note>
              )}

              <h2>Satırlar</h2>
              <Stack gap="sm">
                {o.lines.map((l) => (
                  <RowCard
                    key={l.id}
                    title={l.name}
                    subtitle={`Sipariş ${formatQuantity(l.orderedQuantity)} · teslim ${formatQuantity(l.receivedQuantity)} · açık ${formatQuantity(l.openQuantity)} ${l.orderUnit ?? l.unit}`}
                    meta={[l.code, l.orderUnit && l.unitsPerPack ? `1 ${l.orderUnit} = ${formatQuantity(l.unitsPerPack)} ${l.unit} · stok karşılığı: sipariş ${formatQuantity(l.orderedBaseQuantity)}, teslim ${formatQuantity(l.receivedBaseQuantity)} ${l.unit}` : null].filter(Boolean).join(' · ')}
                    trailing={
                      <small>
                        {l.unitCostEstimate.state === 'available'
                          ? `Tahmini ${formatMoney((l.unitCostEstimate.kurus ?? 0) / 100)}`
                          : l.unitCostEstimate.reason === 'no_permission'
                            ? 'Yetki yok'
                            : 'Maliyet yok'}
                      </small>
                    }
                  />
                ))}
              </Stack>

              <Stack gap="sm">
                {o.status === 'DRAFT' && can('procurement.order.create') && (
                  <Button variant="secondary" onClick={() => setEditing(o.lines.map((l) => ({ ...newLine(), itemId: l.inventoryItemId, quantity: l.orderedQuantity })))}>
                    Satırları düzenle
                  </Button>
                )}
                {moves.map((to) => (
                  <Button key={to} variant={to === 'CANCELLED' ? 'secondary' : 'primary'} onClick={() => setTarget(to)}>
                    {TRANSITION_LABELS[to] ?? to}
                  </Button>
                ))}
                {canReceive && (
                  <Button onClick={() => setReceiving(Object.fromEntries(o.lines.map((l) => [l.id, l.openQuantity > 0 ? String(l.openQuantity) : ''])))}>
                    Teslim al
                  </Button>
                )}
              </Stack>
              {moves.length === 0 && !canReceive && o.status !== 'RECEIVED' && o.status !== 'CANCELLED' && <Note>Bu sipariş için yapabileceğiniz bir işlem yok.</Note>}

              {o.receipts.length > 0 && (
                <>
                  <h2>Stok girişleri</h2>
                  <Note>Her teslim alma, mevcut stok defterine bir STOK GİRİŞİ (RECEIPT) hareketi olarak yazılır; ayrı bir stok bakiyesi yoktur.</Note>
                  <Stack gap="sm">
                    {o.receipts.map((r) => (
                      <RowCard
                        key={r.movementId}
                        title={`${formatQuantity(r.quantity)} ${o.lines.find((l) => l.id === r.lineId)?.orderUnit ?? o.lines.find((l) => l.id === r.lineId)?.unit ?? ''} → stok +${formatQuantity(r.baseQuantity)} ${o.lines.find((l) => l.id === r.lineId)?.unit ?? ''} · ${o.lines.find((l) => l.id === r.lineId)?.name ?? ''}`}
                        subtitle={[r.receivedBy, when(r.receivedAt)].filter(Boolean).join(' · ')}
                        meta={`Defter hareketi: ${r.movementId}`}
                        trailing={r.reversed ? <StatusChip tone="danger">Stok girişi geri alındı</StatusChip> : undefined}
                      />
                    ))}
                  </Stack>
                </>
              )}

              <h2>Durum geçmişi</h2>
              <Stack gap="sm">
                {o.history.map((h, i) => (
                  <RowCard
                    key={`${h.changedAt}-${i}`}
                    title={`${h.fromStatus ? ORDER_STATUS_LABELS[h.fromStatus] : '—'} → ${ORDER_STATUS_LABELS[h.toStatus]}`}
                    subtitle={h.reason ?? undefined}
                    meta={[h.changedBy, when(h.changedAt)].filter(Boolean).join(' · ')}
                  />
                ))}
              </Stack>

              <ReasonSheet
                open={target !== null && transitionNeedsReason(target)}
                title={target ? (TRANSITION_LABELS[target] ?? target) : ''}
                confirmLabel="Onayla"
                tone={target === 'CANCELLED' ? 'danger' : 'primary'}
                loading={saving}
                onConfirm={(reason) => void runTransition(reason)}
                onCancel={() => setTarget(null)}
              >
                <p>{target === 'RECEIVED' ? 'Kalan açık miktar teslim alınmadan sipariş kapatılacak.' : target === 'CANCELLED' ? 'İptal edilen sipariş yeniden açılamaz.' : 'Sipariş taslağa döner ve satırları yeniden düzenlenebilir.'}</p>
              </ReasonSheet>
              <ConfirmSheet
                open={target !== null && !transitionNeedsReason(target)}
                title={target ? (TRANSITION_LABELS[target] ?? target) : ''}
                confirmLabel="Onayla"
                loading={saving}
                onConfirm={() => void runTransition(null)}
                onCancel={() => setTarget(null)}
              >
                <p>{o.orderNumber} siparişinin durumu “{target ? ORDER_STATUS_LABELS[target] : ''}” olarak değişecek. Bu işlem denetim kaydına yazılır.</p>
              </ConfirmSheet>

              <ConfirmSheet open={receiving !== null} title="Teslim al" confirmLabel="Stoğa İşle" loading={saving} onConfirm={() => void runReceive(o)} onCancel={() => setReceiving(null)}>
                <Stack gap="sm">
                  {o.lines.filter((l) => l.openQuantity > 0).map((l) => (
                    <div key={l.id}>
                      <Input
                        label={`${l.name}: teslim alınan ${l.orderUnit ?? l.unit} (açık ${formatQuantity(l.openQuantity)}${l.orderUnit && l.unitsPerPack ? `, 1 ${l.orderUnit} = ${formatQuantity(l.unitsPerPack)} ${l.unit}` : ''})`}
                        inputMode="decimal"
                        value={receiving?.[l.id] ?? ''}
                        onChange={(e) => setReceiving({ ...(receiving ?? {}), [l.id]: e.target.value })}
                      />
                      {canCost && (
                        <Input
                          label={`Birim maliyet (opsiyonel, TL / ${l.unit})`}
                          inputMode="decimal"
                          value={unitCosts[l.id] ?? ''}
                          onChange={(e) => setUnitCosts({ ...unitCosts, [l.id]: e.target.value })}
                        />
                      )}
                    </div>
                  ))}
                  <Note>Miktar sipariş biriminde girilir; stoğa sipariş satırındaki sabit koli içi miktarla çevrilerek yazılır. Açık kalan miktarı aşan teslim kabul edilmez. Maliyet stok birimi başınadır; girilmezse kayıt maliyetsiz kalır (0 sayılmaz).</Note>
                </Stack>
              </ConfirmSheet>

              <ConfirmSheet open={editing !== null} title="Satırları düzenle" confirmLabel="Kaydet" loading={saving} confirmDisabled={!editing || editing.filter(isCompleteLine).length === 0} onConfirm={() => void saveLines()} onCancel={() => setEditing(null)}>
                {editing && (
                  <ItemLinesEditor items={items.data ?? []} lines={editing} onChange={setEditing} quantityLabel="Sipariş miktarı (sipariş birimi; paket tanımı yoksa stok birimi)" showCost={canCost} addLabel="Ürün Ekle" />
                )}
              </ConfirmSheet>
            </Stack>
          )
        }}
      </DataBoundary>
    </Stack>
  )
}
