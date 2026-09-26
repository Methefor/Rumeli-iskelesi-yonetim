import { describe, expect, it } from 'vitest'
import { buildDataQualityReport, classify, type CatalogSnapshot, type ProvenanceRow } from '.'

const p = (
  entityType: string,
  entityKey: string,
  classification: ProvenanceRow['classification'],
  approval: ProvenanceRow['approval'],
  dataset: ProvenanceRow['dataset'] = 'real',
): ProvenanceRow => ({ entityType, entityKey, classification, approval, dataset, source: 'kaynak' })

const snapshot = (over: Partial<CatalogSnapshot> = {}): CatalogSnapshot => ({
  branches: [{ key: 'b1', name: 'Şube 1', isActive: true }],
  registers: [],
  shifts: [],
  categories: [{ key: 'c1', name: 'Kat 1', isActive: true }],
  categoryBranches: [],
  items: [],
  thresholds: [],
  provenance: [p('branch', 'b1', 'confirmed', 'approved')],
  ...over,
})

describe('classify', () => {
  it('never presents unapproved, unknown, demo or unsourced values as trusted', () => {
    expect(classify(p('x', 'y', 'confirmed', 'approved')).level).toBe('trusted')
    expect(classify(p('x', 'y', 'legacy_observed', 'approved')).label).toMatch(/onaylı/)
    expect(classify(p('x', 'y', 'legacy_observed', 'pending')).level).toBe('pending')
    expect(classify(p('x', 'y', 'confirmed', 'rejected')).level).toBe('pending')
    expect(classify(p('x', 'y', 'unknown', 'approved')).level).toBe('unknown')
    expect(classify(p('x', 'y', 'demo_only', 'approved')).level).toBe('test')
    expect(classify(p('x', 'y', 'confirmed', 'approved', 'test-only')).level).toBe('test')
    expect(classify(undefined).level).toBe('unknown')
  })
})

describe('buildDataQualityReport', () => {
  it('warns about a branch with no shifts, registers, categories or thresholds', () => {
    const r = buildDataQualityReport(snapshot())
    const text = r.issues.map((i) => i.message).join('|')
    for (const part of [
      'vardiya tanımı yok',
      'kasa tanımı yok',
      'kategorisi eşlemesi yok',
      'eşiği tanımlı değil',
    ])
      expect(text).toContain(part)
  })

  it('flags an active item without a category and an item whose category is not enabled for its branch', () => {
    const r = buildDataQualityReport(
      snapshot({
        items: [
          { branchKey: 'b1', code: 'A1', name: 'A', unit: 'adet', allowsDecimal: false, isActive: true, categoryKey: null },
          { branchKey: 'b1', code: 'A2', name: 'B', unit: 'kg', allowsDecimal: true, isActive: true, categoryKey: 'c1' },
        ],
      }),
    )
    expect(
      r.issues.some(
        (i) => i.severity === 'warning' && i.message.includes('A1') && i.message.includes('eşlenmemiş'),
      ),
    ).toBe(true)
    expect(r.issues.some((i) => i.severity === 'error' && i.message.includes('A2'))).toBe(true)
    expect(r.branches[0]?.activeItems).toBe(2)
  })

  it('counts trust levels and warns about test-only and pending data', () => {
    const r = buildDataQualityReport(
      snapshot({
        shifts: [
          { branchKey: 'b1', key: 'morning', name: 'Sabah', start: '08:00', end: '16:00', cutoff: '16:30', isActive: true },
        ],
        thresholds: [{ branchKey: 'b1', warning: 2, error: 5 }],
        items: [
          { branchKey: 'b1', code: 'T1', name: 'T', unit: 'adet', allowsDecimal: false, isActive: false, categoryKey: null },
        ],
        provenance: [
          p('branch', 'b1', 'confirmed', 'approved'),
          p('shift_definition', 'b1/morning', 'demo_only', 'pending', 'seed'),
          p('inventory_item', 'b1/T1', 'demo_only', 'approved', 'test-only'),
        ],
      }),
    )
    expect(r.totals.trusted).toBe(1)
    expect(r.totals.test).toBe(2)
    expect(r.totals.unknown).toBeGreaterThanOrEqual(1) // the threshold has no provenance row
    expect(r.issues[0]?.message).toMatch(/onayını veya bilgisini bekliyor/)
    expect(r.issues.some((i) => /yalnızca test/.test(i.message))).toBe(true)
    expect(r.branches[0]?.inactiveItems).toBe(1)
  })
})
