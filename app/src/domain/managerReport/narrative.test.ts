import { describe, expect, it } from 'vitest'
import {
  buildDailyFactPack,
  buildNarrativeAiInput,
  buildWeeklyFactPack,
  factPackFingerprint,
  generateNarrative,
  renderDailyNarrative,
  renderNarrative,
  renderWeeklyNarrative,
  resolveNarrative,
  sanitizeFactPack,
  validateNarrative,
  type DailyFactPack,
  type Narrative,
  type WeeklyFactPack,
} from '.'
import { addDaysIso } from '../../utils/dates'
import { BASE_NOW, cleanWeekSpec, dailyReportInputs, dashboardFor, FIXTURE_BRANCHES, signalsFor, weeklyReportInputs, type BranchSpec } from './fixtures'

const [B1, B2] = FIXTURE_BRANCHES as [(typeof FIXTURE_BRANCHES)[number], (typeof FIXTURE_BRANCHES)[number]]
const TODAY = '2026-10-08'
const WEEK = '2026-09-28'

function daily(specs: Record<string, BranchSpec>): DailyFactPack {
  const d = dashboardFor(FIXTURE_BRANCHES, TODAY, specs)
  return buildDailyFactPack({
    businessDate: TODAY,
    now: BASE_NOW,
    branches: FIXTURE_BRANCHES,
    rows: d.branches,
    organization: d.organization,
    signals: Object.fromEntries(FIXTURE_BRANCHES.map((b) => [b.id, signalsFor(b.id, TODAY)])),
    report: dailyReportInputs(FIXTURE_BRANCHES, TODAY, specs),
  })
}
const weatherDays = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ date: addDaysIso('2026-09-03', i), revenue: 1000 + (i % 7) * 100 + (i % 3 === 0 ? -150 : 150), temperatureC: 10 + i * 0.5, precipitationMm: i % 4 === 0 ? 3 : 0 }))
const weekly = (days = 0): WeeklyFactPack =>
  buildWeeklyFactPack({
    weekStart: WEEK,
    now: BASE_NOW,
    branches: FIXTURE_BRANCHES,
    report: weeklyReportInputs(FIXTURE_BRANCHES, WEEK, TODAY, { [B1.id]: cleanWeekSpec(WEEK, [1000, 1200, 900, 1100, 1500, 2000, 1800]), [B2.id]: cleanWeekSpec(WEEK, [800, 700, 600, 900, 1000, 1400, 1300]) }, {}, weatherDays(days)),
    signals: null,
  })
const dayPack = () => daily({ [B1.id]: { [TODAY]: { x: [900, 20], z: [2200, 44], costed: true } }, [B2.id]: { [TODAY]: { x: [700, 15] } } })

const clone = <T,>(n: T): T => JSON.parse(JSON.stringify(n)) as T
const issuesOf = (raw: unknown, pack: DailyFactPack | WeeklyFactPack) => {
  const v = validateNarrative(raw, pack)
  return v.ok ? [] : v.issues.map((i) => i.code)
}

describe('narrative validator — what an AI (or any text) may not do', () => {
  const pack = dayPack()
  const good = renderDailyNarrative(pack)

  it('accepts the deterministic narrative (the renderer is held to the same contract an AI would be)', () => {
    expect(validateNarrative(good, pack)).toMatchObject({ ok: true })
    expect(validateNarrative(renderWeeklyNarrative(weekly()), weekly())).toMatchObject({ ok: true })
  })

  it('rejects unknown evidence ids', () => {
    const bad = clone(good)
    bad.sections[0]!.evidenceRefs.push('rev.does.not.exist')
    expect(issuesOf(bad, pack)).toContain('unknown_evidence')
  })

  it('rejects an invented number (not in the evidence the section cites)', () => {
    const bad = clone(good)
    bad.sections[0]!.body += '\nCiro 9.999,00 ₺ olarak gerçekleşti.'
    expect(issuesOf(bad, pack)).toContain('unsupported_number')
  })

  it('rejects a real number that the section did not cite (no uncited numbers)', () => {
    const bad = clone(good)
    bad.sections[3]!.body += '\nGeçici ciro 700,00 ₺.' // true value, but section 4 does not cite it
    expect(issuesOf(bad, pack)).toContain('unsupported_number')
  })

  it('rejects causal language, also for hypotheses (V1 excludes hypotheses entirely)', () => {
    for (const phrase of ['Satışlar yağmur yüzünden düştü.', 'Ciro hava nedeniyle azaldı.', 'Çünkü hava soğuktu.', 'Stok eksikliği sebebiyle ciro düştü.']) {
      const bad = clone(good)
      bad.sections[0]!.body += `\n${phrase}`
      expect(issuesOf(bad, pack), phrase).toContain('causal_language')
    }
    const hypo = clone(good)
    hypo.sections.push({ code: 'hypothesis', title: 'İncelenebilir hipotez', body: 'Olası bir açıklama.', evidenceRefs: [] })
    expect(issuesOf(hypo, pack)).toContain('hypothesis_section')
  })

  it('allows the mandatory "association, not cause" disclaimer', () => {
    const w = weekly(30)
    const n = renderWeeklyNarrative(w)
    expect(n.sections.find((s) => s.code === 'weather')!.body).toContain('neden-sonuç')
    expect(issuesOf(n, w)).toEqual([])
  })

  it('rejects a claim about a metric the pack marks unsupported', () => {
    const noTx = daily({ [B1.id]: { [TODAY]: { z: [2000, null], legacy: true } }, [B2.id]: { [TODAY]: { z: [1000, null], legacy: true } } })
    expect(noTx.organization.transactions.support).toBe('unsupported')
    const n = renderDailyNarrative(noTx)
    expect(issuesOf(n, noTx)).toEqual([])
    const bad = clone(n)
    bad.sections[0]!.body += '\nOrtalama sepet yükseldi.'
    expect(issuesOf(bad, noTx)).toContain('unsupported_metric_claim')
  })

  it('requires partial evidence to be worded as partial and relationships as associations', () => {
    const bad = clone(good)
    const idx = bad.sections.findIndex((s) => s.evidenceRefs.includes('org.revenue.provisional'))
    expect(idx).toBeGreaterThanOrEqual(0)
    // the geçici (provisional) wording is what keeps the X reading partial; strip it and the validator objects
    bad.sections[idx]!.body = bad.sections[idx]!.body.replace(/Geçici \(yalnızca X\) ciro/g, 'Ciro').replace(/kesinleşmiş ciroya eklenmedi/g, 'gerçekleşti')
    const bodyOk = !/(kısmi|geçici|kesinleşmedi|şu ana kadar|yalnızca|verisi olan|eksik|hesaplanamad|sürüyor|henüz|tahmin|bekle|güncel değil|eski)/i.test(bad.sections[idx]!.body)
    if (bodyOk) expect(issuesOf(bad, pack)).toContain('partial_stated_as_final')

    const w = weekly(30)
    expect(Object.values(w.evidence).some((e) => e.kind === 'relationship')).toBe(true)
    const wn = clone(renderWeeklyNarrative(w))
    const wx = wn.sections.find((s) => s.code === 'weather')!
    wx.body = wx.body.replace(/ilişki/g, 'etki').replace(/neden-sonuç iddiası değildir/g, 'kanıtlanmıştır')
    expect(issuesOf(wn, w)).toContain('relationship_not_marked')
  })

  it('requires every limitation of the pack to be propagated', () => {
    const bad = clone(good)
    bad.limitations = bad.limitations.filter((l) => l.code !== 'missing_z')
    expect(pack.limitations.some((l) => l.code === 'missing_z')).toBe(true)
    expect(issuesOf(bad, pack)).toContain('missing_limitation')
  })

  it('rejects schema violations', () => {
    expect(issuesOf(null, pack)).toEqual(['not_an_object'])
    expect(issuesOf({ headline: 'x' }, pack)).toEqual(['bad_shape'])
    expect(issuesOf({ ...good, schemaVersion: 'manager_narrative.v0' }, pack)).toContain('schema_version')
    expect(issuesOf({ ...good, reportType: 'weekly' }, pack)).toContain('report_type_mismatch')
    expect(issuesOf({ ...good, sections: [{ code: 'x', title: 'y', body: 'z' }] }, pack)).toContain('bad_shape')
    expect(issuesOf({ ...good, sections: [] }, pack)).toContain('missing_section')
  })

  it('ignores dates and branch names that merely contain digits', () => {
    const bad = clone(good)
    bad.sections[0]!.body += `\n${B1.name} için 8 Ekim 2026 verisi.`
    expect(issuesOf(bad, pack)).toEqual([])
  })
})

describe('AI input contract', () => {
  it('contains only the sanitized Fact Pack: no internal ids, no credentials, no raw rows', () => {
    const pack = dayPack()
    const input = buildNarrativeAiInput(pack)
    const text = JSON.stringify(input)
    expect(input.allowedEvidenceRefs).toEqual(Object.keys(pack.evidence).sort())
    expect(text).not.toContain(B1.id)
    expect(text).not.toContain('snap-d-')
    expect(text).not.toMatch(/service_role|apikey|password|secret|token|supabase/i)
    expect(input.rules.join(' ')).toContain('Never calculate')
    expect(sanitizeFactPack(pack).scope.branches.every((b) => b.id === '')).toBe(true)
    expect(pack.scope.branches[0]!.id).toBe(B1.id) // the original is untouched
  })

  it('has a stable fingerprint that ignores the generation time and tracks content', () => {
    const a = dayPack()
    const b = { ...dayPack(), generatedAt: '2030-01-01T00:00:00.000Z' }
    expect(factPackFingerprint(a)).toBe(factPackFingerprint(b))
    const changed = daily({ [B1.id]: { [TODAY]: { z: [2201, 44], costed: true } }, [B2.id]: { [TODAY]: { x: [700, 15] } } })
    expect(factPackFingerprint(changed)).not.toBe(factPackFingerprint(a))
  })
})

describe('deterministic fallback', () => {
  const pack = dayPack()
  const det = renderNarrative(pack)

  it('without a candidate the deterministic narrative is used (no AI needed)', () => {
    const r = resolveNarrative(pack)
    expect(r).toMatchObject({ origin: 'deterministic', fallbackReason: null })
    expect(r.narrative).toEqual(det)
    expect(r.metadata).toMatchObject({ generator: 'deterministic_renderer', validation: 'not_applicable', ai: null, factSchemaVersion: 'manager_fact_pack.v1', narrativeSchemaVersion: 'manager_narrative.v1' })
    expect(r.metadata.sourceFactPack).toBe(factPackFingerprint(pack))
  })

  it('a valid AI narrative is accepted and carries runtime metadata', () => {
    const ai: Narrative = { ...det, headline: 'Günün kısa özeti' }
    const r = resolveNarrative(pack, { raw: ai, ai: { provider: 'test-provider', model: 'test-model' } })
    expect(r.origin).toBe('ai')
    expect(r.metadata).toMatchObject({ generator: 'ai', validation: 'passed', ai: { provider: 'test-provider', model: 'test-model', promptContractVersion: 'manager_narrative_contract.v1' } })
  })

  it('an invalid AI narrative falls back to the deterministic one with the reason', () => {
    const bad = clone(det)
    bad.sections[0]!.body += '\nCiro 123.456,00 ₺.'
    const r = resolveNarrative(pack, { raw: bad, ai: { provider: 'p', model: null } })
    expect(r.origin).toBe('deterministic')
    expect(r.fallbackReason).toBe('contract_violation')
    expect(r.issues.map((i) => i.code)).toContain('unsupported_number')
    expect(r.narrative).toEqual(det)
    expect(r.metadata.validation).toBe('failed')
  })

  it('generateNarrative never throws: provider error, timeout, bad JSON and violations all fall back', async () => {
    const ok = JSON.stringify(det)
    expect((await generateNarrative(pack, async () => ({ text: ok, provider: 'p', model: 'm' }))).origin).toBe('ai')
    const boom = await generateNarrative(pack, async () => {
      throw new Error('network')
    })
    expect(boom).toMatchObject({ origin: 'deterministic', fallbackReason: 'ai_unavailable' })
    const slow = await generateNarrative(pack, () => new Promise(() => undefined), 10)
    expect(slow).toMatchObject({ origin: 'deterministic', fallbackReason: 'ai_timeout' })
    const junk = await generateNarrative(pack, async () => ({ text: 'not json', provider: 'p' }))
    expect(junk).toMatchObject({ origin: 'deterministic', fallbackReason: 'ai_bad_json' })
    const invalid = await generateNarrative(pack, async () => ({ text: JSON.stringify({ ...det, sections: [] }), provider: 'p' }))
    expect(invalid).toMatchObject({ origin: 'deterministic', fallbackReason: 'contract_violation' })
    for (const r of [boom, slow, junk, invalid]) expect(r.narrative).toEqual(det)
  })

  it('the AI is handed no function to call out with: only the pack goes in', async () => {
    let received: unknown
    await generateNarrative(pack, async (input) => {
      received = input
      return { text: '{}', provider: 'p' }
    })
    expect(Object.keys(received as object).sort()).toEqual(['allowedEvidenceRefs', 'contractVersion', 'factPack', 'language', 'outputSchemaVersion', 'rules', 'task'])
  })
})
