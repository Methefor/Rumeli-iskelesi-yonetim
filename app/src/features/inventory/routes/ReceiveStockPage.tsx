import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  DataBoundary,
  EmptyState,
  Input,
  Note,
  PageHeader,
  Stack,
  StickyActionBar,
} from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import { useToast } from '../../../hooks/useToast'
import { recordInventoryReceipt } from '../../../services/data'
import { ItemLinesEditor } from '../components/ItemLinesEditor'
import { isCompleteLine, newLine, type ItemLine } from '../components/itemLines'
import { useBranchInventory, useInventoryBase, useInventoryContext } from '../hooks'

export function ReceiveStockPage() {
  const { branchId, branchName, can } = useInventoryContext()
  const base = useInventoryBase()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const state = useBranchInventory()

  const [lines, setLines] = useState<ItemLine[]>(() => [newLine()])
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!can('inventory.receive')) {
    return <Unauthorized message="Stok girişi kaydetme yetkiniz yok." />
  }

  const complete = lines.filter(isCompleteLine)
  const canSubmit =
    branchId !== null &&
    complete.length > 0 &&
    complete.length === lines.filter((l) => l.itemId !== '').length

  async function handleSubmit() {
    if (!branchId || !canSubmit) return
    setSubmitting(true)
    const { error } = await recordInventoryReceipt({
      branchId,
      lines: complete.map((l) => ({
        inventoryItemId: l.itemId,
        quantity: l.quantity ?? 0,
        unitCost: can('inventory.cost.manage') ? l.unitCost : null,
      })),
      reference: reference.trim() || null,
      note: note.trim() || null,
    })
    setSubmitting(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Stok girişi kaydedildi', 'success')
    navigate(base)
  }

  return (
    <Stack>
      <PageHeader
        title="Stok Girişi"
        subtitle={branchName || undefined}
        back={{ to: base, label: 'Stok' }}
      />

      <DataBoundary state={state}>
        {({ items }) =>
          items.filter((i) => i.isActive).length === 0 ? (
            <EmptyState
              icon="📦"
              title="Aktif ürün yok"
              description="Stok girmeden önce bu şubeye ürün eklenmesi gerekir."
            />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleSubmit()
              }}
            >
              <Stack>
                <ItemLinesEditor
                  items={items}
                  lines={lines}
                  onChange={setLines}
                  quantityLabel="Gelen miktar"
                  showCost={can('inventory.cost.manage')}
                />

                <Card>
                  <Stack gap="sm">
                    <Input
                      label="Belge / irsaliye no (opsiyonel)"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      maxLength={80}
                    />
                    <Input
                      label="Not (opsiyonel)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={200}
                    />
                    <Note>
                      Giriş tarihi ve saati sunucu tarafından kaydedilir; elle
                      değiştirilemez.
                    </Note>
                  </Stack>
                </Card>

                <StickyActionBar>
                  <Button
                    type="submit"
                    size="lg"
                    fullWidth
                    loading={submitting}
                    disabled={!canSubmit}
                  >
                    Stok Girişini Kaydet
                  </Button>
                </StickyActionBar>
              </Stack>
            </form>
          )
        }
      </DataBoundary>
    </Stack>
  )
}
