import { renderDailyNarrative } from './renderDaily'
import { renderWeeklyNarrative } from './renderWeekly'
import { validateNarrative, type NarrativeIssue } from './narrativeValidator'
import type { DailyFactPack, FactPack, Narrative, ReproducibilityState, WeeklyFactPack } from './types'
import { NARRATIVE_SCHEMA_VERSION } from './types'

/**
 * AI CONTRACT ONLY (Phase 1E). No provider, key, model or Edge Function exists in this repository: this module defines what an AI
 * would receive, what it must return, and the deterministic post-validation + fallback. The deterministic renderer is always
 * available, so the Command Center / reports never depend on AI.
 *
 *  input   a SANITIZED Fact Pack only (no database credentials, no raw rows, no ids, no personal data) + the allowed evidence ids
 *  output  a `manager_narrative.v1` object; every number must come from the evidence its section cites
 *  gate    `validateNarrative` (unknown ids, unsupported numbers, causal language, unsupported metrics, missing limitations, ...)
 *  failure any model error, timeout, bad JSON or contract violation falls back to the deterministic narrative
 */

export const NARRATIVE_AI_CONTRACT_VERSION = 'manager_narrative_contract.v1' as const

export const NARRATIVE_AI_RULES: readonly string[] = [
  'Use only the facts in `factPack`. Never calculate, estimate, round differently or invent a number.',
  'Every section must list `evidenceRefs` copied exactly from `allowedEvidenceRefs`; every number you write must be a value of the evidence that section cites.',
  'Finalized revenue is the Z report exactly. A provisional (X-only) value is never finalized revenue and is never added to it.',
  'A metric whose support is "unsupported" has no value: say it is unavailable, never guess it. A partial value must be worded as partial.',
  'A relationship is an association seen in past data. Never write causal wording (because, caused, due to, nedeniyle, yüzünden, çünkü).',
  'Do not write hypotheses, forecasts of sales, staffing advice, purchase quantities or weather-to-sales predictions.',
  'Weather: forecast values are forecasts; historical context is modelled (reanalysis) data and not a direct measurement.',
  'Copy every limitation of `factPack.limitations` into `limitations` (same `code`); never drop one.',
  'Evidence whose origin is `live` or `mutable` (and any pack whose reproducibility is not `exact`) must never be worded as an immutable, archived or exactly reproducible historical fact.',
  'Reply with the JSON object only, in Turkish.',
]

export interface NarrativeAiInput {
  contractVersion: typeof NARRATIVE_AI_CONTRACT_VERSION
  task: 'manager_report_narrative'
  language: 'tr'
  outputSchemaVersion: typeof NARRATIVE_SCHEMA_VERSION
  factPack: unknown
  allowedEvidenceRefs: string[]
  rules: readonly string[]
}

/** Removes everything an AI does not need: internal ids. Branch KEYS and names remain (they are labels, not identifiers of people). */
export function sanitizeFactPack(pack: FactPack): FactPack {
  const copy = JSON.parse(JSON.stringify(pack)) as FactPack
  copy.scope.branches = copy.scope.branches.map((b) => ({ id: '', key: b.key, name: b.name }))
  copy.provenance.snapshots = copy.provenance.snapshots.map((s) => ({ ...s, snapshotId: '' }))
  return copy
}

export function buildNarrativeAiInput(pack: FactPack): NarrativeAiInput {
  return {
    contractVersion: NARRATIVE_AI_CONTRACT_VERSION,
    task: 'manager_report_narrative',
    language: 'tr',
    outputSchemaVersion: NARRATIVE_SCHEMA_VERSION,
    factPack: sanitizeFactPack(pack),
    allowedEvidenceRefs: Object.keys(pack.evidence).sort(),
    rules: NARRATIVE_AI_RULES,
  }
}

/** Non-cryptographic, deterministic identifier of a Fact Pack's content (cyrb53): the "source fact pack id" of the runtime report metadata. */
export function factPackFingerprint(pack: FactPack): string {
  const canonical = (v: unknown): string =>
    Array.isArray(v)
      ? `[${v.map(canonical).join(',')}]`
      : v !== null && typeof v === 'object'
        ? `{${Object.keys(v as object)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
            .join(',')}}`
        : JSON.stringify(v)
  const text = canonical({ ...pack, generatedAt: undefined })
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `fp-${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)}`
}

export function renderNarrative(pack: FactPack): Narrative {
  return pack.reportType === 'daily' ? renderDailyNarrative(pack as DailyFactPack) : renderWeeklyNarrative(pack as WeeklyFactPack)
}

/**
 * Runtime REPORT METADATA of one generated narrative. It is NOT a persisted audit record: V1 stores no report snapshot, so this lives only in
 * the response of the generating call. A persisted narrative audit trail is deferred until `manager_report_snapshots` (or an equivalent store) exists.
 */
export interface ReportMetadata {
  reportType: 'daily' | 'weekly'
  scope: 'organization' | 'branch'
  branchKeys: string[]
  factSchemaVersion: string
  narrativeSchemaVersion: string
  sourceSnapshots: Array<{ kind: string; branchKey: string; version: number }>
  sourceFactPack: string
  generatedAt: string
  reproducibility: ReproducibilityState
  generator: 'deterministic_renderer' | 'ai'
  validation: 'passed' | 'failed' | 'not_applicable'
  /** only for AI narratives, filled by the (future) provider integration */
  ai: { provider: string; model: string | null; promptContractVersion: string } | null
}

export interface ResolvedNarrative {
  origin: 'deterministic' | 'ai'
  narrative: Narrative
  /** why an offered AI narrative was not used */
  fallbackReason: 'ai_unavailable' | 'ai_timeout' | 'ai_bad_json' | 'contract_violation' | null
  issues: NarrativeIssue[]
  metadata: ReportMetadata
}

function metadataFor(pack: FactPack, generator: ReportMetadata['generator'], validation: ReportMetadata['validation'], ai: ReportMetadata['ai']): ReportMetadata {
  return {
    reportType: pack.reportType,
    scope: pack.scope.kind,
    branchKeys: pack.scope.branches.map((b) => b.key),
    factSchemaVersion: pack.schemaVersion,
    narrativeSchemaVersion: NARRATIVE_SCHEMA_VERSION,
    sourceSnapshots: pack.provenance.snapshots.map((s) => ({ kind: s.kind, branchKey: s.branchKey, version: s.version })),
    sourceFactPack: factPackFingerprint(pack),
    generatedAt: pack.generatedAt,
    reproducibility: pack.reproducibility.state,
    generator,
    validation,
    ai,
  }
}

/**
 * Picks the narrative to show. A candidate (AI output) is used only if it passes the validator; otherwise the deterministic
 * renderer's text is used. NEVER throws.
 */
export function resolveNarrative(pack: FactPack, candidate?: { raw: unknown; ai: { provider: string; model: string | null } } | null): ResolvedNarrative {
  const fallback = (reason: ResolvedNarrative['fallbackReason'], issues: NarrativeIssue[]): ResolvedNarrative => {
    const narrative = renderNarrative(pack)
    return { origin: 'deterministic', narrative, fallbackReason: reason, issues, metadata: metadataFor(pack, 'deterministic_renderer', candidate ? 'failed' : 'not_applicable', null) }
  }
  if (!candidate) return fallback(null, [])
  const verdict = validateNarrative(candidate.raw, pack)
  if (!verdict.ok) return fallback('contract_violation', verdict.issues)
  return {
    origin: 'ai',
    narrative: verdict.narrative,
    fallbackReason: null,
    issues: [],
    metadata: metadataFor(pack, 'ai', 'passed', { provider: candidate.ai.provider, model: candidate.ai.model, promptContractVersion: NARRATIVE_AI_CONTRACT_VERSION }),
  }
}

export interface NarrativeModelCall {
  (input: NarrativeAiInput): Promise<{ text: string; provider: string; model?: string }>
}

/** Runs an injected model call and validates its answer; every failure becomes the deterministic narrative. NEVER throws. */
export async function generateNarrative(pack: FactPack, callModel: NarrativeModelCall, timeoutMs = 20_000): Promise<ResolvedNarrative> {
  let reply: { text: string; provider: string; model?: string }
  try {
    reply = await Promise.race([
      callModel(buildNarrativeAiInput(pack)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ])
  } catch (error) {
    const r = resolveNarrative(pack)
    return { ...r, fallbackReason: error instanceof Error && error.message === 'timeout' ? 'ai_timeout' : 'ai_unavailable', metadata: { ...r.metadata, validation: 'not_applicable' } }
  }
  let raw: unknown
  try {
    raw = JSON.parse(reply.text)
  } catch {
    const r = resolveNarrative(pack)
    return { ...r, fallbackReason: 'ai_bad_json' }
  }
  return resolveNarrative(pack, { raw, ai: { provider: reply.provider, model: reply.model ?? null } })
}
