import { Button, CurrencyInput, QuantityInput, Select } from '../../../components/ui'
import type { InventoryItem } from '../../../services/data'
import { type ItemLine, newLine } from './itemLines'
import styles from './ItemLinesEditor.module.css'

export interface ItemLinesEditorProps {
  items: readonly InventoryItem[]
  lines: readonly ItemLine[]
  onChange: (lines: ItemLine[]) => void
  quantityLabel?: string
  /** Show an optional per-line unit cost field (only for callers allowed to set cost). */
  showCost?: boolean
  addLabel?: string
}

/**
 * Repeatable "item + quantity" rows used by receipts and waste. An item can
 * appear only once per submission (the server rejects duplicates), so items
 * already chosen in another row are disabled in the picker.
 */
export function ItemLinesEditor({
  items,
  lines,
  onChange,
  quantityLabel = 'Miktar',
  showCost = false,
  addLabel = 'Satır Ekle',
}: ItemLinesEditorProps) {
  const activeItems = items.filter((i) => i.isActive)

  function update(key: string, patch: Partial<ItemLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  return (
    <div className={styles.editor}>
      {lines.map((line, index) => {
        const item = activeItems.find((i) => i.id === line.itemId)
        const takenElsewhere = new Set(
          lines.filter((l) => l.key !== line.key && l.itemId).map((l) => l.itemId),
        )
        return (
          <div key={line.key} className={styles.line}>
            <div className={styles.lineHeader}>
              <span className={styles.lineTitle}>Kalem {index + 1}</span>
              {lines.length > 1 && (
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
                  aria-label={`Kalem ${index + 1} satırını kaldır`}
                >
                  Kaldır
                </button>
              )}
            </div>
            <Select
              label="Ürün"
              value={line.itemId}
              placeholder="Ürün seçin"
              onChange={(e) =>
                update(line.key, { itemId: e.target.value, quantity: null })
              }
              options={activeItems.map((i) => ({
                value: i.id,
                label: `${i.name} (${i.code})`,
                disabled: takenElsewhere.has(i.id),
              }))}
            />
            <QuantityInput
              label={quantityLabel}
              unit={item?.unit}
              allowDecimal={item?.allowsDecimal ?? true}
              value={line.quantity}
              onValueChange={(quantity) => update(line.key, { quantity })}
              disabled={!item}
            />
            {showCost && (
              <CurrencyInput
                label="Birim maliyet (opsiyonel)"
                value={line.unitCost}
                onValueChange={(unitCost) => update(line.key, { unitCost })}
                hint="Boş bırakılırsa mevcut maliyet korunur."
                disabled={!item}
              />
            )}
          </div>
        )
      })}
      <Button
        variant="secondary"
        onClick={() => onChange([...lines, newLine()])}
        disabled={lines.length >= activeItems.length}
      >
        + {addLabel}
      </Button>
    </div>
  )
}
