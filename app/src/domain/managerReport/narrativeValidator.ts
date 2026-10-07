import { dateTr } from './format'
import type { EvidenceEntry, FactPack, LimitationCode, Narrative, NarrativeLimitation, NarrativeSection } from './types'
import { NARRATIVE_SCHEMA_VERSION } from './types'

/**
 * Narrative policy + validator (Layer B). It checks ANY narrative (the deterministic renderer's output and, later, an AI's) against the
 * Fact Pack it claims to describe. Everything here is provable from the pack:
 *
 *  - schema/versions and report type
 *  - every cited evidence id exists in the pack's registry (unknown ids are rejected)
 *  - every number written in a section is a value of the evidence THAT SECTION cites (no invented or uncited numbers)
 *  - no causal language anywhere (hypotheses are excluded from V1 entirely, so a "because" can never be a supported statement)
 *  - a metric the pack marks unsupported is not described as if it were available
 *  - partial/provisional evidence must be worded as partial; relationship evidence must be worded as an association
 *  - every limitation of the pack is propagated into the narrative
 */

export type NarrativeIssueCode =
  | 'not_an_object'
  | 'bad_shape'
  | 'schema_version'
  | 'report_type_mismatch'
  | 'unknown_evidence'
  | 'unsupported_number'
  | 'causal_language'
  | 'hypothesis_section'
  | 'unsupported_metric_claim'
  | 'partial_stated_as_final'
  | 'relationship_not_marked'
  | 'missing_limitation'
  | 'missing_section'
  | 'live_stated_as_historical'
  | 'too_long'

export interface NarrativeIssue {
  code: NarrativeIssueCode
  section?: string
  detail?: string
}

export type NarrativeValidation = { ok: true; narrative: Narrative } | { ok: false; issues: NarrativeIssue[] }

/** Sections every narrative must contain (a section without supported facts says so; it is never silently dropped). */
export const REQUIRED_SECTIONS: Record<'daily' | 'weekly', readonly string[]> = {
  daily: ['result', 'attention', 'operations', 'inventory', 'procurement', 'weather'],
  weekly: ['summary', 'performance', 'issues', 'inventory', 'procurement', 'weather', 'quality'],
}

export const MAX_SECTION_TEXT = 1800
export const MAX_SECTIONS = 12

// "neden-sonuç" appears in the mandatory "this is an association, not a cause" disclaimer and is therefore not causal wording.
const CAUSAL = /(\bbecause\b|\bcaused?\b|\bdue to\b|\bleads? to\b|nedeniyle|nedenlerle|yüzünden|sebebiyle|sebebiyle|sebep oldu|neden oldu|yol açtı|çünkü|kaynaklan|sayesinde|etkisiyle|dolayısıyla)/i
const NUMBER_TOKEN = /\d[\d.,]*/g
const ISO_DATE = /\d{4}-\d{2}-\d{2}/g
const PARTIAL_MARKER = /(kısmi|geçici|kesinleşmedi|şu ana kadar|yalnızca|verisi olan|eksik|hesaplanamad|sürüyor|henüz|tahmin|bekle|güncel değil|eski)/i
/** wording that presents a value as an archived / immutable / exactly reproducible historical fact */
const PINNED_CLAIM = /(değişmez|sabitlenmiş|arşivlenmiş|kesinleşmiş geçmiş kayıt|yeniden üretilebilir|birebir üretilebilir|immutable|archived)/i
const RELATIONSHIP_MARKER = /ilişki/i
const DISCLOSURE = /(desteklen|yapılmadı|hesaplanam|okunamad|yok\b|eksik|mevcut değil|alınamıyor)/i

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function parseNumberToken(token: string): number | null {
  let t = token.replace(/[.,]+$/, '')
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Every calendar date and branch name the pack mentions: they are not "numbers" even though they contain digits. */
function knownLiterals(pack: FactPack): string[] {
  const dates = new Set<string>()
  const add = (d: string | null | undefined) => d && /^\d{4}-\d{2}-\d{2}$/.test(d) && dates.add(d)
  if (pack.reportType === 'daily') add(pack.businessDate)
  else {
    add(pack.weekStart)
    add(pack.weekEnd)
    for (const d of pack.organization.dailySeries) add(d.date)
    for (const b of pack.branches) for (const d of b.days) add(d.date)
    for (const r of pack.recurrence.items) r.dates.forEach(add)
    for (const w of pack.weather.historical) add(w.date)
  }
  for (const key of Object.keys(pack.evidence)) for (const m of key.match(ISO_DATE) ?? []) add(m)
  const out: string[] = []
  for (const d of dates) out.push(dateTr(d), d)
  for (const b of pack.scope.branches) out.push(b.name)
  // longest first so a branch name containing a date-like token is removed whole
  return out.sort((a, b) => b.length - a.length)
}

function numbersIn(text: string, literals: readonly string[]): number[] {
  let t = text
  for (const l of literals) if (l) t = t.split(l).join(' ')
  return (t.match(NUMBER_TOKEN) ?? []).map(parseNumberToken).filter((n): n is number => n !== null)
}

const allowedFrom = (entries: readonly EvidenceEntry[]): number[] => entries.flatMap((e) => (typeof e.value === 'number' ? [e.value, Math.abs(e.value)] : []))
const matches = (n: number, allowed: readonly number[]) => allowed.some((a) => Math.abs(a - n) < 0.0051)

interface MetricGuard {
  label: string
  term: RegExp
  supported: boolean
}

function metricGuards(pack: FactPack): MetricGuard[] {
  const o = pack.organization
  const guards: MetricGuard[] = [
    { label: 'transactions', term: /işlem sayısı/i, supported: o.transactions.support !== 'unsupported' },
    { label: 'averageBasket', term: /ortalama sepet/i, supported: o.averageBasket.support !== 'unsupported' },
    { label: 'grossProfit', term: /brüt kâr/i, supported: o.grossProfit.support !== 'unsupported' },
  ]
  guards.push({ label: 'wasteCost', term: /fire maliyet/i, supported: pack.inventory.wasteCost.support !== 'unsupported' })
  if (pack.reportType === 'weekly') {
    guards.push({ label: 'previousWeek', term: /önceki haftaya göre/i, supported: pack.organization.vsPreviousWeek.support !== 'unsupported' || pack.branches.some((b) => b.vsPreviousWeek.state === 'ok') })
  }
  return guards
}

export function validateNarrative(raw: unknown, pack: FactPack): NarrativeValidation {
  const issues: NarrativeIssue[] = []
  if (!isRecord(raw)) return { ok: false, issues: [{ code: 'not_an_object' }] }
  const { schemaVersion, reportType, headline, executiveSummary, sections, limitations, generatedAt } = raw
  if (
    typeof headline !== 'string' ||
    typeof executiveSummary !== 'string' ||
    typeof generatedAt !== 'string' ||
    !Array.isArray(sections) ||
    !Array.isArray(limitations)
  ) {
    return { ok: false, issues: [{ code: 'bad_shape', detail: 'headline, executiveSummary, sections, limitations and generatedAt are required' }] }
  }
  if (schemaVersion !== NARRATIVE_SCHEMA_VERSION) issues.push({ code: 'schema_version', detail: String(schemaVersion) })
  if (reportType !== pack.reportType) issues.push({ code: 'report_type_mismatch', detail: String(reportType) })
  if (sections.length > MAX_SECTIONS) issues.push({ code: 'too_long', detail: 'too many sections' })

  const literals = knownLiterals(pack)
  const allEvidence = Object.values(pack.evidence)
  const allNumbers = allowedFrom(allEvidence)
  const guards = metricGuards(pack)
  const parsedSections: NarrativeSection[] = []

  const checkCausal = (text: string, section?: string) => {
    if (CAUSAL.test(text.replace(/neden-sonuç/gi, ' '))) issues.push({ code: 'causal_language', section })
  }
  const checkMetricClaims = (text: string, section?: string) => {
    // sentence by sentence: an unsupported metric may only be mentioned together with a disclosure that it is not available
    for (const sentence of text.split(/[.\n]/)) {
      for (const g of guards) {
        if (!g.supported && g.term.test(sentence) && !DISCLOSURE.test(sentence)) issues.push({ code: 'unsupported_metric_claim', section, detail: g.label })
      }
    }
  }

  // headline + summary: free numbers must still be values of the pack (it cites no refs of its own)
  for (const [name, text] of [['headline', headline], ['executiveSummary', executiveSummary]] as const) {
    if (text.length > MAX_SECTION_TEXT) issues.push({ code: 'too_long', section: name })
    for (const n of numbersIn(text, literals)) if (!matches(n, allNumbers)) issues.push({ code: 'unsupported_number', section: name, detail: String(n) })
    checkCausal(text, name)
    checkMetricClaims(text, name)
    // a report that is live or only partially reproducible can not claim to be an exact, immutable historical fact
    if (pack.reproducibility.state !== 'exact' && PINNED_CLAIM.test(text)) issues.push({ code: 'live_stated_as_historical', section: name })
  }

  for (const s of sections) {
    if (!isRecord(s) || typeof s.code !== 'string' || typeof s.title !== 'string' || typeof s.body !== 'string' || !Array.isArray(s.evidenceRefs) || !s.evidenceRefs.every((r) => typeof r === 'string')) {
      issues.push({ code: 'bad_shape', detail: 'section needs code, title, body, evidenceRefs' })
      continue
    }
    const refs = s.evidenceRefs as string[]
    const code = s.code
    if (/hipotez|hypothesis/i.test(code) || /hipotez|hypothesis/i.test(s.title)) issues.push({ code: 'hypothesis_section', section: code })
    if (s.body.length > MAX_SECTION_TEXT) issues.push({ code: 'too_long', section: code })
    const cited: EvidenceEntry[] = []
    for (const r of refs) {
      const e = pack.evidence[r]
      if (!e) issues.push({ code: 'unknown_evidence', section: code, detail: r })
      else cited.push(e)
    }
    const allowed = allowedFrom(cited)
    for (const n of numbersIn(s.body, literals)) if (!matches(n, allowed)) issues.push({ code: 'unsupported_number', section: code, detail: String(n) })
    checkCausal(s.body, code)
    checkCausal(s.title, code)
    checkMetricClaims(s.body, code)
    // evidence from a live or mutable source must not be promoted into wording that implies an immutable historical fact
    if ((cited.some((e) => e.origin !== 'immutable') || pack.reproducibility.state !== 'exact') && PINNED_CLAIM.test(s.body)) issues.push({ code: 'live_stated_as_historical', section: code })
    if (cited.some((e) => e.support === 'partial') && !PARTIAL_MARKER.test(s.body)) issues.push({ code: 'partial_stated_as_final', section: code })
    if (cited.some((e) => e.kind === 'relationship') && !RELATIONSHIP_MARKER.test(s.body)) issues.push({ code: 'relationship_not_marked', section: code })
    parsedSections.push({ code, title: s.title, body: s.body, evidenceRefs: refs })
  }

  const parsedLimitations: NarrativeLimitation[] = []
  for (const l of limitations) {
    if (!isRecord(l) || typeof l.code !== 'string' || typeof l.text !== 'string') {
      issues.push({ code: 'bad_shape', detail: 'limitation needs code and text' })
      continue
    }
    checkCausal(l.text, 'limitations')
    parsedLimitations.push({ code: l.code as LimitationCode, text: l.text })
  }
  const haveSections = new Set(parsedSections.map((s) => s.code))
  for (const code of REQUIRED_SECTIONS[pack.reportType]) if (!haveSections.has(code)) issues.push({ code: 'missing_section', section: code })
  const present = new Set(parsedLimitations.map((l) => l.code))
  for (const code of new Set(pack.limitations.map((l) => l.code))) {
    if (!present.has(code)) issues.push({ code: 'missing_limitation', detail: code })
  }

  if (issues.length > 0) return { ok: false, issues }
  return {
    ok: true,
    narrative: { schemaVersion: NARRATIVE_SCHEMA_VERSION, reportType: pack.reportType, headline, executiveSummary, sections: parsedSections, limitations: parsedLimitations, generatedAt },
  }
}
