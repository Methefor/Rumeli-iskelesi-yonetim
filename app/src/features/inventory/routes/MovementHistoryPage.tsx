import { useState } from 'react'
import { formatDateTime } from '../../../utils/dates'
import { formatQuantity, formatSignedQuantity } from '../../../utils/format'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import {
  Button,
  ConfirmSheet,
  DataBoundary,
  EmptyState,
  Input,
  Note,
  PageHeader,
  QuantityInput,
  RowCard,
  SegmentedControl,
  Select,
  Stack,
  StatusChip,
  BottomSheet,
} from '../../../components/ui'
import { useAsync } from '../../../hooks/useAsync'
import { useToast } from '../../../hooks/useToast'
import {
  listInventoryItems,
  listInventoryMovements,
  recordInventoryAdjustment,
  reverseInventoryMovement,
  type InventoryMovementRow,
} from '../../../services/data'
import { MOVEMENT_LABELS, MOVEMENT_TONES, wasteReasonLabel } from '../labels'
import { useInventoryBase, useInventoryContext } from '../hooks'

/**
 * The stock ledger, newest first. The ledger is append-only: nothing here
 * edits or deletes a row. Roles with inventory.adjust can record an explicit
 * adjustment (the ONLY way to make the ledger agree with a count variance)
 * or reverse a non-sale movement with a reason — both audited. Sale-linked
 * movements are corrected by editing/cancelling the sales report.
 */
export function MovementHistoryPage() {
  const { branchId, branchName, can } = useInventoryContext()
  const base = useInventoryBase()
  const { showToast } = useToast()

  const data = useAsync(
    branchId && can('inventory.read') ? `movements:${branchId}` : null,
    async () => {
      if (!branchId) return { items: [], movements: [] as InventoryMovementRow[] }
      const [items, movements] = await Promise.all([
        listInventoryItems(branchId),
        listInventoryMovements(branchId, 150),
      ])
      return { items, movements }
    },
  )

  const [itemFilter, setItemFilter] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [adjItem, setAdjItem] = useState('')
  const [adjDirection, setAdjDirection] = useState<'IN' | 'OUT'>('OUT')
  const [adjQuantity, setAdjQuantity] = useState<number | null>(null)
  const [adjReason, setAdjReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [reverseTarget, setReverseTarget] = useState<InventoryMovementRow | null>(null)
  const [reverseReason, setReverseReason] = useState('')

  if (!can('inventory.read')) {
    return <Unauthorized message="Stok hareketlerini görüntüleme yetkiniz yok." />
  }

  const canAdjust = can('inventory.adjust')

  async function handleAdjust() {
    if (!adjItem || adjQuantity === null || !adjReason.trim()) return
    setSaving(true)
    const { error } = await recordInventoryAdjustment({
      itemId: adjItem,
      direction: adjDirection,
      quantity: adjQuantity,
      reason: adjReason.trim(),
    })
    setSaving(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Stok düzeltmesi kaydedildi', 'success')
    setAdjusting(false)
    setAdjItem('')
    setAdjQuantity(null)
    setAdjReason('')
    data.reload()
  }

  async function handleReverse() {
    if (!reverseTarget || !reverseReason.trim()) return
    setSaving(true)
    const { error } = await reverseInventoryMovement({
      movementId: reverseTarget.id,
      reason: reverseReason.trim(),
    })
    setSaving(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Hareket geri alındı', 'success')
    setReverseTarget(null)
    setReverseReason('')
    data.reload()
  }

  return (
    <Stack>
      <PageHeader
        title="Stok Hareketleri"
        subtitle={branchName || undefined}
        back={{ to: base, label: 'Stok' }}
        actions={
          canAdjust ? (
            <Button onClick={() => setAdjusting(true)}>Stok Düzeltme</Button>
          ) : undefined
        }
      />

      <DataBoundary state={data} rows={4}>
        {({ items, movements }) => {
          const nameOf = (id: string) => items.find((i) => i.id === id)
          const reversed = new Set(
            movements
              .filter((m) => m.reversesMovementId)
              .map((m) => m.reversesMovementId),
          )
          const visible = movements.filter(
            (m) => itemFilter === '' || m.inventoryItemId === itemFilter,
          )

          return (
            <Stack>
              <Select
                label="Ürüne göre filtrele"
                value={itemFilter}
                placeholder="Tüm ürünler"
                onChange={(e) => setItemFilter(e.target.value)}
                options={items.map((i) => ({
                  value: i.id,
                  label: `${i.name} (${i.code})`,
                }))}
              />

              {visible.length === 0 ? (
                <EmptyState
                  icon="🗂️"
                  title="Hareket yok"
                  description="Seçili ürün için kayıtlı bir stok hareketi bulunmuyor."
                />
              ) : (
                <Stack gap="sm">
                  {visible.map((m) => {
                    const item = nameOf(m.inventoryItemId)
                    const canReverse =
                      canAdjust &&
                      m.type !== 'REVERSAL' &&
                      m.salesReportId === null &&
                      !reversed.has(m.id)
                    return (
                      <RowCard
                        key={m.id}
                        title={item?.name ?? 'Ürün'}
                        subtitle={formatDateTime(m.occurredAt)}
                        meta={
                          [wasteReasonLabel(m.reasonCode), m.reason, m.reference]
                            .filter(Boolean)
                            .join(' · ') || undefined
                        }
                        trailing={
                          <>
                            <strong>
                              {formatSignedQuantity(m.stockDelta)} {item?.unit}
                            </strong>
                            <StatusChip tone={MOVEMENT_TONES[m.type]}>
                              {MOVEMENT_LABELS[m.type]}
                            </StatusChip>
                            {reversed.has(m.id) && <StatusChip>Geri alındı</StatusChip>}
                          </>
                        }
                      >
                        {canReverse && (
                          <Button variant="ghost" onClick={() => setReverseTarget(m)}>
                            Geri Al
                          </Button>
                        )}
                      </RowCard>
                    )
                  })}
                </Stack>
              )}
              <Note>
                Hareketler silinmez ve değiştirilmez. Hatalı bir kayıt, gerekçeli bir geri
                alma veya düzeltme hareketi ile düzeltilir; satışa bağlı hareketler satış
                raporu düzenlenerek/iptal edilerek düzeltilir.
              </Note>
            </Stack>
          )
        }}
      </DataBoundary>

      <BottomSheet
        open={adjusting}
        onClose={() => (saving ? undefined : setAdjusting(false))}
        title="Stok düzeltme"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleAdjust()
          }}
        >
          <Stack gap="sm">
            <Select
              label="Ürün"
              value={adjItem}
              placeholder="Ürün seçin"
              onChange={(e) => setAdjItem(e.target.value)}
              options={(data.data?.items ?? [])
                .filter((i) => i.isActive)
                .map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))}
            />
            <SegmentedControl
              label="Yön"
              value={adjDirection}
              onChange={setAdjDirection}
              options={[
                { value: 'OUT', label: 'Stoktan düş' },
                { value: 'IN', label: 'Stoğa ekle' },
              ]}
            />
            <QuantityInput
              label="Miktar"
              value={adjQuantity}
              onValueChange={setAdjQuantity}
              unit={(data.data?.items ?? []).find((i) => i.id === adjItem)?.unit}
              allowDecimal={
                (data.data?.items ?? []).find((i) => i.id === adjItem)?.allowsDecimal ??
                true
              }
            />
            <Input
              label="Gerekçe (zorunlu)"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              maxLength={200}
            />
            <Note>Düzeltmeler denetim kaydına yazılır ve gerekçe olmadan yapılamaz.</Note>
            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={saving}
              disabled={
                !adjItem || adjQuantity === null || adjQuantity <= 0 || !adjReason.trim()
              }
            >
              Düzeltmeyi Kaydet
            </Button>
          </Stack>
        </form>
      </BottomSheet>

      <ConfirmSheet
        open={reverseTarget !== null}
        title="Hareketi geri al"
        confirmLabel="Geri Al"
        tone="danger"
        loading={saving}
        confirmDisabled={!reverseReason.trim()}
        onConfirm={() => void handleReverse()}
        onCancel={() => {
          setReverseTarget(null)
          setReverseReason('')
        }}
      >
        <Stack gap="sm">
          {reverseTarget && (
            <p>
              {MOVEMENT_LABELS[reverseTarget.type]} —{' '}
              {formatQuantity(reverseTarget.quantity)} birim, geri alınacak. Orijinal
              kayıt silinmez; tersi bir kayıt eklenir.
            </p>
          )}
          <Input
            label="Gerekçe (zorunlu)"
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
            maxLength={200}
          />
        </Stack>
      </ConfirmSheet>
    </Stack>
  )
}
