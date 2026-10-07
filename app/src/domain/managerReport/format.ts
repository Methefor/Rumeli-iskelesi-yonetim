import type { EvidenceEntry, Fact, Limitation, Narrative, NarrativeLimitation, NarrativeSection } from './types'
import { NARRATIVE_SCHEMA_VERSION } from './types'

/**
 * Turkish formatting for the deterministic renderers. Every number is written with the SAME precision the Fact Pack stores it with
 * (money 2 decimals, percentages 1 decimal), so the narrative validator can prove each number in a text comes from the evidence.
 */

const money = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const one = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const two = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

export const tl = (n: number): string => `${money.format(n)} ₺`
export const count = (n: number): string => int.format(n)
export const pctAbs = (n: number): string => `%${one.format(Math.abs(n))}`
export const decimal2 = (n: number): string => two.format(n)
export const celsius = (n: number): string => `${one.format(n)}°C`

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

/** "7 Ekim 2026" (a calendar date, no timezone arithmetic) */
export function dateTr(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1] ?? ''} ${y}`
}

/** "7 Ekim 2026 Çarşamba" */
export function dateWithWeekdayTr(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  return `${dateTr(iso)} ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? ''}`
}

/** How an evidence value is shown in the "Dayanak" disclosure (same precision as the narrative text). */
export function evidenceText(e: EvidenceEntry): string {
  const v = e.value
  if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır'
  if (typeof v !== 'number') return String(v)
  switch (e.unit) {
    case 'TRY':
      return tl(v)
    case 'pct':
      return `%${one.format(v)}`
    case 'celsius':
      return celsius(v)
    case 'ratio':
      return decimal2(v)
    case 'mm':
      return `${one.format(v)} mm`
    default:
      return count(v)
  }
}

export const directionTr = (pct: number): 'artış' | 'düşüş' | 'değişim yok' => (pct > 0 ? 'artış' : pct < 0 ? 'düşüş' : 'değişim yok')

/** Collects the lines and the evidence refs of one narrative section. */
export class SectionBuilder {
  private readonly lines: string[] = []
  private readonly refs = new Set<string>()

  readonly code: string
  readonly title: string

  constructor(code: string, title: string) {
    this.code = code
    this.title = title
  }

  line(text: string, ...refs: Array<string | null | undefined>): this {
    this.lines.push(text)
    for (const r of refs) if (r) this.refs.add(r)
    return this
  }

  get isEmpty(): boolean {
    return this.lines.length === 0
  }

  build(): NarrativeSection {
    return { code: this.code, title: this.title, body: this.lines.join('\n'), evidenceRefs: [...this.refs] }
  }
}

export const refOf = (f: Fact): string | null => f.ref

export function narrativeLimitations(list: readonly Limitation[]): NarrativeLimitation[] {
  const seen = new Set<string>()
  const out: NarrativeLimitation[] = []
  for (const l of list) {
    const text = l.branchName ? `${l.branchName}: ${l.text}` : l.text
    const key = `${l.code}:${text}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ code: l.code, text })
  }
  return out
}

export function assemble(
  reportType: Narrative['reportType'],
  headline: string,
  executiveSummary: string,
  sections: NarrativeSection[],
  limitations: Limitation[],
  generatedAt: string,
): Narrative {
  return { schemaVersion: NARRATIVE_SCHEMA_VERSION, reportType, headline, executiveSummary, sections, limitations: narrativeLimitations(limitations), generatedAt }
}
