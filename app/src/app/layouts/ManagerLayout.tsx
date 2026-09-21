import { AppShell, type NavItem } from '../../components/navigation/AppShell'
import { SelectedBranchProvider } from '../providers/SelectedBranchProvider'

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/app/manager', label: 'Genel Bakış', icon: 'grid', end: true },
  { to: '/app/manager/shifts', label: 'Vardiyalar', icon: 'clock' },
  { to: '/app/manager/reports', label: 'Satış', icon: 'receipt' },
  { to: '/app/manager/inventory', label: 'Stok', icon: 'box' },
  { to: '/app/manager/management', label: 'Yönetim', icon: 'sliders' },
]

/** Manager shell: branch switcher + identity + logout header, one responsive nav, routed page. */
export function ManagerLayout() {
  return (
    <SelectedBranchProvider>
      <AppShell navItems={NAV_ITEMS} allowBranchSwitch />
    </SelectedBranchProvider>
  )
}
