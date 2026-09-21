import { useState } from 'react'
import {
  buildCostHistory,
  effectiveCostAt,
  validateNewCost,
  type CostValidation,
} from '../../../domain/inventory'
import { formatDateTime } from '../../../utils/dates'
import { formatMoney } from '../../../utils/format'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import {
  BottomSheet,
  Button,
  CurrencyInput,
  DataBoundary,
  EmptyState,
  Input,
  Note,
  PageHeader,
  RowCard,
  SegmentedControl,
  Stack,
  StatusChip,
} from '../../../components/ui'
import { useAsync } from '../../../hooks/useAsync'
import { useToast } from '../../../hooks/useToast'
import {
  listBranchItemCosts,
  listInventoryItems,
  setInventoryItemCost,
  type InventoryItem,
  type ItemCostRow,
} from '../../../services/data'
import { useInventoryBase, useInventoryContext } from '../hooks'
import styles from './CostManagementPage.module.css'

const REASON_MESSAGES: Record<Exclude<CostValidation, { ok: true }>['reason'], string> = {
  invalid: 'Geçerli bir maliyet girin.',
  negative: 'Maliyet negatif olamaz.',
  precision: 'Maliyet en fazla 4 ondalık basamak içerebilir.',
  not_later:
    'Yeni maliyetin geçerlilik tarihi, mevcut son maliyet tarihinden sonra olmalıdır.',
  too_far: 'Geçerlilik tarihi en fazla 30 gün ileri olabilir.',
}

/**
 * Effective-dated product cost. History is APPEND-ONLY: a change is a new row
 * with its own effective date; past rows are never edited, so historical
 * gross profit stays reproducible. Only owners/managers may set a cost;
 * roles with cost.read see the history read-only.
 */
export function CostManagementPage() {
  const { branchId, branchName, can } = useInventoryContext()
  const base = useInventoryBase()
  const { showToast } = useToast()

  const data = useAsync(branchId ? `costs:${branchId}` : null, async () => {
    if (!branchId) return { items: [] as InventoryItem[], costs: [] as ItemCostRow[] }
    const [items, costs] = await Promise.all([
      listInventoryItems(branchId),
      listBranchItemCosts(branchId),
    ])
    return { items, costs }
  })

  const [target, setTarget] = useState<InventoryItem | null>(null)
  const [unitCost, setUnitCost] = useState<number | null>(null)
  const [timing, setTiming] = useState<'now' | 'scheduled'>('now')
  const [scheduledDate, setScheduledDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!can('inventory.cost.read')) {
    return <Unauthorized message="Maliyet bilgisini görüntüleme yetkiniz yok." />
  }

  const canManage = can('inventory.cost.manage')

  function open(item: InventoryItem) {
    setTarget(item)
    setUnitCost(null)
    setTiming('now')
    setScheduledDate('')
    setReason('')
  }

  const now = new Date()
  const existing = (data.data?.costs ?? []).filter(
    (c) => c.inventoryItemId === target?.id,
  )
  const effectiveFrom =
    timing === 'scheduled' && scheduledDate
      ? new Date(`${scheduledDate}T00:00:00+03:00`).toISOString()
      : now.toISOString()
  const validation: CostValidation | null =
    target && unitCost !== null
      ? validateNewCost(existing, { unitCost, effectiveFrom }, now)
      : null
  const validationMessage =
    validation && !validation.ok ? REASON_MESSAGES[validation.reason] : null
  const canSave =
    target !== null &&
    unitCost !== null &&
    validation?.ok === true &&
    (timing === 'now' || scheduledDate !== '')

  async function handleSave() {
    if (!target || unitCost === null) return
    setSaving(true)
    const { error } = await setInventoryItemCost({
      itemId: target.id,
      unitCost,
      effectiveFrom: timing === 'scheduled' ? effectiveFrom : null,
      reason: reason.trim() || null,
    })
    setSaving(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Yeni maliyet kaydedildi', 'success')
    setTarget(null)
    data.reload()
  }

  return (
    <Stack>
      <PageHeader
        title="Maliyet"
        subtitle={branchName || undefined}
        back={{ to: base, label: 'Stok' }}
      />
      <Note>
        Maliyet geçmişi silinmez ve düzenlenmez; her değişiklik yeni bir geçerlilik
        tarihiyle eklenir. Böylece geçmiş dönem brüt kârı her zaman aynı hesaplanır.
      </Note>

      <DataBoundary state={data} rows={3}>
        {({ items, costs }) =>
          items.length === 0 ? (
            <EmptyState
              icon="🏷️"
              title="Ürün yok"
              description="Önce bu şubeye ürün ekleyin."
            />
          ) : (
            <Stack gap="sm">
              {items.map((item) => {
                const itemCosts = costs.filter((c) => c.inventoryItemId === item.id)
                const current = effectiveCostAt(itemCosts, now)
                const history = buildCostHistory(itemCosts, now)
                const expanded = expandedId === item.id
                return (
                  <RowCard
                    key={item.id}
                    title={item.name}
                    subtitle={`${item.code} · ${item.unit}`}
                    trailing={
                      current === null ? (
                        <StatusChip tone="warning">Maliyet yok</StatusChip>
                      ) : (
                        <strong>
                          {formatMoney(current)} / {item.unit}
                        </strong>
                      )
                    }
                  >
                    <Stack gap="sm">
                      {history.length > 0 && (
                        <Button
                          variant="ghost"
                          onClick={() => setExpandedId(expanded ? null : item.id)}
                          aria-expanded={expanded}
                        >
                          {expanded
                            ? 'Geçmişi Gizle'
                            : `Maliyet Geçmişi (${history.length})`}
                        </Button>
                      )}
                      {expanded && (
                        <ol className={styles.history}>
                          {history.map((h) => (
                            <li key={`${h.effectiveFrom}`}>
                              {formatMoney(h.unitCost)} —{' '}
                              {formatDateTime(h.effectiveFrom)}{' '}
                              {h.isCurrent && (
                                <StatusChip tone="success">Geçerli</StatusChip>
                              )}
                              {h.isScheduled && (
                                <StatusChip tone="info">İleri tarihli</StatusChip>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                      {canManage && (
                        <Button variant="secondary" onClick={() => open(item)}>
                          Yeni Maliyet Belirle
                        </Button>
                      )}
                    </Stack>
                  </RowCard>
                )
              })}
            </Stack>
          )
        }
      </DataBoundary>

      <BottomSheet
        open={target !== null}
        onClose={() => (saving ? undefined : setTarget(null))}
        title={target ? `Yeni maliyet — ${target.name}` : 'Yeni maliyet'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (canSave) void handleSave()
          }}
        >
          <Stack gap="sm">
            <CurrencyInput
              label={`Birim maliyet (${target?.unit ?? ''} başına)`}
              value={unitCost}
              onValueChange={setUnitCost}
              error={
                validationMessage && timing === 'now' ? validationMessage : undefined
              }
            />
            <SegmentedControl
              label="Geçerlilik"
              value={timing}
              onChange={setTiming}
              options={[
                { value: 'now', label: 'Şimdiden' },
                { value: 'scheduled', label: 'İleri tarih' },
              ]}
            />
            {timing === 'scheduled' && (
              <Input
                label="Geçerlilik tarihi"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                error={validationMessage ?? undefined}
              />
            )}
            <Input
              label="Gerekçe (opsiyonel)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
            />
            <Note>Bu işlem denetim kaydına yazılır. Geçmiş kayıtlar değişmez.</Note>
            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={saving}
              disabled={!canSave}
            >
              Maliyeti Kaydet
            </Button>
          </Stack>
        </form>
      </BottomSheet>
    </Stack>
  )
}
