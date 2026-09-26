/**
 * Demo data-quality view. Everything in the demo store is synthetic, so every
 * entity is reported as test/demo data (never as business data). Zero
 * network; reads the in-memory demo store only.
 */
import {
  buildDataQualityReport,
  type CatalogSnapshot,
  type DataQualityReport,
  type ProvenanceRow,
} from '../../domain/dataQuality'
import { highestRank } from '../../domain/management'
import { currentDemoUser } from '../../features/auth/demoSession'
import { demoState } from './state'

const pad = (n: number) => String(n).padStart(2, '0')

export const demoDataQuality = {
  async getDataQuality(): Promise<DataQualityReport> {
    const state = demoState()
    const user = currentDemoUser()
    const roles = state.employees.find((e) => e.id === user?.id)?.roles ?? user?.roles ?? []
    // RLS on the provenance table: owner/manager only.
    if (highestRank(roles) < 3) {
      return buildDataQualityReport({
        branches: [],
        registers: [],
        shifts: [],
        categories: [],
        categoryBranches: [],
        items: [],
        thresholds: [],
        provenance: [],
      })
    }
    const key = (branchId: string) => state.branches.find((b) => b.id === branchId)?.key ?? branchId
    const catKey = (id: string | null) => state.categories.find((c) => c.id === id)?.key ?? null
    const snapshot: CatalogSnapshot = {
      branches: state.branches.map((b) => ({ key: b.key, name: b.name, isActive: true })),
      registers: [],
      shifts: state.shiftDefinitions.map((s) => ({
        branchKey: key(s.branchId),
        key: s.key,
        name: s.name,
        start: `${pad(s.startHour)}:${pad(s.startMinute)}`,
        end: `${pad(s.endHour)}:${pad(s.endMinute)}`,
        cutoff: `${pad(s.cutoffHour)}:${pad(s.cutoffMinute)}`,
        isActive: s.isActive,
      })),
      categories: state.categories.map((c) => ({ key: c.key, name: c.name, isActive: true })),
      categoryBranches: Object.entries(state.branchCategoryKeys).flatMap(([branchId, keys]) =>
        keys.map((categoryKey) => ({ branchKey: key(branchId), categoryKey })),
      ),
      items: state.items.map((i) => ({
        branchKey: key(i.branchId),
        code: i.code,
        name: i.name,
        unit: i.unit,
        allowsDecimal: i.allowsDecimal,
        isActive: i.isActive,
        categoryKey: catKey(i.salesCategoryId),
      })),
      thresholds: Object.entries(state.thresholds).map(([branchId, t]) => ({
        branchKey: key(branchId),
        warning: t.warningPercentage,
        error: t.errorPercentage,
      })),
      provenance: [],
    }
    const demo = (entityType: string, entityKey: string): ProvenanceRow => ({
      entityType,
      entityKey,
      classification: 'demo_only',
      approval: 'pending',
      dataset: 'seed',
      source: 'Örnek demo verisi',
    })
    snapshot.provenance = [
      ...snapshot.branches.map((b) => demo('branch', b.key)),
      ...snapshot.shifts.map((s) => demo('shift_definition', `${s.branchKey}/${s.key}`)),
      ...snapshot.categories.map((c) => demo('category', c.key)),
      ...snapshot.categoryBranches.map((c) => demo('category_branch', `${c.branchKey}/${c.categoryKey}`)),
      ...snapshot.items.map((i) => demo('inventory_item', `${i.branchKey}/${i.code}`)),
      ...snapshot.thresholds.map((t) => demo('threshold', t.branchKey)),
    ]
    return buildDataQualityReport(snapshot)
  },
}
