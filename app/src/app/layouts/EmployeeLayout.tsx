import { AppShell, type NavItem } from '../../components/navigation/AppShell'
import { canInventory } from '../../domain/inventory'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../hooks/useAuth'
import { useSelectedBranch } from '../../hooks/useSelectedBranch'
import { listInventoryItems } from '../../services/data'
import { SelectedBranchProvider } from '../providers/SelectedBranchProvider'

function EmployeeShell() {
  const { roles } = useAuth()
  const { selectedBranchId } = useSelectedBranch()

  // The Stok tab only appears for a branch that actually tracks inventory
  // (has at least one item) and a role that may read it — a Rumeli cashier
  // is not shown an empty stock screen.
  const mayRead = canInventory(roles, 'inventory.read')
  const { data: items } = useAsync(
    mayRead && selectedBranchId ? `tracks-inventory:${selectedBranchId}` : null,
    () => (selectedBranchId ? listInventoryItems(selectedBranchId) : Promise.resolve([])),
  )
  const tracksInventory = (items?.length ?? 0) > 0

  const navItems: NavItem[] = [
    { to: '/app/employee', label: 'Ana Sayfa', icon: 'home', end: true },
    { to: '/app/employee/shifts', label: 'Vardiyam', icon: 'clock' },
    ...(tracksInventory
      ? [{ to: '/app/employee/inventory', label: 'Stok', icon: 'box' } as const]
      : []),
    { to: '/app/employee/reports', label: 'Raporlarım', icon: 'receipt' },
    { to: '/app/employee/profile', label: 'Profil', icon: 'user' },
  ]

  return <AppShell navItems={navItems} />
}

/** Employee shell: identity + logout header, one responsive nav, routed page. */
export function EmployeeLayout() {
  return (
    <SelectedBranchProvider>
      <EmployeeShell />
    </SelectedBranchProvider>
  )
}
