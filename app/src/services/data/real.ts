import * as shifts from '../supabase/shifts'
import * as sales from '../supabase/sales'
import * as inventory from '../supabase/inventory'

/**
 * The real, Supabase-backed data API. This object's TYPE is the contract
 * that the synthetic demo implementation (services/demo/api.ts) must
 * satisfy, so a screen can be written once and run against either.
 */
export const realApi = {
  // shifts
  listMyShiftAssignments: shifts.listMyShiftAssignments,
  listBranchShifts: shifts.listBranchShifts,
  listBranches: shifts.listBranches,
  listShiftDefinitions: shifts.listShiftDefinitions,
  listBranchEmployees: shifts.listBranchEmployees,
  scheduleShift: shifts.scheduleShift,
  assignShift: shifts.assignShift,
  confirmShiftAssignment: shifts.confirmShiftAssignment,
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
}

export type DataApi = typeof realApi
