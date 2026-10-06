import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, DataBoundary, Input, Note, PageHeader, Select, Stack, StickyActionBar } from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import { canInventory } from '../../../domain/inventory'
import { useAsync } from '../../../hooks/useAsync'
import { useToast } from '../../../hooks/useToast'
import { createPurchaseOrder, listInventoryItems, listSuppliers } from '../../../services/data'
import { ItemLinesEditor } from '../../inventory/components/ItemLinesEditor'
import { isCompleteLine, newLine, type ItemLine } from '../../inventory/components/itemLines'
import { PROCUREMENT_BASE, useProcurementContext } from '../hooks'

/** New DRAFT order: supplier, optional dates, lines in the item stock unit. Suggestions can prefill it (?supplier=&item=&qty=). */
export function PurchaseOrderNewPage() {
  const { branchId, branchName, roles, can } = useProcurementContext()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const allowed = can('procurement.order.create')
  const data = useAsync(allowed && branchId ? `po-new:${branchId}` : null, async () => ({
    items: await listInventoryItems(branchId as string),
    suppliers: await listSuppliers(),
  }))
  const [supplierId, setSupplierId] = useState(search.get('supplier') ?? '')
  const [expected, setExpected] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<ItemLine[]>(() => {
    const item = search.get('item')
    const qty = Number(search.get('qty'))
    return item ? [{ ...newLine(), itemId: item, quantity: qty > 0 ? qty : null }] : [newLine()]
  })
  const [saving, setSaving] = useState(false)

  if (!allowed) return <Unauthorized message="Sipariş oluşturma yetkiniz yok." />

  const canCost = canInventory(roles, 'inventory.cost.manage')
  const complete = lines.filter(isCompleteLine)
  const ready = !!branchId && supplierId !== '' && complete.length > 0 && complete.length === lines.filter((l) => l.itemId !== '').length

  async function save() {
    if (!branchId) return
    setSaving(true)
    const result = await createPurchaseOrder({
      branchId,
      supplierId,
      orderedForDate: null,
      expectedDeliveryDate: expected || null,
      notes: notes.trim() || null,
      lines: complete.map((l) => ({ inventoryItemId: l.itemId, quantity: l.quantity ?? 0, unitCostEstimateKurus: l.unitCost === null ? null : Math.round(l.unitCost * 100) })),
    })
    setSaving(false)
    if (result.error || !result.id) return showToast(result.error ?? 'Sipariş oluşturulamadı.', 'danger')
    showToast('Taslak sipariş oluşturuldu', 'success')
    navigate(`${PROCUREMENT_BASE}/orders/${result.id}`)
  }

  return (
    <Stack>
      <PageHeader title="Yeni sipariş" subtitle={branchName || undefined} back={{ to: PROCUREMENT_BASE, label: 'Tedarik' }} />
      <DataBoundary state={data} rows={3}>
        {({ items, suppliers }) => (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (ready) void save()
            }}
          >
            <Stack>
              <Card>
                <Stack gap="sm">
                  <Select
                    label="Tedarikçi"
                    value={supplierId}
                    placeholder="Tedarikçi seçin"
                    onChange={(e) => setSupplierId(e.target.value)}
                    options={suppliers.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name }))}
                  />
                  <Input label="Beklenen teslim tarihi (opsiyonel)" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
                  <Input label="Not (opsiyonel)" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
                </Stack>
              </Card>
              <ItemLinesEditor items={items} lines={lines} onChange={setLines} quantityLabel="Sipariş miktarı (ürünün sipariş birimi; tanımlı değilse stok birimi)" showCost={canCost} addLabel="Ürün Ekle" />
              <Note>Miktar, ürünün tedarik ayarındaki sipariş biriminde girilir (örn. koli); paket tanımı yoksa stok birimindedir. Koli içi miktar sipariş satırına sabitlenir. Taslak, onaya gönderilene kadar düzenlenebilir. Asgari sipariş miktarı ve sipariş katı tanımlıysa sunucu uygular. Tahmini maliyet yalnızca tahmindir; stok maliyeti teslimatta belirlenir.</Note>
              <StickyActionBar>
                <Button type="submit" size="lg" fullWidth disabled={!ready || saving}>
                  Taslağı Kaydet
                </Button>
              </StickyActionBar>
            </Stack>
          </form>
        )}
      </DataBoundary>
    </Stack>
  )
}
