/**
 * The ONE place screens get their data from. In normal builds this is the
 * Supabase-backed API (services/data/real.ts); when VITE_DEMO_MODE=true
 * (Preview only) it is the synthetic fixture API (services/demo/api.ts),
 * which makes ZERO network requests. Screens never import from
 * services/supabase or services/demo directly, so demo mode cannot be
 * bypassed by accident and the real path stays untouched.
 */
import { isDemoModeEnabled } from '../supabase/env'
import { demoApi } from '../demo/api'
import { realApi, type DataApi } from './real'

const api: DataApi = isDemoModeEnabled ? demoApi : realApi

export const {
  listInventoryAudit,
  listEmployees,
  createEmployee,
  setEmployeeActive,
  resetEmployeePin,
  setEmployeeCode,
  assignEmployeeRole,
  revokeEmployeeRole,
  assignEmployeeBranch,
  removeEmployeeBranch,
  listShiftSettings,
  updateShiftSettings,
  getReconciliationThresholds,
  setReconciliationThresholds,
  listManagementAudit,
  getDataQuality,

  listMyShiftAssignments,
  listBranchShifts,
  listBranches,
  listShiftDefinitions,
  listBranchEmployees,
  scheduleShift,
  assignShift,
  confirmShiftAssignment,
  listBranchCategories,
  createSalesReport,
  listMyRecentReports,
  listBranchReports,
  listReconciliationQueue,
  overrideReconciliation,
  listInventoryItems,
  listStockBalances,
  listInventoryMovements,
  listLastCounts,
  listInventoryCounts,
  listBranchItemCosts,
  getInventoryGrossProfit,
  upsertInventoryItem,
  setInventoryItemActive,
  setInventoryItemCost,
  recordInventoryReceipt,
  recordInventoryWaste,
  recordInventoryAdjustment,
  reverseInventoryMovement,
  submitInventoryCount,
  voidInventoryCount,
} = api

export type {
  ShiftSummary,
  ShiftAssignmentSummary,
  ShiftDefinitionSummary,
  BranchOption,
  BranchEmployee,
} from '../supabase/shifts'
export type {
  CategoryOption,
  SalesReportSummary,
  CreateSalesReportInput,
  SalesReportItemInput,
} from '../supabase/sales'
export type {
  InventoryItem,
  StockBalance,
  InventoryMovementRow,
  LastCount,
  InventoryCountSummary,
  InventoryCountLine,
  ItemCostRow,
  GrossProfitResult,
  QuantityLine,
  WasteReasonCode,
  MutationResult,
} from '../supabase/inventory'

export type {
  BranchThresholds,
  CreateEmployeeInput,
  CreateEmployeeResult,
  ManagedEmployee,
  ManagementAuditEntry,
  MgmtResult,
  ShiftSettings,
} from '../supabase/management'
