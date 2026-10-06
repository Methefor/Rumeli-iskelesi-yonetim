import type { Confidence, WeeklyAnalyticsPayload } from './types'

/**
 * AI report contract. The model is an INTERPRETER of facts the deterministic
 * engine already computed; it never calculates and never invents a number:
 *
 *  - input  : `buildAiInput` flattens a weekly snapshot into a `facts` index
 *             (metric path -> value + kind + SUPPORT) plus the per-metric support/completeness
 *             states and the limitation reason codes. Unsupported metrics are NOT in the index.
 *  - output : strict JSON. Every claim cites evidence entries that must exist in
 *             the index with exactly the cited value; every number written in the
 *             text must be a number from the index; a `fact` claim may only rest on
 *             fact evidence with COMPLETE support (never provisional, partial or
 *             unverified data); causal wording is reserved for `hypothesis`.
 *  - failure: `generateAiReport` never throws. Any model error, timeout, bad JSON
 *             or contract violation becomes a result object, so the analytics
 *             dashboard keeps working without a report.
 */

export const AI_CONTRACT_VERSION = 2
export const MAX_CLAIMS = 12
export const MAX_TEXT = 400

export type FactKind = 'fact' | 'relationship'
export type FactSupport = 'complete' | 'partial'
export type FactValue = number | string | boolean

export interface AiFact {
  value: FactValue
  kind: FactKind
  /** complete = final, supported data; partial = provisional / unverified / incomplete data. */
  support: FactSupport
}

export interface AiMetricSupport {
  status: 'complete' | 'partial' | 'unsupported'
  reasons: string[]
}

export interface AiInput {
  contractVersion: typeof AI_CONTRACT_VERSION
  task: 'weekly_interpretation'
  weekStart: string
  weekEnd: string
  weekComplete: boolean
  /** finalized only when the week has ended and no day is provisional (X only). */
  finalization: 'finalized' | 'provisional'
  /** current = the snapshot reflects the latest source data; stale = newer source data exists. */
  snapshotState: 'current' | 'stale'
  origin: string
  language: 'tr'
  /** Only these values may be cited or mentioned. */
  facts: Record<string, AiFact>
  /** Per-metric support / completeness state (complete | partial | unsupported) with reason codes. */
  support: Record<string, AiMetricSupport>
  /** Distinct limitation reason codes (missing_z, missing_cost, legacy_source_limitation, ...). */
  limitations: string[]
  /** Metrics that cannot be computed from the source: the model must not speculate about them. */
  unsupported: string[]
  rules: string[]
}

export interface AiClaim {
  id: string
  confidence: Confidence
  text: string
  evidence: Array<{ metric: string; value: FactValue }>
}

export interface AiOutput {
  summary: string
  claims: AiClaim[]
  limitations: string[]
}

export const AI_RULES: readonly string[] = [
  'Use only the values in `facts`. Never calculate, estimate, round differently or invent a number.',
  'Every claim must cite evidence: { metric, value } copied exactly from `facts`.',
  'confidence=fact: only for evidence with kind fact AND support complete. Provisional, partial or unverified data (support partial) is never a fact.',
  'confidence=relationship: statistical association (kind relationship). confidence=hypothesis: a possible explanation, never presented as established.',
  'Causal wording (because, caused, due to) is allowed only in hypothesis claims.',
  'Read `support` and `limitations` first: say plainly when a metric is partial or when the week is not final. Never describe an unsupported or partial product/category trend as a fact.',
  'Do not discuss anything listed in `unsupported`. Do not mention net profit: gross profit excludes overhead.',
  'Reply with the JSON object only.',
]

export const AI_SYSTEM_PROMPT = [
  'You interpret a weekly sales analytics snapshot for a cafe/ice-cream business owner.',
  'You receive structured JSON facts that were calculated deterministically. You do not calculate anything.',
  ...AI_RULES,
  'Output schema: { "summary": string, "claims": [{ "id": string, "confidence": "fact"|"relationship"|"hypothesis", "text": string, "evidence": [{ "metric": string, "value": number|string|boolean }] }], "limitations": string[] }.',
].join('\n')

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const METRIC_OF = (key: string): string => {
  if (key.startsWith('volume.transactions') || key.startsWith('vsPreviousWeek.transactions')) return 'transactions'
  if (key.startsWith('financial.averageBasket') || key.startsWith('vsPreviousWeek.averageBasket')) return 'averageBasket'
  if (key.startsWith('financial.grossProfit')) return 'grossProfit'
  if (key.startsWith('category.') || key.startsWith('volume.itemQuantity')) return 'categories'
  if (key.startsWith('product.')) return 'products'
  if (key.startsWith('weather.')) return 'context'
  return 'revenue'
}

const COMPARISONS = ['pct', 'delta', 'baseline'] as const

/** Flattens a (non-redacted) weekly payload into the fact index the model may use. */
export function buildAiInput(weekly: WeeklyAnalyticsPayload, snapshotState: 'current' | 'stale' = 'current'): AiInput {
  if (weekly.redacted || !weekly.financial) throw new Error('a redacted analytics payload cannot be interpreted')
  const metrics = weekly.completeness.metrics
  const f: Record<string, AiFact> = {}
  const unsupportedMetrics = new Set(Object.entries(metrics).filter(([, c]) => c.status === 'unsupported').map(([k]) => k))

  const put = (key: string, v: unknown, kind: FactKind = 'fact', forceSupport?: FactSupport): void => {
    const metricKey = METRIC_OF(key)
    // a metric the source cannot support contributes NO fact at all
    if (unsupportedMetrics.has(metricKey) && metricKey !== 'revenue') return
    const status = metrics[metricKey]?.status
    const support: FactSupport = forceSupport ?? (status === 'complete' ? 'complete' : 'partial')
    if (typeof v === 'number' && Number.isFinite(v)) f[key] = { value: v, kind, support }
    else if (typeof v === 'string' || typeof v === 'boolean') f[key] = { value: v, kind, support }
  }

  put('finalization', weekly.finalization, 'fact', 'complete')
  put('daysWithData', weekly.daysWithData, 'fact', 'complete')
  put('finalizedDays', weekly.finalizedDays, 'fact', 'complete')
  put('provisionalDays', weekly.provisionalDays, 'fact', 'complete')
  put('provisionalRevenue', weekly.financial.provisionalRevenue, 'fact', 'partial')
  put('financial.grossRevenue', weekly.financial.grossRevenue.value)
  put('financial.grossRevenue.state', weekly.financial.grossRevenue.state, 'fact', 'complete')
  put('volume.transactions', weekly.volume.transactions.value)
  put('volume.transactions.state', weekly.volume.transactions.state, 'fact', 'complete')
  put('financial.averageBasket', weekly.financial.averageBasket.value)
  put('financial.averageBasket.state', weekly.financial.averageBasket.state, 'fact', 'complete')
  put('financial.grossProfit.state', weekly.financial.grossProfit.metric.state, 'fact', 'complete')
  put('financial.grossProfit', weekly.financial.grossProfit.metric.value)
  put('financial.grossProfit.coveredRevenue', weekly.financial.grossProfit.coveredRevenue)

  const cmp = (prefix: string, c: { state: string } & Partial<Record<(typeof COMPARISONS)[number], number>>) => {
    put(`${prefix}.state`, c.state, 'fact', 'complete')
    for (const k of COMPARISONS) put(`${prefix}.${k}`, c[k])
  }
  cmp('vsPreviousWeek.grossRevenue', weekly.financialComparisons.grossRevenue)
  cmp('vsPreviousWeek.averageBasket', weekly.financialComparisons.averageBasket)
  cmp('vsPreviousWeek.transactions', weekly.volumeComparisons.transactions)

  weekly.days.forEach((d) => {
    if (!d.hasData) return
    if (d.finalization === 'finalized') {
      put(`day.${d.date}.grossRevenue`, d.grossRevenue, 'fact', 'complete')
      put(`day.${d.date}.transactions`, d.transactions, 'fact', d.transactions === null ? 'partial' : metrics.transactions?.status === 'complete' ? 'complete' : 'partial')
    } else {
      put(`provisionalDay.${d.date}.xRevenue`, d.provisionalRevenue, 'fact', 'partial')
    }
  })
  weekly.financial.categories.forEach((c) => {
    put(`category.${c.key}.revenue`, c.revenue)
    put(`category.${c.key}.share`, c.share)
  })
  weekly.financial.products.slice(0, 10).forEach((p) => {
    put(`product.${p.code}.revenue`, p.revenue)
    put(`product.${p.code}.quantity`, p.quantity)
  })

  const w = weekly.weatherEffect
  put('weather.state', w.state, 'relationship', 'complete')
  if (w.state === 'ok') {
    put('weather.sample', w.sample, 'relationship', 'complete')
    put('weather.temperatureCorrelation.r', w.temperatureCorrelation?.r, 'relationship', 'complete')
    if (w.rainEffect && 'rainyIndex' in w.rainEffect) {
      put('weather.rain.rainyDays', w.rainEffect.rainyDays, 'relationship', 'complete')
      put('weather.rain.dryDays', w.rainEffect.dryDays, 'relationship', 'complete')
      put('weather.rain.differencePct', w.rainEffect.differencePct, 'relationship', 'complete')
    }
  }

  const support = Object.fromEntries(Object.entries(metrics).map(([k, c]) => [k, { status: c.status, reasons: [...c.reasons] }]))
  const limitations = [...new Set([...weekly.completeness.reasons, ...(snapshotState === 'stale' ? ['snapshot_stale'] : [])])].sort()

  return {
    contractVersion: AI_CONTRACT_VERSION,
    task: 'weekly_interpretation',
    weekStart: weekly.weekStart,
    weekEnd: weekly.weekEnd,
    weekComplete: weekly.weekComplete,
    finalization: weekly.finalization,
    snapshotState,
    origin: weekly.origin,
    language: 'tr',
    facts: f,
    support,
    limitations,
    unsupported: ['peakHour: no hourly data in the source', ...[...unsupportedMetrics].map((m) => `${m}: ${metrics[m]?.reasons.join(', ') ?? 'unsupported'}`)],
    rules: [...AI_RULES],
  }
}

// ---------------------------------------------------------------------------
// Output validation
// ---------------------------------------------------------------------------

export type ValidationIssueCode =
  | 'not_an_object'
  | 'bad_shape'
  | 'too_many_claims'
  | 'text_too_long'
  | 'duplicate_claim_id'
  | 'bad_confidence'
  | 'missing_evidence'
  | 'unknown_metric'
  | 'evidence_value_mismatch'
  | 'fact_claim_on_relationship_evidence'
  | 'fact_claim_on_incomplete_evidence'
  | 'invented_number'
  | 'causal_language_without_hypothesis'

export interface ValidationIssue {
  code: ValidationIssueCode
  claimId?: string
  detail?: string
}

export type ValidationResult = { ok: true; output: AiOutput } | { ok: false; issues: ValidationIssue[] }

const CAUSAL = /(\bbecause\b|\bcaused?\b|\bdue to\b|nedeniyle|yüzünden|sebebiyle|sebep oldu|çünkü|kaynaklan|neden oldu)/i
const NUMBER_TOKEN = /\d[\d.,]*/g
const ISO_DATE = /\d{4}-\d{2}-\d{2}/g

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Numbers that may appear in free text: every numeric fact value (and its absolute value, for "x% lower"). */
function allowedNumbers(input: AiInput): number[] {
  const out: number[] = []
  for (const fact of Object.values(input.facts)) {
    if (typeof fact.value === 'number') out.push(fact.value, Math.abs(fact.value))
  }
  return out
}

function parseNumberToken(token: string): number | null {
  // Turkish text may write 1.234,5 or 1234,5; JSON numbers use a dot.
  let t = token.replace(/[.,]+$/, '')
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function numbersInText(text: string, input: AiInput): number[] {
  const knownDates = new Set<string>([input.weekStart, input.weekEnd])
  for (const key of Object.keys(input.facts)) {
    const m = /^(?:day|provisionalDay)\.(\d{4}-\d{2}-\d{2})\./.exec(key)
    if (m?.[1]) knownDates.add(m[1])
  }
  // dates that exist in the input are not "numbers"; any other date-like token stays and fails the check
  const stripped = text.replace(ISO_DATE, (d) => (knownDates.has(d) ? ' ' : d))
  const tokens = stripped.match(NUMBER_TOKEN) ?? []
  return tokens.map(parseNumberToken).filter((n): n is number => n !== null)
}

export function validateAiOutput(raw: unknown, input: AiInput): ValidationResult {
  const issues: ValidationIssue[] = []
  if (!isRecord(raw)) return { ok: false, issues: [{ code: 'not_an_object' }] }
  const { summary, claims, limitations } = raw
  if (typeof summary !== 'string' || !Array.isArray(claims) || !Array.isArray(limitations) || !limitations.every((l) => typeof l === 'string')) {
    return { ok: false, issues: [{ code: 'bad_shape', detail: 'summary, claims and limitations are required' }] }
  }
  if (claims.length > MAX_CLAIMS) issues.push({ code: 'too_many_claims' })
  const allowed = allowedNumbers(input)
  const isAllowed = (n: number) => allowed.some((a) => Math.abs(a - n) < 0.0051)
  const checkText = (text: string, claimId: string | undefined) => {
    if (text.length > MAX_TEXT) issues.push({ code: 'text_too_long', claimId })
    for (const n of numbersInText(text, input)) {
      if (!isAllowed(n)) issues.push({ code: 'invented_number', claimId, detail: String(n) })
    }
  }
  checkText(summary, undefined)
  limitations.forEach((l) => checkText(l, undefined))

  const seen = new Set<string>()
  const parsed: AiClaim[] = []
  for (const c of claims) {
    if (!isRecord(c) || typeof c.id !== 'string' || typeof c.text !== 'string' || !Array.isArray(c.evidence)) {
      issues.push({ code: 'bad_shape', detail: 'claim needs id, text, evidence' })
      continue
    }
    const id = c.id
    if (seen.has(id)) issues.push({ code: 'duplicate_claim_id', claimId: id })
    seen.add(id)
    if (c.confidence !== 'fact' && c.confidence !== 'relationship' && c.confidence !== 'hypothesis') {
      issues.push({ code: 'bad_confidence', claimId: id })
      continue
    }
    const confidence = c.confidence as Confidence
    if (c.evidence.length === 0) issues.push({ code: 'missing_evidence', claimId: id })
    const evidence: AiClaim['evidence'] = []
    for (const e of c.evidence) {
      if (!isRecord(e) || typeof e.metric !== 'string') {
        issues.push({ code: 'bad_shape', claimId: id, detail: 'evidence needs metric and value' })
        continue
      }
      const fact = input.facts[e.metric]
      if (!fact) {
        issues.push({ code: 'unknown_metric', claimId: id, detail: e.metric })
        continue
      }
      if (e.value !== fact.value) issues.push({ code: 'evidence_value_mismatch', claimId: id, detail: e.metric })
      if (confidence === 'fact' && fact.kind !== 'fact') issues.push({ code: 'fact_claim_on_relationship_evidence', claimId: id, detail: e.metric })
      if (confidence === 'fact' && fact.support !== 'complete') issues.push({ code: 'fact_claim_on_incomplete_evidence', claimId: id, detail: e.metric })
      evidence.push({ metric: e.metric, value: e.value as FactValue })
    }
    checkText(c.text, id)
    if (confidence !== 'hypothesis' && CAUSAL.test(c.text)) issues.push({ code: 'causal_language_without_hypothesis', claimId: id })
    parsed.push({ id, confidence, text: c.text, evidence })
  }
  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, output: { summary, claims: parsed, limitations: limitations as string[] } }
}

// ---------------------------------------------------------------------------
// Safe generation
// ---------------------------------------------------------------------------

export type AiReportResult =
  | { status: 'generated'; output: AiOutput; model: string | null }
  | { status: 'ai_unavailable'; errorCode: 'ai_unavailable' | 'ai_timeout' | 'ai_bad_json' }
  | { status: 'invalid'; errorCode: 'contract_violation'; issues: ValidationIssue[] }

export interface ModelCall {
  (input: AiInput, systemPrompt: string): Promise<{ text: string; model?: string }>
}

/**
 * Runs the model and validates its answer. NEVER throws: the analytics UI renders
 * snapshots from the database regardless of what happens here.
 */
export async function generateAiReport(input: AiInput, callModel: ModelCall, timeoutMs = 20_000): Promise<AiReportResult> {
  let reply: { text: string; model?: string }
  try {
    reply = await Promise.race([
      callModel(input, AI_SYSTEM_PROMPT),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ])
  } catch (error) {
    return { status: 'ai_unavailable', errorCode: error instanceof Error && error.message === 'timeout' ? 'ai_timeout' : 'ai_unavailable' }
  }
  let json: unknown
  try {
    json = JSON.parse(reply.text)
  } catch {
    return { status: 'ai_unavailable', errorCode: 'ai_bad_json' }
  }
  const verdict = validateAiOutput(json, input)
  if (!verdict.ok) return { status: 'invalid', errorCode: 'contract_violation', issues: verdict.issues }
  return { status: 'generated', output: verdict.output, model: reply.model ?? null }
}
