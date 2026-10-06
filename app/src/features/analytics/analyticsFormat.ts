import type { Comparison, Confidence, MetricValue } from '../../domain/analytics'
import { formatMoney } from '../../utils/format'

const percent = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })

const REASON: Record<string, string> = {
  no_reports: 'Bu dönemde rapor yok',
  transaction_count_missing: 'İşlem sayısı girilmemiş',
  transaction_count_missing_for_some_shifts: 'Bazı vardiyalarda işlem sayısı eksik',
  zero_transactions: 'İşlem sayısı 0',
  quantity_missing: 'Adet bilgisi girilmemiş',
  quantity_missing_for_some_lines: 'Bazı satırlarda adet eksik',
  no_cost_coverage: 'Maliyet eşlemesi yok',
  cost_or_product_mapping_missing_for_part_of_revenue: 'Cirosunun bir bölümü için maliyet/ürün eşlemesi yok',
  computed_over_shifts_with_transaction_count: 'Yalnızca işlem sayısı olan vardiyalar üzerinden',
  missing_z: 'Z raporu yok (geçici veri)',
  missing_product_detail: 'Ürün detayı yok',
  missing_category_detail: 'Kategori detayı yok',
  missing_cost: 'Maliyet eşlemesi eksik',
  missing_context: 'Hava/takvim verisi yok',
  legacy_source_limitation: 'Eski sistem kaynağı bu metriği desteklemiyor',
  xz_line_semantics_unknown: 'X/Z satır anlamı belirlenmedi (karar bekliyor)',
  z_line_semantics_unverified: 'Z satırlarının kümülatif olduğu doğrulanmadı',
  line_semantics_unverified: 'Satır anlamı doğrulanmadı',
  no_hourly_source: 'Saatlik veri kaynağı yok',
  week_in_progress: 'Hafta henüz bitmedi',
  insufficient_sample: 'Örnek yetersiz',
}

export function reasonText(reason: string | undefined): string {
  return reason ? (REASON[reason] ?? reason) : ''
}

/** Value slot text for a metric: never a silent 0 for a metric that has no value. */
export function metricText(m: MetricValue | undefined, toText: (n: number) => string): string {
  if (!m || m.value === undefined) return 'Veri yok'
  return toText(m.value)
}
export const moneyMetric = (m: MetricValue | undefined) => metricText(m, formatMoney)
export const countMetric = (m: MetricValue | undefined) => metricText(m, (n) => new Intl.NumberFormat('tr-TR').format(n))

/** "Kısmi" tag + reason for a partial metric; the reason for an unavailable one. */
export function metricNote(m: MetricValue | undefined): string | undefined {
  if (!m) return undefined
  if (m.state === 'partial') return `Kısmi · ${reasonText(m.reason)}`
  if (m.state === 'unavailable') return reasonText(m.reason) || undefined
  return undefined
}

export interface ComparisonView {
  text: string
  trend?: 'up' | 'down' | 'flat'
  /** true when a percentage is shown */
  hasPct: boolean
}

export function comparisonView(c: Comparison | undefined, kind: 'money' | 'count' = 'money'): ComparisonView {
  if (!c) return { text: 'Karşılaştırma yok', hasPct: false }
  const money = (n: number) => (kind === 'money' ? formatMoney(Math.abs(n)) : String(Math.abs(n)))
  switch (c.state) {
    case 'ok': {
      const pct = c.pct ?? 0
      return {
        text: `${pct > 0 ? '+' : pct < 0 ? '−' : ''}%${percent.format(Math.abs(pct))}`,
        trend: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
        hasPct: true,
      }
    }
    case 'low_base':
      return { text: `Küçük baz: ${(c.delta ?? 0) >= 0 ? '+' : '−'}${money(c.delta ?? 0)} (yüzde gösterilmiyor)`, hasPct: false }
    case 'zero_base':
      return { text: 'Önceki değer 0, yüzde hesaplanamaz', hasPct: false }
    case 'insufficient_samples':
      return { text: `Yetersiz örnek (${c.samples ?? 0})`, hasPct: false }
    case 'no_current':
      return { text: 'Güncel değer yok', hasPct: false }
    case 'not_final':
      return { text: 'Dönem kesinleşmedi (Z yok), yüzde gösterilmiyor', hasPct: false }
    case 'baseline_not_final':
      return { text: 'Karşılaştırma dönemi kesinleşmemiş', hasPct: false }
    case 'mixed_origin':
      return { text: 'Eski sistem ve yeni veri karışık, karşılaştırılamaz', hasPct: false }
    default:
      return { text: 'Karşılaştırma verisi yok', hasPct: false }
  }
}

export const STATUS_LABEL = { complete: 'Tam', partial: 'Kısmi', unsupported: 'Desteklenmiyor' } as const
export const STATUS_TONE = { complete: 'success', partial: 'warning', unsupported: 'neutral' } as const

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  fact: 'Olgu',
  relationship: 'İlişki',
  hypothesis: 'Hipotez',
}
export const CONFIDENCE_HELP: Record<Confidence, string> = {
  fact: 'Doğrudan hesaplanan veri',
  relationship: 'İstatistiksel ilişki, neden-sonuç değil',
  hypothesis: 'Olası açıklama, doğrulanmadı',
}
export const CONFIDENCE_TONE: Record<Confidence, 'success' | 'info' | 'warning'> = {
  fact: 'success',
  relationship: 'info',
  hypothesis: 'warning',
}
