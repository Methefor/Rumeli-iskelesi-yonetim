import { supabase } from './client'
import { friendlyErrorMessage, friendlyFromSupabaseError } from '../errors'
import {
  buildDataQualityReport,
  type CatalogSnapshot,
  type DataQualityReport,
  type ProvenanceRow,
} from '../../domain/dataQuality'

/**
 * Data-quality view of the operating configuration: what is configured, and
 * where each value came from (operating_data_provenance, migration 017).
 * Read-only. Provenance is readable by owner/manager only (RLS); the screen
 * is gated the same way.
 */
const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (h: number, m: number) => `${pad(h)}:${pad(m)}`

async function rows<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    throw new Error(
      friendlyFromSupabaseError(error as Parameters<typeof friendlyFromSupabaseError>[0]) ??
        friendlyErrorMessage(),
    )
  }
  return data ?? []
}

export async function getDataQuality(): Promise<DataQualityReport> {
  const [branches, registers, shifts, categories, catBranches, items, thresholds, provenance] =
    await Promise.all([
      rows(supabase.from('branches').select('id, key, name, is_active').order('name')),
      rows(supabase.from('registers').select('branch_id, key, name, is_active')),
      rows(
        supabase
          .from('shift_definitions')
          .select(
            'branch_id, key, name, start_hour, start_minute, end_hour, end_minute, cutoff_hour, cutoff_minute, is_active',
          ),
      ),
      rows(supabase.from('sales_categories').select('id, key, name, is_active')),
      rows(supabase.from('sales_category_branches').select('branch_id, category_id')),
      rows(
        supabase
          .from('inventory_items')
          .select('branch_id, code, name, unit, allows_decimal, is_active, sales_category_id'),
      ),
      rows(
        supabase
          .from('reconciliation_thresholds')
          .select('branch_id, warning_percentage, error_percentage'),
      ),
      rows(
        supabase
          .from('operating_data_provenance')
          .select('entity_type, entity_key, classification, approval_status, dataset, source'),
      ),
    ])

  const branchKey = new Map(branches.map((b) => [b.id, b.key]))
  const categoryKey = new Map(categories.map((c) => [c.id, c.key]))
  const bk = (id: string) => branchKey.get(id) ?? id

  const snapshot: CatalogSnapshot = {
    branches: branches.map((b) => ({ key: b.key, name: b.name, isActive: b.is_active })),
    registers: registers.map((r) => ({
      branchKey: bk(r.branch_id),
      key: r.key,
      name: r.name,
      isActive: r.is_active,
    })),
    shifts: shifts.map((s) => ({
      branchKey: bk(s.branch_id),
      key: s.key,
      name: s.name,
      start: hhmm(s.start_hour, s.start_minute),
      end: hhmm(s.end_hour, s.end_minute),
      cutoff: hhmm(s.cutoff_hour, s.cutoff_minute),
      isActive: s.is_active,
    })),
    categories: categories.map((c) => ({ key: c.key, name: c.name, isActive: c.is_active })),
    categoryBranches: catBranches.map((c) => ({
      branchKey: bk(c.branch_id),
      categoryKey: categoryKey.get(c.category_id) ?? c.category_id,
    })),
    items: items.map((i) => ({
      branchKey: bk(i.branch_id),
      code: i.code,
      name: i.name,
      unit: i.unit,
      allowsDecimal: i.allows_decimal,
      isActive: i.is_active,
      categoryKey: i.sales_category_id ? (categoryKey.get(i.sales_category_id) ?? null) : null,
    })),
    thresholds: thresholds.map((t) => ({
      branchKey: bk(t.branch_id),
      warning: Number(t.warning_percentage),
      error: Number(t.error_percentage),
    })),
    provenance: provenance.map(
      (p): ProvenanceRow => ({
        entityType: p.entity_type,
        entityKey: p.entity_key,
        classification: p.classification as ProvenanceRow['classification'],
        approval: p.approval_status as ProvenanceRow['approval'],
        dataset: p.dataset as ProvenanceRow['dataset'],
        source: p.source,
      }),
    ),
  }
  return buildDataQualityReport(snapshot)
}
