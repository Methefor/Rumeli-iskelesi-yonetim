import { supabase } from './client'
import { friendlyFromSupabaseError } from '../errors'

export interface CategoryOption {
  id: string
  key: string
  name: string
}

/** Categories a branch actually reports on (sales_category_branches join) — never assume every branch uses every category. */
export async function listBranchCategories(branchId: string): Promise<CategoryOption[]> {
  const { data, error } = await supabase
    .from('sales_category_branches')
    .select('sales_categories(id, key, name)')
    .eq('branch_id', branchId)
    .returns<Array<{ sales_categories: CategoryOption | null }>>()

  if (error || !data) return []
  return data
    .map((row) => row.sales_categories)
    .filter((c): c is CategoryOption => c !== null)
}

/**
 * A category-level line (`categoryId` + `amount`, revenue only — the legacy
 * shape) OR a product-linked line (`inventoryItemId` + explicit
 * `inventoryQuantity` + `amount`). A product line writes a SALE stock
 * movement server-side; the category is taken from the item. Quantity is
 * never inferred from amount.
 */
export interface SalesReportItemInput {
  categoryId?: string | null
  amount: number
  quantity?: number
  inventoryItemId?: string | null
  inventoryQuantity?: number | null
}

export interface CreateSalesReportInput {
  shiftId: string
  registerId?: string | null
  reportType: 'X' | 'Z'
  grossRevenue: number
  transactionCount?: number | null
  averageBasket?: number | null
  notes?: string | null
  items: SalesReportItemInput[]
  /**
   * Required only when the shift's business_date is more than 3 Istanbul
   * calendar days in the past and the caller is owner/manager — the server
   * (015_sales_backdated_policy.sql) rejects a normal operational user's
   * (cashier/employee/branch_manager) backdated submission outright, and
   * rejects an owner/manager one without this reason.
   */
  backdatedReason?: string | null
}

export async function createSalesReport(
  input: CreateSalesReportInput,
): Promise<{ reportId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_sales_report', {
    p_shift_id: input.shiftId,
    p_register_id: input.registerId ?? null,
    p_report_type: input.reportType,
    p_gross_revenue: input.grossRevenue,
    p_transaction_count: input.transactionCount ?? null,
    p_average_basket: input.averageBasket ?? null,
    p_notes: input.notes ?? null,
    p_backdated_reason: input.backdatedReason ?? null,
    p_items: input.items.map((item) =>
      item.inventoryItemId
        ? {
            inventory_item_id: item.inventoryItemId,
            inventory_quantity: item.inventoryQuantity,
            amount: item.amount,
          }
        : {
            category_id: item.categoryId,
            amount: item.amount,
            quantity: item.quantity ?? null,
          },
    ),
  })
  return {
    reportId: error ? null : (data as string),
    error: friendlyFromSupabaseError(error),
  }
}

export interface SalesReportSummary {
  id: string
  shiftId: string
  branchId: string
  branchName: string
  reportType: 'X' | 'Z'
  grossRevenue: number
  status: string
  reconciliationStatus: 'OK' | 'WARNING' | 'ERROR'
  submittedAt: string
  notes: string | null
}

interface SalesReportRow {
  id: string
  shift_id: string
  branch_id: string
  report_type: 'X' | 'Z'
  gross_revenue: number
  status: string
  reconciliation_status: 'OK' | 'WARNING' | 'ERROR'
  submitted_at: string
  notes: string | null
  branches: { name: string } | null
}

function mapReportRow(row: SalesReportRow): SalesReportSummary {
  return {
    id: row.id,
    shiftId: row.shift_id,
    branchId: row.branch_id,
    branchName: row.branches?.name ?? '',
    reportType: row.report_type,
    grossRevenue: row.gross_revenue,
    status: row.status,
    reconciliationStatus: row.reconciliation_status,
    submittedAt: row.submitted_at,
    notes: row.notes,
  }
}

const REPORT_SELECT =
  'id, shift_id, branch_id, report_type, gross_revenue, status, reconciliation_status, submitted_at, notes, branches(name)'

/** The signed-in employee's own reports, most recent first. */
export async function listMyRecentReports(userId: string): Promise<SalesReportSummary[]> {
  const { data, error } = await supabase
    .from('sales_reports')
    .select(REPORT_SELECT)
    .eq('submitted_by', userId)
    .order('submitted_at', { ascending: false })
    .limit(20)
    .returns<SalesReportRow[]>()

  if (error || !data) return []
  return data.map(mapReportRow)
}

/** All reports for a branch (RLS scopes visibility to the caller's own branches unless org-wide). */
export async function listBranchReports(branchId: string): Promise<SalesReportSummary[]> {
  const { data, error } = await supabase
    .from('sales_reports')
    .select(REPORT_SELECT)
    .eq('branch_id', branchId)
    .order('submitted_at', { ascending: false })
    .limit(50)
    .returns<SalesReportRow[]>()

  if (error || !data) return []
  return data.map(mapReportRow)
}

/** Reports flagged WARNING/ERROR that still need a manager's attention. */
export async function listReconciliationQueue(
  branchId: string,
): Promise<SalesReportSummary[]> {
  const { data, error } = await supabase
    .from('sales_reports')
    .select(REPORT_SELECT)
    .eq('branch_id', branchId)
    .neq('status', 'cancelled')
    .in('reconciliation_status', ['WARNING', 'ERROR'])
    .order('submitted_at', { ascending: false })
    .returns<SalesReportRow[]>()

  if (error || !data) return []
  return data.map(mapReportRow)
}

export async function overrideReconciliation(input: {
  reportId: string
  newStatus: 'OK' | 'WARNING' | 'ERROR'
  reason: string
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('override_reconciliation', {
    p_report_id: input.reportId,
    p_new_status: input.newStatus,
    p_reason: input.reason,
  })
  return { error: friendlyFromSupabaseError(error) }
}
