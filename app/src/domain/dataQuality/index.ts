/**
 * Data-quality view of the operating configuration (branches, shifts,
 * registers, categories, catalogue, thresholds). Pure: the same function
 * serves the real screen and the demo store.
 *
 * Every configured entity has a provenance (where it came from) and an
 * approval status. Anything that is not confirmed/approved by the business
 * is labelled as such and never presented as business truth.
 */
export type Classification = 'confirmed' | 'legacy_observed' | 'demo_only' | 'unknown'
export type Approval = 'approved' | 'pending' | 'rejected'

export interface ProvenanceRow {
  entityType: string
  entityKey: string
  classification: Classification
  approval: Approval
  dataset: 'real' | 'test-only' | 'seed'
  source: string | null
}

export interface CatalogSnapshot {
  branches: Array<{ key: string; name: string; isActive: boolean }>
  registers: Array<{ branchKey: string; key: string; name: string; isActive: boolean }>
  shifts: Array<{
    branchKey: string
    key: string
    name: string
    start: string
    end: string
    cutoff: string
    isActive: boolean
  }>
  categories: Array<{ key: string; name: string; isActive: boolean }>
  categoryBranches: Array<{ branchKey: string; categoryKey: string }>
  items: Array<{
    branchKey: string
    code: string
    name: string
    unit: string
    allowsDecimal: boolean
    isActive: boolean
    categoryKey: string | null
  }>
  thresholds: Array<{ branchKey: string; warning: number; error: number }>
  provenance: ProvenanceRow[]
}

export type TrustLevel = 'trusted' | 'pending' | 'test' | 'unknown'

export interface Trust {
  level: TrustLevel
  label: string
  source: string | null
}

export const TRUST_TONE: Record<TrustLevel, 'success' | 'warning' | 'info' | 'danger'> = {
  trusted: 'success',
  pending: 'warning',
  test: 'info',
  unknown: 'danger',
}

export function classify(row: ProvenanceRow | undefined): Trust {
  if (!row) return { level: 'unknown', label: 'Kaynak kaydı yok', source: null }
  if (row.classification === 'demo_only' || row.dataset === 'test-only')
    return { level: 'test', label: 'Yalnızca test verisi', source: row.source }
  if (row.classification === 'unknown')
    return { level: 'unknown', label: 'Bilinmiyor · sahibinden bilgi gerekli', source: row.source }
  if (row.approval === 'approved')
    return {
      level: 'trusted',
      label: row.classification === 'confirmed' ? 'Doğrulanmış' : 'Eski uygulamadan · onaylı',
      source: row.source,
    }
  return {
    level: 'pending',
    label:
      row.classification === 'legacy_observed'
        ? 'Eski uygulamada görüldü · onay bekliyor'
        : 'Onay bekliyor',
    source: row.source,
  }
}

export interface QualityIssue {
  severity: 'error' | 'warning'
  message: string
}

export interface BranchQuality {
  key: string
  name: string
  trust: Trust
  shiftCount: number
  registerCount: number
  categoryCount: number
  activeItems: number
  inactiveItems: number
  thresholds: { warning: number; error: number; trust: Trust } | null
  shifts: Array<CatalogSnapshot['shifts'][number] & { trust: Trust }>
  items: Array<CatalogSnapshot['items'][number] & { trust: Trust }>
}

export interface DataQualityReport {
  branches: BranchQuality[]
  totals: Record<TrustLevel, number>
  issues: QualityIssue[]
}

export function buildDataQualityReport(s: CatalogSnapshot): DataQualityReport {
  const prov = new Map(s.provenance.map((p) => [`${p.entityType}:${p.entityKey}`, p]))
  const trustOf = (type: string, key: string) => classify(prov.get(`${type}:${key}`))
  const totals: Record<TrustLevel, number> = { trusted: 0, pending: 0, test: 0, unknown: 0 }
  const count = (t: Trust) => {
    totals[t.level] += 1
    return t
  }
  const issues: QualityIssue[] = []

  const branches: BranchQuality[] = s.branches.map((b) => {
    const shifts = s.shifts
      .filter((x) => x.branchKey === b.key)
      .map((x) => ({ ...x, trust: count(trustOf('shift_definition', `${b.key}/${x.key}`)) }))
    const items = s.items
      .filter((x) => x.branchKey === b.key)
      .map((x) => ({ ...x, trust: count(trustOf('inventory_item', `${b.key}/${x.code}`)) }))
    const registers = s.registers.filter((x) => x.branchKey === b.key)
    registers.forEach((r) => count(trustOf('register', `${b.key}/${r.key}`)))
    const cats = s.categoryBranches.filter((x) => x.branchKey === b.key)
    cats.forEach((c) => count(trustOf('category_branch', `${b.key}/${c.categoryKey}`)))
    const thr = s.thresholds.find((x) => x.branchKey === b.key)
    const thrTrust = thr ? count(trustOf('threshold', b.key)) : null
    const trust = count(trustOf('branch', b.key))

    if (b.isActive) {
      if (shifts.length === 0)
        issues.push({ severity: 'warning', message: `${b.name}: vardiya tanımı yok.` })
      if (registers.length === 0)
        issues.push({ severity: 'warning', message: `${b.name}: kasa tanımı yok.` })
      if (cats.length === 0)
        issues.push({ severity: 'warning', message: `${b.name}: satış kategorisi eşlemesi yok.` })
      if (!thr)
        issues.push({ severity: 'warning', message: `${b.name}: mutabakat eşiği tanımlı değil.` })
    }
    for (const it of items) {
      if (it.isActive && !it.categoryKey)
        issues.push({
          severity: 'warning',
          message: `${b.name} · ${it.code}: satış kategorisi eşlenmemiş; raporda satılamaz.`,
        })
      if (it.categoryKey && !cats.some((c) => c.categoryKey === it.categoryKey))
        issues.push({
          severity: 'error',
          message: `${b.name} · ${it.code}: kategorisi bu şubede etkin değil.`,
        })
    }
    return {
      key: b.key,
      name: b.name,
      trust,
      shiftCount: shifts.length,
      registerCount: registers.length,
      categoryCount: cats.length,
      activeItems: items.filter((i) => i.isActive).length,
      inactiveItems: items.filter((i) => !i.isActive).length,
      thresholds:
        thr && thrTrust ? { warning: thr.warning, error: thr.error, trust: thrTrust } : null,
      shifts,
      items,
    }
  })
  s.categories.forEach((c) => count(trustOf('category', c.key)))

  if (totals.test > 0)
    issues.unshift({
      severity: 'warning',
      message: `${totals.test} kayıt yalnızca test/örnek veridir; işletme verisi değildir.`,
    })
  if (totals.pending + totals.unknown > 0)
    issues.unshift({
      severity: 'warning',
      message: `${totals.pending + totals.unknown} kayıt işletme sahibinin onayını veya bilgisini bekliyor.`,
    })
  return { branches, totals, issues }
}
