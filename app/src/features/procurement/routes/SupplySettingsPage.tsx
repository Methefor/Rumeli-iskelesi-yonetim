import { useState } from 'react'
import { Button, DataBoundary, Input, Note, PageHeader, RowCard, Select, Stack, StatusChip } from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import type { SupplyParams, Weekdays } from '../../../domain/procurement'
import { useAsync } from '../../../hooks/useAsync'
import { useToast } from '../../../hooks/useToast'
import { listInventoryItems, listSuppliers, listSupplyParams, upsertSupplyParams, type InventoryItem } from '../../../services/data'
import { formatQuantity } from '../../../utils/format'
import { ReasonSheet } from '../../management/ReasonSheet'
import { WeekdayPicker } from '../components/WeekdayPicker'
import { useProcurementContext } from '../hooks'
import { parseOptionalNumber, weekdaysText } from '../labels'

interface Draft {
  item: InventoryItem
  supplierId: string
  orderUnit: string
  unitsPerPack: string
  minimumStock: string
  targetStock: string
  safetyStock: string
  leadTimeDays: string
  allowedOrderWeekdays: Weekdays
  orderCutoffTime: string
  deliveryWeekdays: Weekdays
  minimumOrderQuantity: string
  orderMultiple: string
  isActive: boolean
}

const text = (n: number | null) => (n === null ? '' : String(n))

function draftFor(item: InventoryItem, p: SupplyParams | undefined, defaultSupplier: string): Draft {
  return {
    item,
    supplierId: p?.supplierId ?? defaultSupplier,
    orderUnit: p?.orderUnit ?? '',
    unitsPerPack: text(p?.unitsPerPack ?? null),
    minimumStock: text(p?.minimumStock ?? null),
    targetStock: text(p?.targetStock ?? null),
    safetyStock: text(p?.safetyStock ?? null),
    leadTimeDays: text(p?.leadTimeDays ?? null),
    allowedOrderWeekdays: p?.allowedOrderWeekdays ?? null,
    orderCutoffTime: p?.orderCutoffTime ?? '',
    deliveryWeekdays: p?.deliveryWeekdays ?? null,
    minimumOrderQuantity: text(p?.minimumOrderQuantity ?? null),
    orderMultiple: text(p?.orderMultiple ?? null),
    isActive: p?.isActive ?? true,
  }
}

/** Per-item supply settings of the selected branch. Every value is optional: an empty field means "not configured", never a default. */
export function SupplySettingsPage() {
  const { branchId, branchName, can } = useProcurementContext()
  const { showToast } = useToast()
  const allowed = can('procurement.order.read')
  const manage = can('procurement.supply.manage')
  const state = useAsync(allowed && branchId ? `supply-settings:${branchId}` : null, async () => ({
    items: await listInventoryItems(branchId as string),
    params: await listSupplyParams(branchId as string),
    suppliers: await listSuppliers(),
  }))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  if (!allowed) return <Unauthorized message="Tedarik ayarları için yetkiniz yok." />

  async function save(reason: string) {
    if (!draft || !branchId) return
    const numbers = [draft.unitsPerPack, draft.minimumStock, draft.targetStock, draft.safetyStock, draft.leadTimeDays, draft.minimumOrderQuantity, draft.orderMultiple].map(parseOptionalNumber)
    if (numbers.some((n) => n !== null && Number.isNaN(n))) return showToast('Sayı alanlarında geçersiz değer var.', 'danger')
    const [unitsPerPack, minimumStock, targetStock, safetyStock, leadTimeDays, minimumOrderQuantity, orderMultiple] = numbers
    setSaving(true)
    const result = await upsertSupplyParams({
      branchId,
      itemId: draft.item.id,
      supplierId: draft.supplierId,
      orderUnit: draft.orderUnit.trim() || null,
      unitsPerPack: unitsPerPack ?? null,
      minimumStock: minimumStock ?? null,
      targetStock: targetStock ?? null,
      safetyStock: safetyStock ?? null,
      leadTimeDays: leadTimeDays ?? null,
      allowedOrderWeekdays: draft.allowedOrderWeekdays,
      orderCutoffTime: draft.orderCutoffTime.trim() || null,
      deliveryWeekdays: draft.deliveryWeekdays,
      minimumOrderQuantity: minimumOrderQuantity ?? null,
      orderMultiple: orderMultiple ?? null,
      isActive: draft.isActive,
      notes: null,
      reason,
    })
    setSaving(false)
    if (result.error) return showToast(result.error, 'danger')
    showToast('Tedarik ayarı kaydedildi', 'success')
    setDraft(null)
    state.reload()
  }

  const field = (label: string, key: keyof Draft, hint?: string) => (
    <Input
      label={label}
      hint={hint}
      inputMode="decimal"
      value={String((draft as Draft)[key] ?? '')}
      onChange={(e) => setDraft({ ...(draft as Draft), [key]: e.target.value })}
    />
  )

  return (
    <Stack>
      <PageHeader title="Tedarik ayarları" subtitle={branchName || undefined} back={{ to: '/app/manager/procurement', label: 'Tedarik' }} />
      <Note>Boş bırakılan alan “tanımsız” demektir; sistem hiçbir değer uydurmaz. Minimum/hedef/emniyet stoku ve koli içi miktar STOK biriminde; asgari sipariş miktarı ve sipariş katı SİPARİŞ biriminde (örn. koli) girilir. Sipariş birimi ile koli içi miktar birlikte tanımlanmalıdır; yarım tanım sipariş ve öneriyi engeller.</Note>
      <DataBoundary state={state} rows={4}>
        {({ items, params, suppliers }) => {
          const activeSuppliers = suppliers.filter((s) => s.isActive)
          return (
            <Stack gap="sm">
              {items.filter((i) => i.isActive).map((item) => {
                const p = params.find((x) => x.itemId === item.id)
                const supplier = suppliers.find((s) => s.id === p?.supplierId)
                return (
                  <RowCard
                    key={item.id}
                    title={item.name}
                    subtitle={p ? `${supplier?.name ?? '—'} · min ${p.minimumStock === null ? '—' : formatQuantity(p.minimumStock)} · hedef ${p.targetStock === null ? '—' : formatQuantity(p.targetStock)} ${item.unit}` : 'Tedarikçi tanımlı değil'}
                    meta={p ? `Sipariş günleri: ${weekdaysText(p.allowedOrderWeekdays)}${p.orderCutoffTime ? ` · saat ${p.orderCutoffTime}'e kadar` : ''}` : item.code}
                    trailing={<StatusChip tone={p ? (p.isActive ? 'success' : 'neutral') : 'neutral'}>{p ? (p.isActive ? 'Tanımlı' : 'Pasif') : 'Tanımsız'}</StatusChip>}
                  >
                    {manage && (
                      <Button variant="secondary" disabled={activeSuppliers.length === 0 && !p} onClick={() => setDraft(draftFor(item, p, p?.supplierId ?? activeSuppliers[0]?.id ?? ''))}>
                        {p ? 'Düzenle' : 'Tedarikçi ata'}
                      </Button>
                    )}
                  </RowCard>
                )
              })}
              {manage && activeSuppliers.length === 0 && <Note>Önce Tedarikçiler sayfasından aktif bir tedarikçi ekleyin.</Note>}
              <ReasonSheet
                open={draft !== null}
                title={draft ? `${draft.item.name}: tedarik ayarı` : 'Tedarik ayarı'}
                confirmLabel="Kaydet"
                loading={saving}
                ready={!!draft && draft.supplierId !== ''}
                onConfirm={(reason) => void save(reason)}
                onCancel={() => setDraft(null)}
              >
                {draft && (
                  <Stack gap="sm">
                    <Select
                      label="Tedarikçi"
                      value={draft.supplierId}
                      onChange={(e) => setDraft({ ...draft, supplierId: e.target.value })}
                      options={suppliers.filter((s) => s.isActive || s.id === draft.supplierId).map((s) => ({ value: s.id, label: s.name }))}
                    />
                    {field('Sipariş birimi (örn. koli)', 'orderUnit')}
                    {field(`Koli içi miktar (1 sipariş birimi = kaç ${draft.item.unit})`, 'unitsPerPack', 'Sipariş birimiyle birlikte girilmelidir; mevcut siparişler değişmez.')}
                    {field(`Minimum stok (${draft.item.unit})`, 'minimumStock')}
                    {field(`Hedef stok (${draft.item.unit})`, 'targetStock', 'Hedef boşsa sipariş miktarı önerilmez.')}
                    {field(`Emniyet stoku (${draft.item.unit})`, 'safetyStock', 'Bilgi amaçlı; V1 öneri formülünde kullanılmaz.')}
                    {field('Termin (gün)', 'leadTimeDays')}
                    <WeekdayPicker label="Sipariş verilebilen günler" value={draft.allowedOrderWeekdays} onChange={(v) => setDraft({ ...draft, allowedOrderWeekdays: v })} />
                    <Input label="Sipariş son saati (SS:DD)" value={draft.orderCutoffTime} placeholder="14:00" onChange={(e) => setDraft({ ...draft, orderCutoffTime: e.target.value })} />
                    <WeekdayPicker label="Teslimat günleri" value={draft.deliveryWeekdays} onChange={(v) => setDraft({ ...draft, deliveryWeekdays: v })} />
                    {field('Asgari sipariş miktarı (sipariş biriminde)', 'minimumOrderQuantity')}
                    {field('Sipariş katı (sipariş biriminde)', 'orderMultiple')}
                    <Select
                      label="Durum"
                      value={draft.isActive ? '1' : '0'}
                      onChange={(e) => setDraft({ ...draft, isActive: e.target.value === '1' })}
                      options={[{ value: '1', label: 'Aktif' }, { value: '0', label: 'Pasif' }]}
                    />
                  </Stack>
                )}
              </ReasonSheet>
            </Stack>
          )
        }}
      </DataBoundary>
    </Stack>
  )
}
