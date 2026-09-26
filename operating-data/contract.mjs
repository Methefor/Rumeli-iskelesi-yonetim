/**
 * Operating-data contract: the eleven data groups, their CSV columns and the
 * vocabularies the loader accepts. Human-editable CSV files live in
 * `real/` (owner-confirmed configuration) and `test-only/` (synthetic
 * end-to-end fixtures). `owner-input/` holds empty templates.
 *
 * Every row of every group also carries the three provenance columns:
 *   provenance      confirmed | legacy_observed | demo_only | unknown
 *   approval_status approved  | pending         | rejected
 *   source          where the value comes from (file, screen, decision, person)
 */
export const PROVENANCE = ['confirmed', 'legacy_observed', 'demo_only', 'unknown']
export const APPROVAL = ['approved', 'pending', 'rejected']
export const META_COLUMNS = ['provenance', 'approval_status', 'source']

/** Application order: parents before children. */
export const GROUPS = [
  'branches',
  'sales_categories',
  'registers',
  'shift_definitions',
  'category_branches',
  'inventory_items',
  'product_categories',
  'item_costs',
  'opening_stock',
  'reconciliation_thresholds',
  'waste_reasons',
]

export const COLUMNS = {
  branches: ['branch_key', 'name', 'is_active'],
  sales_categories: ['category_key', 'name', 'is_active'],
  registers: ['branch_key', 'register_key', 'name', 'is_active'],
  shift_definitions: [
    'branch_key',
    'shift_key',
    'name',
    'start_time',
    'end_time',
    'cutoff_time',
    'cutoff_day_offset',
    'is_active',
  ],
  category_branches: ['branch_key', 'category_key', 'level'],
  inventory_items: ['branch_key', 'item_code', 'name', 'unit', 'allows_decimal', 'is_active'],
  product_categories: ['branch_key', 'item_code', 'category_key', 'level'],
  item_costs: ['branch_key', 'item_code', 'unit_cost', 'effective_from'],
  opening_stock: ['branch_key', 'item_code', 'quantity', 'as_of_date'],
  reconciliation_thresholds: ['branch_key', 'warning_percentage', 'error_percentage'],
  waste_reasons: ['reason_code', 'name', 'is_active'],
}

/**
 * Units the loader accepts. The database stores unit as free text (max 16
 * chars); this list is the loader's vocabulary and is extended here, in one
 * place, when the owner introduces a new unit.
 */
export const SUPPORTED_UNITS = ['adet', 'kg', 'g', 'lt', 'ml', 'paket', 'kutu', 'porsiyon']

/** Fixed by the CHECK constraint on inventory_movements.reason_code (migration 012). */
export const WASTE_REASON_CODES = ['expired', 'damaged', 'spilled', 'quality', 'sample', 'other']

export const KEY_PATTERN = /^[a-z][a-z0-9_]{1,47}$/
/** Same rule as inventory_items.code in migration 012. */
export const ITEM_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,31}$/

/** Costs may be dated at most this many days ahead (mirrors inventory_set_cost_internal). */
export const MAX_COST_DAYS_AHEAD = 30

/** How each group is identified in reports and duplicate detection. */
export const KEY_FIELDS = {
  branches: ['branch_key'],
  sales_categories: ['category_key'],
  registers: ['branch_key', 'register_key'],
  shift_definitions: ['branch_key', 'shift_key'],
  category_branches: ['branch_key', 'category_key'],
  inventory_items: ['branch_key', 'item_code'],
  product_categories: ['branch_key', 'item_code'],
  item_costs: ['branch_key', 'item_code', 'effective_from'],
  opening_stock: ['branch_key', 'item_code'],
  reconciliation_thresholds: ['branch_key'],
  waste_reasons: ['reason_code'],
}
