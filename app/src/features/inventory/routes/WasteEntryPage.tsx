import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { istanbulDate } from '../../../utils/dates'
import { formatQuantity } from '../../../utils/format'
import {
  Button,
  Card,
  ConfirmSheet,
  DataBoundary,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Stack,
  StickyActionBar,
} from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import { useToast } from '../../../hooks/useToast'
import { recordInventoryWaste, type WasteReasonCode } from '../../../services/data'
import { ItemLinesEditor } from '../components/ItemLinesEditor'
import { isCompleteLine, newLine, type ItemLine } from '../components/itemLines'
import { SummaryList } from '../components/SummaryList'
import { WASTE_REASONS } from '../labels'
import {
  shiftOptionLabel,
  useBranchInventory,
  useInventoryBase,
  useInventoryContext,
  useRecentShifts,
} from '../hooks'

export function WasteEntryPage() {
  const { branchId, branchName, can } = useInventoryContext()
  const base = useInventoryBase()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const state = useBranchInventory()
  const shifts = useRecentShifts()
  const today = istanbulDate()

  const [lines, setLines] = useState<ItemLine[]>(() => [newLine()])
  const [reason, setReason] = useState<WasteReasonCode | ''>('')
  const [shiftId, setShiftId] = useState('')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (!can('inventory.record')) {
    return <Unauthorized message="Fire kaydı girme yetkiniz yok." />
  }

  const complete = lines.filter(isCompleteLine)
  const canSubmit =
    branchId !== null &&
    reason !== '' &&
    complete.length > 0 &&
    complete.length === lines.filter((l) => l.itemId !== '').length

  async function handleConfirm() {
    if (!branchId || reason === '') return
    setSubmitting(true)
    const { error } = await recordInventoryWaste({
      branchId,
      lines: complete.map((l) => ({
        inventoryItemId: l.itemId,
        quantity: l.quantity ?? 0,
      })),
      reasonCode: reason,
      note: note.trim() || null,
      shiftId: shiftId || null,
    })
    setSubmitting(false)
    setConfirming(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Fire kaydedildi', 'success')
    navigate(base)
  }

  return (
    <Stack>
      <PageHeader
        title="Fire Kaydı"
        subtitle={branchName || undefined}
        back={{ to: base, label: 'Stok' }}
      />

      <DataBoundary state={state}>
        {({ items }) => {
          if (items.filter((i) => i.isActive).length === 0) {
            return (
              <EmptyState
                icon="📦"
                title="Aktif ürün yok"
                description="Fire girmeden önce bu şubeye ürün eklenmesi gerekir."
              />
            )
          }
          const nameOf = (id: string) => items.find((i) => i.id === id)
          return (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (canSubmit) setConfirming(true)
                }}
              >
                <Stack>
                  <ItemLinesEditor
                    items={items}
                    lines={lines}
                    onChange={setLines}
                    quantityLabel="Fire miktarı"
                  />

                  <Card>
                    <Stack gap="sm">
                      <Select
                        label="Fire nedeni"
                        value={reason}
                        placeholder="Neden seçin"
                        onChange={(e) =>
                          setReason(e.target.value as WasteReasonCode | '')
                        }
                        options={WASTE_REASONS.map((r) => ({
                          value: r.value,
                          label: r.label,
                        }))}
                      />
                      <Select
                        label="Vardiya (opsiyonel)"
                        value={shiftId}
                        placeholder="Vardiya belirtme"
                        onChange={(e) => setShiftId(e.target.value)}
                        options={(shifts.data ?? []).map((s) => ({
                          value: s.id,
                          label: shiftOptionLabel(s, today),
                        }))}
                        hint={shifts.loading ? 'Vardiyalar yükleniyor…' : undefined}
                      />
                      <Input
                        label="Not (opsiyonel)"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={200}
                      />
                    </Stack>
                  </Card>

                  <StickyActionBar>
                    <Button type="submit" size="lg" fullWidth disabled={!canSubmit}>
                      Fireyi Kaydet
                    </Button>
                  </StickyActionBar>
                </Stack>
              </form>

              <ConfirmSheet
                open={confirming}
                title="Fire kaydını onaylayın"
                confirmLabel="Onayla ve Kaydet"
                loading={submitting}
                tone="danger"
                onConfirm={() => void handleConfirm()}
                onCancel={() => setConfirming(false)}
              >
                <SummaryList
                  rows={complete.map((l) => {
                    const item = nameOf(l.itemId)
                    return {
                      key: l.key,
                      label: item?.name,
                      value: `${formatQuantity(l.quantity ?? 0)} ${item?.unit ?? ''}`,
                    }
                  })}
                  footnote="Bu miktarlar fire olarak stoktan düşülecek. Kayıt silinemez; hatalı bir giriş yönetici tarafından geri alma kaydı ile düzeltilir."
                />
              </ConfirmSheet>
            </>
          )
        }}
      </DataBoundary>
    </Stack>
  )
}
