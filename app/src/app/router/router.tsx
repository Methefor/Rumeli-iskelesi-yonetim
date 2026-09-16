import { createBrowserRouter, Navigate } from 'react-router-dom'
import { EmployeeLayout } from '../layouts/EmployeeLayout'
import { ManagerLayout } from '../layouts/ManagerLayout'
import { LoginPage } from '../../features/auth/routes/LoginPage'
import { BranchesPage } from '../../features/branches/routes/BranchesPage'
import { EmployeesPage } from '../../features/employees/routes/EmployeesPage'
import { ProfilePage } from '../../features/employees/routes/ProfilePage'
import { ShiftsPage } from '../../features/shifts/routes/ShiftsPage'
import { ReportsPage } from '../../features/reports/routes/ReportsPage'
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
      { path: 'shifts', element: <ShiftsPage /> },
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
      { path: 'reports', element: <ReportsPage /> },
      { path: 'management', element: <ManagementPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
