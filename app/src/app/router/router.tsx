import { InventoryAuditPage } from '../../features/inventory/routes/InventoryAuditPage'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { EmployeeLayout } from '../layouts/EmployeeLayout'
import { ManagerLayout } from '../layouts/ManagerLayout'
import { LoginPage } from '../../features/auth/routes/LoginPage'
import { EmployeeHomePage } from '../../features/home/EmployeeHomePage'
import { ManagerHomePage } from '../../features/home/ManagerHomePage'
import { ManagementPage } from '../../features/home/ManagementPage'
import { ProfilePage } from '../../features/home/ProfilePage'
import { MyShiftPage } from '../../features/shifts/routes/MyShiftPage'
import { ShiftOverviewPage } from '../../features/shifts/routes/ShiftOverviewPage'
import { AssignShiftPage } from '../../features/shifts/routes/AssignShiftPage'
import { NewSalesReportPage } from '../../features/sales/routes/NewSalesReportPage'
import { MyRecentReportsPage } from '../../features/sales/routes/MyRecentReportsPage'
import { SalesOverviewPage } from '../../features/sales/routes/SalesOverviewPage'
import { ReconciliationQueuePage } from '../../features/sales/routes/ReconciliationQueuePage'
import { InventoryOverviewPage } from '../../features/inventory/routes/InventoryOverviewPage'
import { ReceiveStockPage } from '../../features/inventory/routes/ReceiveStockPage'
import { WasteEntryPage } from '../../features/inventory/routes/WasteEntryPage'
import { ClosingCountPage } from '../../features/inventory/routes/ClosingCountPage'
import { InventoryItemsPage } from '../../features/inventory/routes/InventoryItemsPage'
import { CostManagementPage } from '../../features/inventory/routes/CostManagementPage'
import { GrossProfitPage } from '../../features/inventory/routes/GrossProfitPage'
import { MovementHistoryPage } from '../../features/inventory/routes/MovementHistoryPage'
import { ProtectedRoute } from './guards/ProtectedRoute'
import { RoleGuard } from './guards/RoleGuard'

const MANAGER_ROLES = ['owner', 'manager', 'branch_manager']

export const router = createBrowserRouter([
  { path: '/', element: <LoginPage /> },
  {
    path: '/app/employee',
    element: (
      <ProtectedRoute>
        <EmployeeLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <EmployeeHomePage /> },
      { path: 'shifts', element: <MyShiftPage /> },
      { path: 'shifts/:shiftId/report', element: <NewSalesReportPage /> },
      {
        path: 'shifts/reports',
        element: <Navigate to="/app/employee/reports" replace />,
      },
      { path: 'reports', element: <MyRecentReportsPage /> },
      { path: 'inventory', element: <InventoryOverviewPage /> },
      { path: 'inventory/waste', element: <WasteEntryPage /> },
      { path: 'inventory/count', element: <ClosingCountPage /> },
      { path: 'inventory/movements', element: <MovementHistoryPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
  {
    path: '/app/manager',
    element: (
      <ProtectedRoute>
        <RoleGuard allow={MANAGER_ROLES}>
          <ManagerLayout />
        </RoleGuard>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <ManagerHomePage /> },
      { path: 'shifts', element: <ShiftOverviewPage /> },
      { path: 'shifts/assign', element: <AssignShiftPage /> },
      { path: 'reports', element: <SalesOverviewPage /> },
      { path: 'reports/reconciliation', element: <ReconciliationQueuePage /> },
      { path: 'inventory', element: <InventoryOverviewPage /> },
      { path: 'inventory/receive', element: <ReceiveStockPage /> },
      { path: 'inventory/waste', element: <WasteEntryPage /> },
      { path: 'inventory/count', element: <ClosingCountPage /> },
      { path: 'inventory/items', element: <InventoryItemsPage /> },
      { path: 'inventory/costs', element: <CostManagementPage /> },
      { path: 'inventory/profit', element: <GrossProfitPage /> },
      { path: 'inventory/movements', element: <MovementHistoryPage /> },
      {
        path: 'inventory/audit',
        element: (
          <RoleGuard allow={['owner', 'manager']}>
            <InventoryAuditPage />
          </RoleGuard>
        ),
      },
      { path: 'management', element: <ManagementPage /> },
      { path: 'branches', element: <Navigate to="/app/manager/management" replace /> },
      { path: 'employees', element: <Navigate to="/app/manager/management" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
