import { addDaysIso } from '../../utils/dates'
import type { EvidenceEntry, EvidenceKind, EvidenceOrigin, EvidenceUnit, Fact, FactValue, Limitation, LimitationCode, Reproducibility, Support } from './types'

/** Values are stored with the precision the renderers print them with, so a narrative number can be proven against the evidence. */
export function normalizeValue(value: FactValue, unit: EvidenceUnit): FactValue {
  if (typeof value !== 'number') return value
  if (unit === 'TRY' || unit === 'ratio') return Math.round(value * 100) / 100
  if (unit === 'pct' || unit === 'celsius' || unit === 'mm') return Math.round(value * 10) / 10
  return value
}

const LIVE = /^(attention\.|procurement\.|weather\.forecast\.|ops\.reconciliation\.backlog$|inventory\.stockAlertBranches$)|\.stockAlerts$/
const MUTABLE_ALWAYS = /(^|\.)waste\.|^inventory\.waste\.|\.count\.|^recurrence\.count_/
const SNAPSHOT_DERIVED_DAILY = /\.(transactions|averageBasket)$|^org\.(transactions|averageBasket)$|vsLastWeek|^weather\.daily\./

/**
 * Origin of an evidence id, from its registry key. A DAILY report reads revenue, reconciliation and shifts from the ordinary report
 * tables (mutable), while a WEEKLY report reads them from the stored weekly/daily snapshots (immutable).
 */
export function originOf(ref: string, reportType: 'daily' | 'weekly'): EvidenceOrigin {
  if (LIVE.test(ref)) return 'live'
  if (MUTABLE_ALWAYS.test(ref)) return 'mutable'
  if (reportType === 'daily' && !SNAPSHOT_DERIVED_DAILY.test(ref)) return 'mutable'
  return 'immutable'
}

/** Registry of everything a narrative may cite. Only SUPPORTED values are ever registered: an unsupported metric has no evidence id. */
export class EvidenceBook {
  readonly entries: Record<string, EvidenceEntry> = {}
  private readonly reportType: 'daily' | 'weekly'

  constructor(reportType: 'daily' | 'weekly') {
    this.reportType = reportType
  }

  add(ref: string, value: FactValue, unit: EvidenceUnit, label: string, opts: { kind?: EvidenceKind; support?: 'complete' | 'partial' } = {}): string {
    this.entries[ref] = { kind: opts.kind ?? 'fact', origin: originOf(ref, this.reportType), support: opts.support ?? 'complete', value: normalizeValue(value, unit), unit, label }
    return ref
  }

  /**
   * Builds a Fact. `unsupported` (or a null value) yields value null and NO evidence id; a legitimate 0 stays 0.
   * `partial` registers the value as partial evidence, so a narrative can never state it as a complete fact.
   */
  fact(ref: string, value: number | null, unit: EvidenceUnit, label: string, support: Support, reasons: string[] = []): Fact {
    if (support === 'unsupported' || value === null || !Number.isFinite(value)) {
      return { support: 'unsupported', value: null, reasons: [...new Set(reasons)], ref: null }
    }
    this.add(ref, value, unit, label, { support })
    return { support, value: normalizeValue(value, unit) as number, reasons: [...new Set(reasons)], ref }
  }
}

export const unsupportedFact = (...reasons: string[]): Fact => ({ support: 'unsupported', value: null, reasons: [...new Set(reasons)], ref: null })

/** The weakest support of several facts (complete < partial < unsupported), for aggregates. */
export function weakest(supports: readonly Support[]): Support {
  if (supports.length === 0) return 'unsupported'
  if (supports.includes('unsupported')) return 'unsupported'
  return supports.includes('partial') ? 'partial' : 'complete'
}

/** Round to 2 decimals the way money is stored (a TRY value from kurus), avoiding float noise in sums. */
export const round2 = (n: number): number => Math.round(n * 100) / 100
export const round1 = (n: number): number => Math.round(n * 10) / 10

const LIMITATION_TEXT: Record<LimitationCode, string> = {
  missing_z: 'Z raporu olmayan günlerin cirosu kesinleşmedi; geçici X okuması ciroya eklenmedi.',
  missing_transaction_count: 'İşlem sayısı bu veri kaynağında desteklenmediği için ortalama sepet karşılaştırması yapılmadı.',
  missing_product_detail: 'Ürün/kategori ayrıntısı eksik olduğu için ürün bazlı yorum yapılmadı.',
  line_semantics_unverified: 'Satır kalemlerinin X/Z anlamı doğrulanmadığı için ürün, kategori ve brüt kâr yorumu yapılmadı.',
  missing_cost: 'Bazı ürünlerde maliyet tanımlı olmadığı için brüt kâr kısmi veya hesaplanamıyor.',
  missing_context: 'Hava ve takvim bağlamı eksik olduğu için bağlam yorumu yapılmadı.',
  legacy_source_limitation: 'Eski sistemden aktarılan veriler yalnızca kaynağın desteklediği ölçüleri içerir.',
  mixed_origin: 'Eski ve yeni sistem verisi karışık; yalnızca ciro karşılaştırılabilir, işlem sayısı ve ortalama sepet karşılaştırılmadı.',
  stale_weather: 'Hava tahmini eski olabilir; güncelleme zamanı belirtildi.',
  incomplete_week: 'Hafta henüz bitmedi; değerler haftanın şu ana kadarki kısmıdır, kesin hafta sonucu değildir.',
  snapshot_missing: 'Bu tarih için analiz özeti oluşturulmamış; analiz tabanlı ölçüler gösterilmedi.',
  snapshot_stale: 'Analiz özeti güncel kaynak verinin gerisinde; analiz tabanlı ölçüler gösterilmedi.',
  source_unavailable: 'Bazı veri kaynakları okunamadı (yetki veya hata); bu "sorun yok" anlamına gelmez.',
  not_current_date: 'Seçilen tarih bugün değil; anlık durum bilgileri (uyarılar, sipariş durumu, tahmin) bu rapora dahil edilmedi.',
  no_daily_history: 'Stok ve sipariş durumu günlük olarak geçmişe dönük saklanmadığı için tekrar sayımı yalnızca saklanan günlük kayıtlarla yapıldı.',
  insufficient_sample: 'İlişki için yeterli örnek yok; yorum yapılmadı.',
  no_finalized_data: 'Kesinleşmiş (Z) veri yok; ciro yorumu yapılmadı.',
  no_comparison_baseline: 'Karşılaştırma için uygun önceki dönem yok; karşılaştırma yapılmadı.',
  no_permission: 'Bazı bölümler yetkiniz olmadığı için gösterilmedi; bu "sorun yok" anlamına gelmez.',
  live_state: 'Bu özet anlık durum bilgisi içerir veya dönem henüz bitmedi; ileride aynı içerikle yeniden üretilemez.',
  mutable_sources: 'Bu özetin bazı kaynakları sonradan değişebilen kayıtlardır; ileride birebir aynı içerikle yeniden üretilemeyebilir.',
}

/**
 * Limitations that make the REVENUE picture itself incomplete. Everything else (missing cost, no transaction counts, no weather context, ...)
 * only limits an individual metric, which carries its own support state; it does not make the whole report "partial".
 */
export const BLOCKING_LIMITATIONS: readonly LimitationCode[] = ['missing_z', 'no_finalized_data', 'snapshot_missing', 'snapshot_stale', 'source_unavailable', 'incomplete_week', 'no_permission']

/** Report reproducibility from the evidence origins (and whether the period is still open). Never claimed, always derived. */
export function reproducibilityOf(entries: Record<string, EvidenceEntry>, periodOpen: boolean): Reproducibility {
  const evidence = { immutable: 0, mutable: 0, live: 0 }
  for (const e of Object.values(entries)) evidence[e.origin] += 1
  const reasons: Reproducibility['reasons'] = []
  if (periodOpen) reasons.push('period_open')
  if (evidence.live > 0) reasons.push('live_evidence')
  if (evidence.mutable > 0) reasons.push('mutable_evidence')
  const state = periodOpen || evidence.live > 0 ? 'live' : evidence.mutable > 0 ? 'partial' : 'exact'
  return { state, reasons, evidence }
}

export const limitationText = (code: LimitationCode): string => LIMITATION_TEXT[code]

/** De-duplicating limitation collector: one entry per (code, branch). */
export class LimitationBook {
  private readonly map = new Map<string, Limitation>()

  add(code: LimitationCode, branch: { key: string; name: string } | null = null, text?: string): void {
    const key = `${code}:${branch?.key ?? '*'}`
    if (!this.map.has(key)) this.map.set(key, { code, branchKey: branch?.key ?? null, branchName: branch?.name ?? null, text: text ?? LIMITATION_TEXT[code] })
  }

  list(): Limitation[] {
    return [...this.map.values()].sort((a, b) => a.code.localeCompare(b.code) || (a.branchKey ?? '').localeCompare(b.branchKey ?? ''))
  }
}

/** Maps analytics completeness reason codes to limitation codes (unknown codes are not invented into limitations). */
export function limitationFromReason(reason: string): LimitationCode | null {
  switch (reason) {
    case 'missing_z':
      return 'missing_z'
    case 'missing_transaction_count':
      return 'missing_transaction_count'
    case 'missing_product_detail':
    case 'missing_category_detail':
      return 'missing_product_detail'
    case 'xz_line_semantics_unknown':
    case 'z_line_semantics_unverified':
    case 'line_semantics_unverified':
      return 'line_semantics_unverified'
    case 'missing_cost':
      return 'missing_cost'
    case 'missing_context':
      return 'missing_context'
    case 'legacy_source_limitation':
      return 'legacy_source_limitation'
    case 'week_in_progress':
      return 'incomplete_week'
    case 'insufficient_sample':
      return 'insufficient_sample'
    default:
      return null
  }
}

export const mondayToSunday = (weekStart: string): string[] => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i))
