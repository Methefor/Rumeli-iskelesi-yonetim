import type { MovementType } from '../../domain/inventory'
import type { WasteReasonCode } from '../../services/data'
import type { StatusTone } from '../../components/ui'

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  RECEIPT: 'Stok girişi',
  SALE: 'Satış',
  WASTE: 'Fire',
  ADJUSTMENT_IN: 'Düzeltme (+)',
  ADJUSTMENT_OUT: 'Düzeltme (−)',
  REVERSAL: 'Geri alma',
}

export const MOVEMENT_TONES: Record<MovementType, StatusTone> = {
  RECEIPT: 'success',
  SALE: 'info',
  WASTE: 'danger',
  ADJUSTMENT_IN: 'warning',
  ADJUSTMENT_OUT: 'warning',
  REVERSAL: 'neutral',
}

export const WASTE_REASONS: ReadonlyArray<{ value: WasteReasonCode; label: string }> = [
  { value: 'expired', label: 'Son kullanma tarihi geçti' },
  { value: 'damaged', label: 'Hasarlı / bozuk' },
  { value: 'spilled', label: 'Döküldü' },
  { value: 'quality', label: 'Kalite sorunu' },
  { value: 'sample', label: 'Numune / ikram' },
  { value: 'other', label: 'Diğer' },
]

export function wasteReasonLabel(code: string | null): string {
  return WASTE_REASONS.find((r) => r.value === code)?.label ?? ''
}
