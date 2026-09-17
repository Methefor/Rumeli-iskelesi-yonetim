import { supabase } from './client'

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
  return data.map((row) => row.sales_categories).filter((c): c is CategoryOption => c !== null)
}

export interface SalesReportItemInput {
  categoryId: string
  amount: number
  quantity?: number
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
}

export async function createSalesReport(input: CreateSalesReportInput): Promise<{ reportId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_sales_report', {
    p_shift_id: input.shiftId,
    p_register_id: input.registerId ?? null,
    p_report_type: input.reportType,
    p_gross_revenue: input.grossRevenue,
    p_transaction_count: input.transactionCount ?? null,
    p_average_basket: input.averageBasket ?? null,
    p_notes: input.notes ?? null,
    p_items: input.items.map((item) => ({ category_id: item.categoryId, amount: item.amount, quantity: item.quantity ?? null })),
  })
  return { reportId: error ? null : (data as string), error: error?.message ?? null }
}

export interface SalesReportSummary {
  id: string
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

const REPORT_SELECT = 'id, branch_id, report_type, gross_revenue, status, reconciliation_status, submitted_at, notes, branches(name)'

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
export async function listReconciliationQueue(branchId: string): Promise<SalesReportSummary[]> {
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
  return { error: error?.message ?? null }
}
