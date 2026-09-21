import { useState } from 'react'
import { calculateVariance } from '../../../domain/inventory'
import { istanbulDate, formatDateTime } from '../../../utils/dates'
import { formatQuantity, formatSignedQuantity } from '../../../utils/format'
import {
  Button,
  Card,
  ConfirmSheet,
  DataBoundary,
  EmptyState,
  Input,
  LinkButton,
  Note,
  PageHeader,
  QuantityInput,
  RowCard,
  Select,
  Stack,
  StatusChip,
  StickyActionBar,
} from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import { useAsync } from '../../../hooks/useAsync'
import { useToast } from '../../../hooks/useToast'
import {
  listInventoryCounts,
  submitInventoryCount,
  voidInventoryCount,
  type InventoryCountSummary,
} from '../../../services/data'
import { SummaryList } from '../components/SummaryList'
import {
  shiftOptionLabel,
  useBranchInventory,
  useInventoryBase,
  useInventoryContext,
  useRecentShifts,
} from '../hooks'
import styles from './ClosingCountPage.module.css'

/**
 * Closing count. The employee enters what is physically on the shelf; the
 * screen shows the recorded (theoretical) quantity and a live variance
 * preview. SUBMITTING RECORDS THE VARIANCE ONLY — it never changes the stock
 * ledger; explaining a variance is a separate, privileged adjustment.
 */
export function ClosingCountPage() {
  const { branchId, branchName, can } = useInventoryContext()
  const base = useInventoryBase()
  const { showToast } = useToast()
  const inventory = useBranchInventory()
  const shifts = useRecentShifts()
  const today = istanbulDate()
  const counts = useAsync(branchId ? `counts:${branchId}` : null, () =>
    branchId
      ? listInventoryCounts(branchId, 10)
      : Promise.resolve([] as InventoryCountSummary[]),
  )

  const [physical, setPhysical] = useState<Record<string, number | null>>({})
  const [shiftId, setShiftId] = useState('')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedSummary, setSubmittedSummary] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<InventoryCountSummary | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  if (!can('inventory.count')) {
    return <Unauthorized message="Sayım girme yetkiniz yok." />
  }

  const entered = Object.entries(physical).filter(
    (entry): entry is [string, number] => entry[1] !== null,
  )

  async function handleConfirm() {
    if (!branchId || entered.length === 0) return
    setSubmitting(true)
    const { error } = await submitInventoryCount({
      branchId,
      shiftId: shiftId || null,
      lines: entered.map(([inventoryItemId, physicalQuantity]) => ({
        inventoryItemId,
        physicalQuantity,
      })),
      note: note.trim() || null,
    })
    setSubmitting(false)
    setConfirming(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Sayım kaydedildi', 'success')
    setSubmittedSummary(`${entered.length} ürün sayıldı.`)
    setPhysical({})
    setNote('')
    inventory.reload()
    counts.reload()
  }

  async function handleVoid() {
    if (!voidTarget || !voidReason.trim()) return
    setVoiding(true)
    const { error } = await voidInventoryCount({
      countId: voidTarget.id,
      reason: voidReason.trim(),
    })
    setVoiding(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Sayım iptal edildi', 'success')
    setVoidTarget(null)
    setVoidReason('')
    inventory.reload()
    counts.reload()
  }

  return (
    <Stack>
      <PageHeader
        title="Kapanış Sayımı"
        subtitle={branchName || undefined}
        back={{ to: base, label: 'Stok' }}
      />

      {submittedSummary && (
        <Card>
          <Stack gap="sm">
            <StatusChip tone="success">Sayım kaydedildi</StatusChip>
            <p className={styles.plain}>
              {submittedSummary} Sonuçları aşağıdaki son sayımlarda ve Stok ekranında
              görebilirsiniz.
            </p>
            <LinkButton to={base} variant="secondary">
              Stok Durumuna Dön
            </LinkButton>
          </Stack>
        </Card>
      )}

      <DataBoundary state={inventory} rows={5}>
        {({ items, balances }) => {
          const active = items
            .filter((i) => i.isActive)
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
          if (active.length === 0) {
            return (
              <EmptyState
                icon="📦"
                title="Sayılacak ürün yok"
                description="Bu şubede aktif bir ürün bulunmuyor."
              />
            )
          }
          const theoreticalOf = (id: string) =>
            balances.find((b) => b.inventoryItemId === id)?.theoreticalQuantity ?? 0

          return (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (entered.length > 0) setConfirming(true)
                }}
              >
                <Stack>
                  <Note>
                    Raftaki gerçek miktarı girin. Sayım, kayıtlı stoğu değiştirmez; fark
                    yalnızca kaydedilir. Sayamadığınız ürünleri boş bırakabilirsiniz.
                  </Note>

                  {active.map((item) => {
                    const value = physical[item.id] ?? null
                    const theoretical = theoreticalOf(item.id)
                    const variance =
                      value === null ? null : calculateVariance(value, theoretical)
                    return (
                      <Card key={item.id}>
                        <Stack gap="sm">
                          <div className={styles.itemHeader}>
                            <div>
                              <div className={styles.itemName}>{item.name}</div>
                              <div className={styles.itemMeta}>
                                {item.code} · Kayıtlı stok:{' '}
                                <strong>
                                  {formatQuantity(theoretical)} {item.unit}
                                </strong>
                              </div>
                            </div>
                            {variance !== null && (
                              <StatusChip
                                tone={variance.variance === 0 ? 'success' : 'warning'}
                              >
                                Fark {formatSignedQuantity(variance.variance)} {item.unit}
                              </StatusChip>
                            )}
                          </div>
                          <QuantityInput
                            label="Sayılan miktar"
                            unit={item.unit}
                            allowDecimal={item.allowsDecimal}
                            value={value}
                            onValueChange={(v) =>
                              setPhysical((prev) => ({ ...prev, [item.id]: v }))
                            }
                          />
                        </Stack>
                      </Card>
                    )
                  })}

                  <Card>
                    <Stack gap="sm">
                      <Select
                        label="Vardiya (opsiyonel)"
                        value={shiftId}
                        placeholder="Vardiya belirtme"
                        onChange={(e) => setShiftId(e.target.value)}
                        options={(shifts.data ?? []).map((s) => ({
                          value: s.id,
                          label: shiftOptionLabel(s, today),
                        }))}
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
                    <Button
                      type="submit"
                      size="lg"
                      fullWidth
                      disabled={entered.length === 0}
                    >
                      Sayımı Gönder ({entered.length})
                    </Button>
                  </StickyActionBar>
                </Stack>
              </form>

              <ConfirmSheet
                open={confirming}
                title="Sayımı onaylayın"
                confirmLabel="Onayla ve Gönder"
                loading={submitting}
                onConfirm={() => void handleConfirm()}
                onCancel={() => setConfirming(false)}
              >
                <SummaryList
                  rows={entered.map(([id, qty]) => {
                    const item = items.find((i) => i.id === id)
                    const v = calculateVariance(qty, theoreticalOf(id)).variance
                    return {
                      key: id,
                      label: item?.name,
                      value: `${formatQuantity(qty)} ${item?.unit ?? ''}${v !== 0 ? `  (fark ${formatSignedQuantity(v)})` : ''}`,
                      highlight: v !== 0,
                    }
                  })}
                  footnote="Gönderilen sayım silinemez; hatalıysa bir yönetici iptal edebilir. Sayım kayıtlı stoğu değiştirmez."
                />
              </ConfirmSheet>
            </>
          )
        }}
      </DataBoundary>

      <section aria-labelledby="recent-counts">
        <h2 id="recent-counts" className={styles.sectionTitle}>
          Son sayımlar
        </h2>
        <DataBoundary state={counts} rows={2}>
          {(list) =>
            list.length === 0 ? (
              <Note>Bu şube için henüz sayım yapılmadı.</Note>
            ) : (
              <Stack gap="sm">
                {list.map((count) => {
                  const withVariance = count.lines.filter(
                    (l) => l.varianceQuantity !== 0,
                  ).length
                  return (
                    <RowCard
                      key={count.id}
                      title={formatDateTime(count.submittedAt)}
                      subtitle={`${count.lines.length} ürün · ${withVariance} farklı`}
                      meta={count.note ?? undefined}
                      trailing={
                        count.status === 'voided' ? (
                          <StatusChip tone="danger">İptal</StatusChip>
                        ) : withVariance === 0 ? (
                          <StatusChip tone="success">Fark yok</StatusChip>
                        ) : (
                          <StatusChip tone="warning">{withVariance} fark</StatusChip>
                        )
                      }
                    >
                      {count.status === 'submitted' && can('inventory.adjust') && (
                        <Button variant="ghost" onClick={() => setVoidTarget(count)}>
                          Sayımı İptal Et
                        </Button>
                      )}
                    </RowCard>
                  )
                })}
              </Stack>
            )
          }
        </DataBoundary>
      </section>

      <ConfirmSheet
        open={voidTarget !== null}
        title="Sayımı iptal et"
        confirmLabel="İptal Et"
        tone="danger"
        loading={voiding}
        confirmDisabled={!voidReason.trim()}
        onConfirm={() => void handleVoid()}
        onCancel={() => {
          setVoidTarget(null)
          setVoidReason('')
        }}
      >
        <Stack gap="sm">
          <Note>
            İptal edilen sayım geçmişte kalır ancak son sayım olarak sayılmaz. Gerekçe
            zorunludur.
          </Note>
          <Input
            label="Gerekçe"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            maxLength={200}
          />
        </Stack>
      </ConfirmSheet>
    </Stack>
  )
}
