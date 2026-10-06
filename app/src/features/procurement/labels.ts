import type { PurchaseOrderStatus, SupplierType } from '../../domain/procurement'
import type { StatusTone } from '../../components/ui'

export const ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Taslak',
  SUBMITTED: 'Onay bekliyor',
  APPROVED: 'Onaylandı',
  PREPARING: 'Hazırlanıyor',
  IN_TRANSIT: 'Yolda',
  PARTIALLY_RECEIVED: 'Kısmen teslim alındı',
  RECEIVED: 'Teslim alındı',
  CANCELLED: 'İptal edildi',
}

export const ORDER_STATUS_TONES: Record<PurchaseOrderStatus, StatusTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  APPROVED: 'info',
  PREPARING: 'info',
  IN_TRANSIT: 'info',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  CANCELLED: 'neutral',
}

/** Action label for moving an order to a status. */
export const TRANSITION_LABELS: Partial<Record<PurchaseOrderStatus, string>> = {
  SUBMITTED: 'Onaya Gönder',
  DRAFT: 'Taslağa Geri Al',
  APPROVED: 'Onayla',
  PREPARING: 'Hazırlanıyor Olarak İşaretle',
  IN_TRANSIT: 'Yolda Olarak İşaretle',
  CANCELLED: 'İptal Et',
  RECEIVED: 'Eksik Teslimle Kapat',
}

export const SUPPLIER_TYPE_LABELS: Record<SupplierType, string> = {
  COMPANY: 'Firma',
  CENTRAL_WAREHOUSE: 'Merkez depo',
}

export const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const

export function weekdaysText(days: number[] | null): string {
  return days && days.length ? days.map((d) => WEEKDAY_SHORT[d - 1] ?? '?').join(' ') : 'Tanımsız'
}

/** '12,5' / '12.5' -> 12.5; empty -> null; garbage -> NaN (callers validate). */
export function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : Number(trimmed.replace(',', '.'))
}
