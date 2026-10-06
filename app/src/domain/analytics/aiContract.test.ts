import { describe, expect, it } from 'vitest'
import { AI_SYSTEM_PROMPT, buildAiInput, generateAiReport, validateAiOutput, type AiInput } from './aiContract'
import { buildWeeklyAnalytics, computeDay, redactAnalytics, type AnalyticsReportFact, type DayFacts } from './engine'

let seq = 0
function rep(type: 'X' | 'Z', revenue: number, tx: number | null, opts: { legacy?: boolean; lines?: AnalyticsReportFact['lines'] } = {}): AnalyticsReportFact {
  seq += 1
  return {
    id: `r-${seq}`,
    shiftId: type === 'X' ? 'morning' : 'evening',
    reportType: type,
    status: 'submitted',
    grossRevenue: revenue,
    transactionCount: tx,
    reconciliationStatus: 'OK',
    submittedAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
    isLegacy: opts.legacy ?? false,
    lines: opts.lines ?? [],
  }
}
const productLine = { categoryId: 'cat-gida', categoryKey: 'gida', categoryName: 'Gıda', amount: 150, quantity: null, inventoryItemId: 'P1', inventoryQuantity: 3 }
const day = (date: string, reports: AnalyticsReportFact[]): DayFacts => ({
  date,
  reports,
  products: [{ id: 'P1', code: 'P1', name: 'P1', unit: 'kg' }],
  unitCosts: { P1: 20 },
})

function weekly(facts: Record<string, DayFacts>, today = '2026-10-06') {
  return buildWeeklyAnalytics({
    branchId: 'branch-secret-id',
    weekStart: '2026-09-28',
    today,
    dayFor: (d) => computeDay(facts[d] ?? day(d, [])),
    weatherDays: [],
    sourceLatestAt: null,
  })
}

// a finalized week: Z-only days; 09-29 carries a product line (partial detail), 09-30 has both X and Z (unsupported detail)
const finalFacts: Record<string, DayFacts> = {
  '2026-09-21': day('2026-09-21', [rep('Z', 1600, 32)]),
  '2026-09-28': day('2026-09-28', [rep('Z', 700, 14)]),
  '2026-09-29': day('2026-09-29', [rep('Z', 1000, 20, { lines: [productLine] })]),
  '2026-09-30': day('2026-09-30', [rep('X', 1000, 20, { lines: [productLine] }), rep('Z', 2200, 44, { lines: [productLine] })]),
}
const finalWeek = weekly(finalFacts)
const input: AiInput = buildAiInput(finalWeek)

// a week with an X-only (provisional) day
const provWeek = weekly({ ...finalFacts, '2026-10-01': day('2026-10-01', [rep('X', 500, 10)]) })
const provInput = buildAiInput(provWeek)

const good = {
  summary: 'Hafta cirosu 3900 oldu.',
  claims: [
    {
      id: 'c1',
      confidence: 'fact',
      text: 'Haftalık ciro 3900.',
      evidence: [{ metric: 'financial.grossRevenue', value: 3900 }],
    },
    {
      id: 'c2',
      confidence: 'hypothesis',
      text: 'Haftanın en iyi günü belki hafta sonu etkisiyle ilgilidir.',
      evidence: [{ metric: 'day.2026-09-30.grossRevenue', value: 2200 }],
    },
  ],
  limitations: ['Ürün detayı sınırlı.'],
}

describe('buildAiInput: support / completeness states', () => {
  it('exposes only structured facts: no branch id, no free text', () => {
    const json = JSON.stringify(input)
    expect(json).not.toContain('branch-secret-id')
    expect(input.facts['financial.grossRevenue']).toEqual({ value: 3900, kind: 'fact', support: 'complete' })
    expect(input.facts['day.2026-09-30.grossRevenue']).toEqual({ value: 2200, kind: 'fact', support: 'complete' })
    expect(input.facts['day.2026-10-01.grossRevenue']).toBeUndefined()
  })

  it('carries the per-metric support state and the limitation reasons', () => {
    expect(input.support.revenue).toEqual({ status: 'complete', reasons: [] })
    expect(input.support.hourly).toEqual({ status: 'unsupported', reasons: ['no_hourly_source'] })
    expect(input.finalization).toBe('finalized')
    expect(input.snapshotState).toBe('current')
    expect(input.limitations).toEqual(expect.arrayContaining(['no_hourly_source', 'missing_context']))
  })

  it('product facts from partial (unverified) detail are marked partial; unsupported metrics contribute NO fact', () => {
    // 09-29 has one Z reading with a product line -> partial; 09-30 has X and Z -> unsupported (not emitted)
    expect(input.facts['product.P1.revenue']).toEqual({ value: 150, kind: 'fact', support: 'partial' })
    const onlyBoth = weekly({ '2026-09-30': finalFacts['2026-09-30']! })
    const bothInput = buildAiInput(onlyBoth)
    expect(bothInput.support.products!.status).toBe('unsupported')
    expect(Object.keys(bothInput.facts).some((k) => k.startsWith('product.') || k.startsWith('category.') || k.startsWith('financial.grossProfit'))).toBe(false)
    expect(bothInput.unsupported.join(' ')).toContain('products: xz_line_semantics_unknown')
    expect(bothInput.facts['financial.grossRevenue']).toBeDefined()
  })

  it('a provisional week is declared as such and its X revenue is partial', () => {
    expect(provInput.finalization).toBe('provisional')
    expect(provInput.facts.finalization).toEqual({ value: 'provisional', kind: 'fact', support: 'complete' })
    expect(provInput.facts.provisionalDays).toEqual({ value: 1, kind: 'fact', support: 'complete' })
    expect(provInput.facts['provisionalDay.2026-10-01.xRevenue']).toEqual({ value: 500, kind: 'fact', support: 'partial' })
    expect(provInput.facts['financial.grossRevenue']!.support).toBe('partial')
    expect(provInput.limitations).toContain('missing_z')
  })

  it('a stale snapshot is announced', () => {
    expect(buildAiInput(finalWeek, 'stale').limitations).toContain('snapshot_stale')
    expect(buildAiInput(finalWeek, 'stale').snapshotState).toBe('stale')
  })

  it('refuses a redacted payload', () => {
    expect(() => buildAiInput(redactAnalytics(finalWeek))).toThrow()
  })

  it('states the contract rules to the model', () => {
    expect(AI_SYSTEM_PROMPT).toContain('Never calculate')
    expect(AI_SYSTEM_PROMPT).toContain('support complete')
    expect(AI_SYSTEM_PROMPT).toContain('Never describe an unsupported or partial product/category trend as a fact')
  })
})

describe('validateAiOutput', () => {
  it('accepts a grounded report', () => {
    expect(validateAiOutput(good, input).ok).toBe(true)
  })

  const issues = (mutate: (o: typeof good) => unknown, against: AiInput = input) => {
    const copy = JSON.parse(JSON.stringify(good)) as typeof good
    const v = validateAiOutput(mutate(copy) ?? copy, against)
    return v.ok ? [] : v.issues.map((i) => i.code)
  }

  it('rejects a non-object and a bad shape', () => {
    expect(validateAiOutput('text', input)).toMatchObject({ ok: false })
    expect(validateAiOutput({ summary: 1 }, input)).toMatchObject({ ok: false })
  })
  it('rejects an invented number in a claim or the summary', () => {
    expect(issues((o) => { o.claims[0]!.text = 'Ciro 4200 oldu.' })).toContain('invented_number')
    expect(issues((o) => { o.summary = 'Ciro %250 arttı.' })).toContain('invented_number')
  })
  it('accepts numbers written Turkish-style when they are in the facts', () => {
    expect(issues((o) => { o.claims[0]!.text = 'Ciro 3.900 TL.' })).toEqual([])
  })
  it('rejects evidence for an unknown (or unsupported) metric', () => {
    expect(issues((o) => { o.claims[0]!.evidence[0]!.metric = 'financial.netProfit' })).toContain('unknown_metric')
    const bothOnly = buildAiInput(weekly({ '2026-09-30': finalFacts['2026-09-30']! }))
    const v = validateAiOutput({ summary: 'x', limitations: [], claims: [{ id: 'p', confidence: 'fact', text: 'Ürün P1 satışı arttı.', evidence: [{ metric: 'product.P1.revenue', value: 150 }] }] }, bothOnly)
    expect(v.ok).toBe(false)
    expect(!v.ok && v.issues.map((i) => i.code)).toContain('unknown_metric')
  })
  it('rejects evidence whose value differs from the facts, and a claim without evidence', () => {
    expect(issues((o) => { o.claims[0]!.evidence[0]!.value = 3901 })).toContain('evidence_value_mismatch')
    expect(issues((o) => { o.claims[0]!.evidence = [] })).toContain('missing_evidence')
  })
  it('never lets partial / provisional / unverified evidence back a FACT claim', () => {
    const partialFact = { summary: 'x', limitations: [], claims: [{ id: 'p', confidence: 'fact', text: 'Ürün P1 cirosu 150.', evidence: [{ metric: 'product.P1.revenue', value: 150 }] }] }
    const v = validateAiOutput(partialFact, input)
    expect(!v.ok && v.issues.map((i) => i.code)).toContain('fact_claim_on_incomplete_evidence')
    const prov = { summary: 'x', limitations: [], claims: [{ id: 'p', confidence: 'fact', text: 'Geçici X cirosu 500.', evidence: [{ metric: 'provisionalDay.2026-10-01.xRevenue', value: 500 }] }] }
    const pv = validateAiOutput(prov, provInput)
    expect(!pv.ok && pv.issues.map((i) => i.code)).toContain('fact_claim_on_incomplete_evidence')
    const provRevenue = { summary: 'x', limitations: [], claims: [{ id: 'p', confidence: 'fact', text: 'Haftalık ciro 4400.', evidence: [{ metric: 'financial.grossRevenue', value: provInput.facts['financial.grossRevenue']!.value }] }] }
    expect(validateAiOutput(provRevenue, provInput).ok).toBe(false)
  })
  it('a partial product trend may only be described as a hypothesis, never a fact', () => {
    const asHypothesis = { summary: 'x', limitations: [], claims: [{ id: 'p', confidence: 'hypothesis', text: 'Bu ürünün satışı artmış olabilir.', evidence: [{ metric: 'product.P1.revenue', value: 150 }] }] }
    expect(validateAiOutput(asHypothesis, input).ok).toBe(true)
  })
  it('does not let a fact claim rest on relationship evidence', () => {
    const rel = buildAiInput({ ...finalWeek, weatherEffect: { state: 'ok', confidence: 'relationship', sample: 20, temperatureCorrelation: { r: 0.42, n: 20 } } })
    const v = validateAiOutput({ summary: 'x', limitations: [], claims: [{ id: 'w', confidence: 'fact', text: 'İlişki 0.42.', evidence: [{ metric: 'weather.temperatureCorrelation.r', value: 0.42 }] }] }, rel)
    expect(!v.ok && v.issues.map((i) => i.code)).toContain('fact_claim_on_relationship_evidence')
  })
  it('keeps causal wording for hypotheses only', () => {
    expect(issues((o) => { o.claims[0]!.text = 'Ciro arttı çünkü hava iyiydi.' })).toContain('causal_language_without_hypothesis')
  })
  it('rejects a bad confidence label, duplicate ids and too many claims', () => {
    expect(issues((o) => { (o.claims[0] as { confidence: string }).confidence = 'certain' })).toContain('bad_confidence')
    expect(issues((o) => { o.claims[1]!.id = 'c1' })).toContain('duplicate_claim_id')
    expect(issues((o) => { o.claims = Array.from({ length: 13 }, (_, i) => ({ ...o.claims[0]!, id: `x${i}` })) })).toContain('too_many_claims')
  })
  it('rejects a date that is not part of the input', () => {
    expect(issues((o) => { o.claims[0]!.text = 'En iyi gün 2026-09-15 idi.' })).toContain('invented_number')
    expect(issues((o) => { o.claims[0]!.text = 'En iyi gün 2026-09-30 idi.' })).toEqual([])
  })
})

describe('generateAiReport', () => {
  it('returns a generated report when the model answers a valid contract', async () => {
    expect((await generateAiReport(input, async () => ({ text: JSON.stringify(good), model: 'm' }))).status).toBe('generated')
  })
  it('never throws when the model fails', async () => {
    expect(await generateAiReport(input, async () => { throw new Error('boom') })).toEqual({ status: 'ai_unavailable', errorCode: 'ai_unavailable' })
  })
  it('turns a timeout into a result', async () => {
    expect(await generateAiReport(input, () => new Promise(() => undefined), 10)).toEqual({ status: 'ai_unavailable', errorCode: 'ai_timeout' })
  })
  it('turns non-JSON into a result', async () => {
    expect(await generateAiReport(input, async () => ({ text: 'not json' }))).toEqual({ status: 'ai_unavailable', errorCode: 'ai_bad_json' })
  })
  it('records a contract violation without storing the output', async () => {
    const r = await generateAiReport(input, async () => ({ text: JSON.stringify({ ...good, summary: 'Ciro 9999 oldu.' }) }))
    expect(r.status).toBe('invalid')
    expect('output' in r).toBe(false)
  })
})
