import { useEffect } from 'react'
import { AppShell, type NavItem } from '../../components/navigation/AppShell'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../hooks/useAuth'
import { listBranches, listBranchShiftChangeRequests } from '../../services/data'
import { SelectedBranchProvider } from '../providers/SelectedBranchProvider'

/** Manager shell: branch switcher + identity + logout header, one responsive nav, routed page. */
export function ManagerLayout() {
  const { user } = useAuth()
  const pending = useAsync(
    user ? `manager-pending-shifts:${user.id}` : null,
    async () => {
      const branches = await listBranches()
      const requests = await Promise.all(
        branches.map((branch) => listBranchShiftChangeRequests(branch.id)),
      )
      return new Set(
        requests
          .flat()
          .filter((request) => request.status === 'pending')
          .map((request) => request.id),
      ).size
    },
  )
  const reloadPending = pending.reload

  useEffect(() => {
    const reload = () => reloadPending()
    window.addEventListener('shift-requests-changed', reload)
    return () => window.removeEventListener('shift-requests-changed', reload)
  }, [reloadPending])

  const navItems: readonly NavItem[] = [
    { to: '/app/manager', label: 'Genel Bakış', icon: 'grid', end: true },
    {
      to: '/app/manager/shifts',
      label: 'Vardiyalar',
      icon: 'clock',
      badge: pending.data ?? 0,
    },
    { to: '/app/manager/reports', label: 'Satış', icon: 'receipt' },
    { to: '/app/manager/inventory', label: 'Stok', icon: 'box' },
    { to: '/app/manager/management', label: 'Yönetim', icon: 'sliders' },
  ]

  return (
    <SelectedBranchProvider>
      <AppShell navItems={navItems} allowBranchSwitch />
    </SelectedBranchProvider>
  )
}
