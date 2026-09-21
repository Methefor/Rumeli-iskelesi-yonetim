import { useState } from 'react'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import {
  BottomSheet,
  Button,
  DataBoundary,
  EmptyState,
  Inline,
  Input,
  Note,
  PageHeader,
  RowCard,
  SegmentedControl,
  Select,
  Stack,
  StatusChip,
} from '../../../components/ui'
import { useAsync } from '../../../hooks/useAsync'
import { useToast } from '../../../hooks/useToast'
import {
  listBranchCategories,
  listInventoryItems,
  setInventoryItemActive,
  upsertInventoryItem,
  type InventoryItem,
} from '../../../services/data'
import { useInventoryBase, useInventoryContext } from '../hooks'

interface FormState {
  itemId: string | null
  code: string
  name: string
  unit: string
  decimals: 'decimal' | 'whole'
  categoryId: string
}

const EMPTY_FORM: FormState = {
  itemId: null,
  code: '',
  name: '',
  unit: 'kg',
  decimals: 'decimal',
  categoryId: '',
}

/** Item catalogue for the selected branch. No products are pre-seeded — the business enters its own. */
export function InventoryItemsPage() {
  const { branchId, branchName, can } = useInventoryContext()
  const base = useInventoryBase()
  const { showToast } = useToast()

  const data = useAsync(branchId ? `items:${branchId}` : null, async () => {
    if (!branchId) return { items: [] as InventoryItem[], categories: [] }
    const [items, categories] = await Promise.all([
      listInventoryItems(branchId),
      listBranchCategories(branchId),
    ])
    return { items, categories }
  })

  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  if (!can('inventory.item.manage')) {
    return <Unauthorized message="Ürün tanımlama yetkiniz yok." />
  }

  async function handleSave() {
    if (!form || !branchId) return
    setSaving(true)
    const { error } = await upsertInventoryItem({
      itemId: form.itemId,
      branchId,
      code: form.code,
      name: form.name,
      unit: form.unit,
      allowsDecimal: form.decimals === 'decimal',
      salesCategoryId: form.categoryId || null,
    })
    setSaving(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast(form.itemId ? 'Ürün güncellendi' : 'Ürün eklendi', 'success')
    setForm(null)
    data.reload()
  }

  async function handleToggle(item: InventoryItem) {
    setTogglingId(item.id)
    const { error } = await setInventoryItemActive({
      itemId: item.id,
      isActive: !item.isActive,
    })
    setTogglingId(null)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast(item.isActive ? 'Ürün pasifleştirildi' : 'Ürün aktifleştirildi', 'success')
    data.reload()
  }

  const formValid =
    form !== null &&
    form.code.trim() !== '' &&
    form.name.trim() !== '' &&
    form.unit.trim() !== ''

  return (
    <Stack>
      <PageHeader
        title="Ürünler"
        subtitle={branchName || undefined}
        back={{ to: base, label: 'Stok' }}
        actions={<Button onClick={() => setForm(EMPTY_FORM)}>Ürün Ekle</Button>}
      />

      <DataBoundary state={data} rows={3}>
        {({ items, categories }) =>
          items.length === 0 ? (
            <EmptyState
              icon="📦"
              title="Henüz ürün yok"
              description="Bu şube için stok takibi yapacağınız ürünleri ekleyin. Örnek ürün eklenmez; katalog size aittir."
              action={<Button onClick={() => setForm(EMPTY_FORM)}>İlk Ürünü Ekle</Button>}
            />
          ) : (
            <Stack gap="sm">
              {items.map((item) => (
                <RowCard
                  key={item.id}
                  title={item.name}
                  subtitle={`${item.code} · ${item.unit} · ${item.allowsDecimal ? 'ondalıklı' : 'tam sayı'}`}
                  meta={
                    categories.find((c) => c.id === item.salesCategoryId)?.name ??
                    'Satış kategorisi yok'
                  }
                  trailing={
                    <StatusChip tone={item.isActive ? 'success' : 'neutral'}>
                      {item.isActive ? 'Aktif' : 'Pasif'}
                    </StatusChip>
                  }
                >
                  <Stack gap="sm">
                    <Inline>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setForm({
                            itemId: item.id,
                            code: item.code,
                            name: item.name,
                            unit: item.unit,
                            decimals: item.allowsDecimal ? 'decimal' : 'whole',
                            categoryId: item.salesCategoryId ?? '',
                          })
                        }
                      >
                        Düzenle
                      </Button>
                      <Button
                        variant="ghost"
                        loading={togglingId === item.id}
                        onClick={() => void handleToggle(item)}
                      >
                        {item.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                      </Button>
                    </Inline>
                  </Stack>
                </RowCard>
              ))}
            </Stack>
          )
        }
      </DataBoundary>

      <BottomSheet
        open={form !== null}
        onClose={() => (saving ? undefined : setForm(null))}
        title={form?.itemId ? 'Ürünü düzenle' : 'Ürün ekle'}
      >
        {form && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (formValid) void handleSave()
            }}
          >
            <Stack gap="sm">
              <Input
                label="Ürün kodu"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                maxLength={32}
                hint="Harf, rakam, nokta, tire veya alt çizgi. Şube içinde benzersiz olmalı."
                autoCapitalize="characters"
              />
              <Input
                label="Ürün adı"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={120}
              />
              <Input
                label="Birim"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                maxLength={16}
                hint="Örn. kg, adet, lt. Stok hareketi başladıktan sonra değiştirilemez."
              />
              <SegmentedControl
                label="Miktar türü"
                value={form.decimals}
                onChange={(decimals) => setForm({ ...form, decimals })}
                options={[
                  { value: 'decimal', label: 'Ondalıklı' },
                  { value: 'whole', label: 'Tam sayı' },
                ]}
              />
              <Select
                label="Satış kategorisi"
                value={form.categoryId}
                placeholder="Kategori yok"
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                options={(data.data?.categories ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                hint="Ürüne bağlı satış satırı bu kategoride mutabık edilir."
              />
              <Note>
                Tek stok birimi kullanılır; reçete ve birim dönüşümü bu sürümde yoktur.
              </Note>
              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={saving}
                disabled={!formValid}
              >
                Kaydet
              </Button>
            </Stack>
          </form>
        )}
      </BottomSheet>
    </Stack>
  )
}
