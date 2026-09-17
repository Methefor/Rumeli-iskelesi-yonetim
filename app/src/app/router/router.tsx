import { createBrowserRouter, Navigate } from 'react-router-dom'
import { EmployeeLayout } from '../layouts/EmployeeLayout'
import { ManagerLayout } from '../layouts/ManagerLayout'
import { LoginPage } from '../../features/auth/routes/LoginPage'
import { BranchesPage } from '../../features/branches/routes/BranchesPage'
import { EmployeesPage } from '../../features/employees/routes/EmployeesPage'
import { ProfilePage } from '../../features/employees/routes/ProfilePage'
import { MyShiftPage } from '../../features/shifts/routes/MyShiftPage'
import { ShiftOverviewPage } from '../../features/shifts/routes/ShiftOverviewPage'
import { AssignShiftPage } from '../../features/shifts/routes/AssignShiftPage'
import { NewSalesReportPage } from '../../features/sales/routes/NewSalesReportPage'
import { MyRecentReportsPage } from '../../features/sales/routes/MyRecentReportsPage'
import { SalesOverviewPage } from '../../features/sales/routes/SalesOverviewPage'
import { ReconciliationQueuePage } from '../../features/sales/routes/ReconciliationQueuePage'
import { OverviewPage } from './pages/OverviewPage'
import { ManagementPage } from './pages/ManagementPage'
import { EmployeeHomePage } from './pages/EmployeeHomePage'
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
      { path: 'shifts/reports', element: <MyRecentReportsPage /> },
      { path: 'shifts/:shiftId/report', element: <NewSalesReportPage /> },
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
      { index: true, element: <OverviewPage /> },
      { path: 'branches', element: <BranchesPage /> },
      { path: 'employees', element: <EmployeesPage /> },
      { path: 'reports', element: <SalesOverviewPage /> },
      { path: 'reports/reconciliation', element: <ReconciliationQueuePage /> },
      { path: 'shifts', element: <ShiftOverviewPage /> },
      { path: 'shifts/assign', element: <AssignShiftPage /> },
      { path: 'management', element: <ManagementPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
