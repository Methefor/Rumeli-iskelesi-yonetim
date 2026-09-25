import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { canInventory, isOwnerOrManager } from '../../../domain/inventory'
import { reconcile } from '../../../domain/reconciliation'
import { evaluateBackdatedEntry } from '../../../domain/shifts'
import { istanbulDate } from '../../../utils/dates'
import { formatMoney } from '../../../utils/format'
import {
  Button,
  Card,
  CurrencyInput,
  DataBoundary,
  EmptyState,
  Input,
  Note,
  PageHeader,
  QuantityInput,
  SegmentedControl,
  Stack,
  StatusChip,
  StickyActionBar,
} from '../../../components/ui'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../hooks/useToast'
import {
  createSalesReport,
  listBranchCategories,
  listInventoryItems,
  listMyShiftAssignments,
  type SalesReportItemInput,
} from '../../../services/data'

/**
 * Sales report entry. Categories with tracked products are entered PER
 * PRODUCT (explicit sold quantity + revenue) so stock is reduced server-side
 * in the same transaction; other categories stay category-level (revenue
 * only). Quantity is never inferred from revenue. The reconciliation shown
 * here is a preview — the server decides the stored status.
 */
export function NewSalesReportPage() {
  const { shiftId } = useParams<{ shiftId: string }>()
  const { user, roles } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const state = useAsync(
    user && shiftId ? `new-report:${user.id}:${shiftId}` : null,
    async () => {
      if (!user || !shiftId) return null
      const assignment =
        (await listMyShiftAssignments(user.id)).find((a) => a.shift.id === shiftId) ??
        null
      if (!assignment) return null
      const branchId = assignment.shift.branchId
      const [categories, items] = await Promise.all([
        listBranchCategories(branchId),
        canInventory(roles, 'inventory.read')
          ? listInventoryItems(branchId).catch(() => [])
          : Promise.resolve([]),
      ])
      return {
        assignment,
        categories,
        items: items.filter((i) => i.isActive && i.salesCategoryId),
      }
    },
  )

  const [reportType, setReportType] = useState<'X' | 'Z'>('X')
  const [grossRevenue, setGrossRevenue] = useState<number | null>(null)
  const [transactionCount, setTransactionCount] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [amounts, setAmounts] = useState<Record<string, number | null>>({})
  const [quantities, setQuantities] = useState<Record<string, number | null>>({})
  const [productAmounts, setProductAmounts] = useState<Record<string, number | null>>({})
  const [backdatedReason, setBackdatedReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(
    categoryIdsWithProducts: Set<string>,
    itemIds: string[],
    categoryIds: string[],
  ) {
    if (!shiftId || grossRevenue === null) return
    const items: SalesReportItemInput[] = []
    for (const id of categoryIds) {
      if (categoryIdsWithProducts.has(id)) continue
      const amount = amounts[id]
      if (amount !== null && amount !== undefined) items.push({ categoryId: id, amount })
    }
    for (const id of itemIds) {
      const qty = quantities[id]
      const amount = productAmounts[id]
      if (qty && qty > 0 && amount !== null && amount !== undefined) {
        items.push({ inventoryItemId: id, inventoryQuantity: qty, amount })
      }
    }
    setSubmitting(true)
    const { error } = await createSalesReport({
      shiftId,
      reportType,
      grossRevenue,
      transactionCount,
      notes: notes.trim() || null,
      items,
      backdatedReason: backdatedReason.trim() || null,
    })
    setSubmitting(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Rapor gönderildi', 'success')
    navigate('/app/employee/reports')
  }

  return (
    <Stack>
      <PageHeader
        title="Satış Raporu"
        back={{ to: '/app/employee/shifts', label: 'Vardiyalarım' }}
      />
      <DataBoundary state={state} rows={3} rowHeight={120}>
        {(data) => {
          if (data === null) {
            return (
              <EmptyState
                icon="🔒"
                title="Bu vardiyaya atanmış değilsiniz"
                description="Yalnızca size atanan vardiyalar için rapor gönderebilirsiniz."
              />
            )
          }
          const { assignment, categories, items } = data
          const backdated = evaluateBackdatedEntry(
            assignment.shift.businessDate,
            isOwnerOrManager(roles),
            istanbulDate(),
          )
          const trackedCategories = new Set(items.map((i) => i.salesCategoryId as string))
          const categoryIds = categories.map((c) => c.id)
          const itemIds = items.map((i) => i.id)

          const halfFilled = items.some((i) => {
            const q = quantities[i.id]
            const a = productAmounts[i.id]
            return (q && q > 0) !== (a !== null && a !== undefined)
          })
          const categoryTotal = categories
            .filter((c) => !trackedCategories.has(c.id))
            .reduce((s, c) => s + (amounts[c.id] ?? 0), 0)
          const productTotal = items.reduce(
            (s, i) => s + ((quantities[i.id] ?? 0) > 0 ? (productAmounts[i.id] ?? 0) : 0),
            0,
          )
          const itemsTotal = categoryTotal + productTotal
          const preview =
            grossRevenue !== null
              ? reconcile(grossRevenue, itemsTotal, {
                  warningPercentage: 2,
                  errorPercentage: 5,
                })
              : null

          if (backdated.deniedForRole || backdated.isFuture) {
            return (
              <EmptyState
                icon="🔒"
                title={
                  backdated.isFuture
                    ? 'İleri bir tarih için rapor girilemez'
                    : 'Bu vardiya için rapor girme süresi doldu'
                }
                description={
                  backdated.isFuture
                    ? 'Seçilen vardiyanın tarihi henüz gelmedi.'
                    : 'Yalnızca bugün ve önceki 3 gün için rapor girebilirsiniz. Daha eski bir tarih için yönetici veya işletme sahibinden gerekçeli olarak girmesini isteyin.'
                }
              />
            )
          }

          return (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleSubmit(trackedCategories, itemIds, categoryIds)
              }}
            >
              <Stack>
                <Note>
                  {assignment.shift.branchName} — {assignment.shift.definition.name}
                </Note>
                {backdated.requiresOverrideReason && (
                  <Card>
                    <Stack gap="sm">
                      <StatusChip tone="warning">Geriye dönük giriş</StatusChip>
                      <Note>
                        Bu vardiyanın tarihi 3 günden eskidir. Normal kullanıcılar bu
                        tarihe rapor giremez; yönetici/işletme sahibi olarak devam etmek
                        için bir gerekçe girmelisiniz. Bu işlem ayrıca denetim
                        kaydına yazılır.
                      </Note>
                      <Input
                        label="Gerekçe (zorunlu)"
                        value={backdatedReason}
                        onChange={(e) => setBackdatedReason(e.target.value)}
                        maxLength={200}
                      />
                    </Stack>
                  </Card>
                )}
                <Card>
                  <Stack gap="sm">
                    <SegmentedControl
                      label="Rapor türü"
                      value={reportType}
                      onChange={setReportType}
                      options={[
                        { value: 'X', label: 'X Raporu (sabah)' },
                        { value: 'Z', label: 'Z Raporu (akşam)' },
                      ]}
                    />
                    <CurrencyInput
                      label="Kasa toplamı (brüt ciro)"
                      value={grossRevenue}
                      onValueChange={setGrossRevenue}
                    />
                    <QuantityInput
                      label="İşlem sayısı (opsiyonel)"
                      allowDecimal={false}
                      value={transactionCount}
                      onValueChange={setTransactionCount}
                    />
                    <Input
                      label="Not (opsiyonel)"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={200}
                    />
                  </Stack>
                </Card>

                {items.length > 0 && (
                  <Card>
                    <Stack gap="sm">
                      <strong>Ürün satışları</strong>
                      <Note>
                        Satılan miktarı ve geliri ürün bazında girin; stok bu miktardan
                        düşülür. Boş bırakılan ürün kaydedilmez.
                      </Note>
                      {items.map((item) => (
                        <Stack key={item.id} gap="sm">
                          <span>{item.name}</span>
                          <QuantityInput
                            label="Satılan miktar"
                            unit={item.unit}
                            allowDecimal={item.allowsDecimal}
                            value={quantities[item.id] ?? null}
                            onValueChange={(v) =>
                              setQuantities((p) => ({ ...p, [item.id]: v }))
                            }
                          />
                          <CurrencyInput
                            label="Gelir"
                            value={productAmounts[item.id] ?? null}
                            onValueChange={(v) =>
                              setProductAmounts((p) => ({ ...p, [item.id]: v }))
                            }
                          />
                        </Stack>
                      ))}
                      {halfFilled && (
                        <StatusChip tone="warning">
                          Her ürün için hem miktar hem gelir girin
                        </StatusChip>
                      )}
                    </Stack>
                  </Card>
                )}

                {categories.some((c) => !trackedCategories.has(c.id)) && (
                  <Card>
                    <Stack gap="sm">
                      <strong>Kategori dağılımı</strong>
                      {categories
                        .filter((c) => !trackedCategories.has(c.id))
                        .map((c) => (
                          <CurrencyInput
                            key={c.id}
                            label={c.name}
                            value={amounts[c.id] ?? null}
                            onValueChange={(v) =>
                              setAmounts((p) => ({ ...p, [c.id]: v }))
                            }
                          />
                        ))}
                    </Stack>
                  </Card>
                )}

                <Note>
                  Girilen dağılım toplamı: {formatMoney(itemsTotal)}
                  {preview &&
                    preview.status !== 'OK' &&
                    ' — kasa toplamından farklı; mutabakat kuyruğuna düşebilir.'}
                </Note>

                <StickyActionBar>
                  <Button
                    type="submit"
                    size="lg"
                    fullWidth
                    loading={submitting}
                    disabled={
                      grossRevenue === null ||
                      halfFilled ||
                      (backdated.requiresOverrideReason && !backdatedReason.trim())
                    }
                  >
                    Raporu Gönder
                  </Button>
                </StickyActionBar>
              </Stack>
            </form>
          )
        }}
      </DataBoundary>
    </Stack>
  )
}
