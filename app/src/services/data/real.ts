import { listInventoryAudit } from '../supabase/inventoryAudit'
import * as shifts from '../supabase/shifts'
import * as sales from '../supabase/sales'
import * as inventory from '../supabase/inventory'
import * as management from '../supabase/management'
import { getDataQuality } from '../supabase/dataQuality'
import { fetchBranchDashboardRaw } from '../supabase/dashboard'
import * as analytics from '../supabase/analytics'
import * as control from '../supabase/inventoryControl'
import * as procurement from '../supabase/procurement'
import { fetchDashboardRaws, getBranchOperationsSignals, getCommandCenterSignals } from '../supabase/commandCenter'

/**
 * The real, Supabase-backed data API. This object's TYPE is the contract
 * that the synthetic demo implementation (services/demo/api.ts) must
 * satisfy, so a screen can be written once and run against either.
 */
export const realApi = {
  listInventoryAudit,
  // shifts
  listMyShiftAssignments: shifts.listMyShiftAssignments,
  listMyShiftChangeRequests: shifts.listMyShiftChangeRequests,
  listBranchShiftChangeRequests: shifts.listBranchShiftChangeRequests,
  listBranchShifts: shifts.listBranchShifts,
  listBranches: shifts.listBranches,
  listShiftDefinitions: shifts.listShiftDefinitions,
  listBranchEmployees: shifts.listBranchEmployees,
  scheduleShift: shifts.scheduleShift,
  assignShift: shifts.assignShift,
  confirmShiftAssignment: shifts.confirmShiftAssignment,
  createShiftChangeRequest: shifts.createShiftChangeRequest,
  decideShiftChangeRequest: shifts.decideShiftChangeRequest,
  // sales
  listBranchCategories: sales.listBranchCategories,
  createSalesReport: sales.createSalesReport,
  listMyRecentReports: sales.listMyRecentReports,
  listBranchReports: sales.listBranchReports,
  listReconciliationQueue: sales.listReconciliationQueue,
  overrideReconciliation: sales.overrideReconciliation,
  // inventory
  listInventoryItems: inventory.listInventoryItems,
  listStockBalances: inventory.listStockBalances,
  listInventoryMovements: inventory.listInventoryMovements,
  listLastCounts: inventory.listLastCounts,
  listInventoryCounts: inventory.listInventoryCounts,
  listBranchItemCosts: inventory.listBranchItemCosts,
  getInventoryGrossProfit: inventory.getInventoryGrossProfit,
  upsertInventoryItem: inventory.upsertInventoryItem,
  setInventoryItemActive: inventory.setInventoryItemActive,
  setInventoryItemCost: inventory.setInventoryItemCost,
  recordInventoryReceipt: inventory.recordInventoryReceipt,
  recordInventoryWaste: inventory.recordInventoryWaste,
  recordInventoryAdjustment: inventory.recordInventoryAdjustment,
  reverseInventoryMovement: inventory.reverseInventoryMovement,
  submitInventoryCount: inventory.submitInventoryCount,
  voidInventoryCount: inventory.voidInventoryCount,
  // management center
  listEmployees: management.listEmployees,
  createEmployee: management.createEmployee,
  setEmployeeActive: management.setEmployeeActive,
  resetEmployeePin: management.resetEmployeePin,
  setEmployeeCode: management.setEmployeeCode,
  assignEmployeeRole: management.assignEmployeeRole,
  revokeEmployeeRole: management.revokeEmployeeRole,
  assignEmployeeBranch: management.assignEmployeeBranch,
  removeEmployeeBranch: management.removeEmployeeBranch,
  listShiftSettings: management.listShiftSettings,
  updateShiftSettings: management.updateShiftSettings,
  getReconciliationThresholds: management.getReconciliationThresholds,
  setReconciliationThresholds: management.setReconciliationThresholds,
  listManagementAudit: management.listManagementAudit,
  getDataQuality,
  fetchBranchDashboardRaw,
  // analytics (read-only snapshots + audited regeneration)
  getDailyAnalytics: analytics.getDailyAnalytics,
  getWeeklyAnalytics: analytics.getWeeklyAnalytics,
  listAnalyticsInsights: analytics.listAnalyticsInsights,
  regenerateDailyAnalytics: analytics.regenerateDailyAnalytics,
  regenerateWeeklyAnalytics: analytics.regenerateWeeklyAnalytics,
  getAnalyticsReport: analytics.getAnalyticsReport,
  // inventory control: fire reasons, fire report, closing-count review, branch location
  listWasteReasons: control.listWasteReasons,
  upsertWasteReason: control.upsertWasteReason,
  setWasteReasonActive: control.setWasteReasonActive,
  getWasteReport: control.getWasteReport,
  getInventoryCountReview: control.getInventoryCountReview,
  getBranchCountOverview: control.getBranchCountOverview,
  listBranchLocations: control.listBranchLocations,
  updateBranchLocation: control.updateBranchLocation,
  // procurement: suppliers, supply parameters, purchase orders, receiving, suggestions
  listSuppliers: procurement.listSuppliers,
  upsertSupplier: procurement.upsertSupplier,
  setSupplierActive: procurement.setSupplierActive,
  listSupplyParams: procurement.listSupplyParams,
  upsertSupplyParams: procurement.upsertSupplyParams,
  listPurchaseOrders: procurement.listPurchaseOrders,
  getPurchaseOrder: procurement.getPurchaseOrder,
  createPurchaseOrder: procurement.createPurchaseOrder,
  replacePurchaseOrderLines: procurement.replacePurchaseOrderLines,
  updatePurchaseOrderHeader: procurement.updatePurchaseOrderHeader,
  transitionPurchaseOrder: procurement.transitionPurchaseOrder,
  receivePurchaseOrder: procurement.receivePurchaseOrder,
  getOrderSuggestions: procurement.getOrderSuggestions,
  getProcurementAttention: procurement.getProcurementAttention,
  // command center read model (one call per branch)
  getBranchOperationsSignals,
  // batch read models: constant request count regardless of the number of branches
  fetchDashboardRaws,
  getCommandCenterSignals,
}

export type DataApi = typeof realApi
