import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useSelectedBranch } from '../../hooks/useSelectedBranch'
import { primaryRoleLabel } from '../../utils/roles'
import { Icon, type IconName } from './icons'
import { DemoNotice } from './DemoNotice'
import styles from './AppShell.module.css'

export interface NavItem {
  to: string
  label: string
  icon: IconName
  /** Match only the exact path (for the index route). */
  end?: boolean
}

export interface AppShellProps {
  navItems: readonly NavItem[]
  /** Offer the branch switcher (org-wide roles). Employees just see their branch's name. */
  allowBranchSwitch?: boolean
}

/**
 * The single app frame for both layouts:
 *  - header: current branch (switchable for org-wide roles), who is signed
 *    in + role, a "Demo" chip in Preview demo mode, and a always-visible
 *    logout button;
 *  - ONE <nav>: a bottom bar on phones, a left sidebar on desktop (CSS only,
 *    so navigation is never duplicated in the DOM);
 *  - the routed page.
 */
export function AppShell({ navItems, allowBranchSwitch = false }: AppShellProps) {
  const { profile, roles, isDemo, signOut } = useAuth()
  const { branches, selectedBranch, selectedBranchId, setSelectedBranchId, canSwitch } =
    useSelectedBranch()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  const role = primaryRoleLabel(roles)
  const identity = [profile?.employeeCode, role].filter(Boolean).join(' · ')

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.identity}>
          {allowBranchSwitch && canSwitch ? (
            <select
              className={styles.branchSelect}
              aria-label="Şube seçimi"
              value={selectedBranchId ?? ''}
              onChange={(e) => setSelectedBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <span className={styles.branch}>
              {selectedBranch?.name ?? 'Rumeli Operasyon'}
            </span>
          )}
          <span className={styles.person}>
            {profile?.fullName ? `${profile.fullName} — ` : ''}
            {identity}
          </span>
        </div>
        <div className={styles.actions}>
          {isDemo && <span className={styles.demoChip}>Demo</span>}
          <button
            type="button"
            className={styles.logout}
            onClick={() => void handleSignOut()}
            aria-label="Çıkış yap"
          >
            <Icon name="logout" size={20} />
            <span className={styles.logoutLabel}>Çıkış</span>
          </button>
        </div>
      </header>

      <nav className={styles.nav} aria-label="Ana gezinme">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [styles.navItem, isActive ? styles.active : ''].filter(Boolean).join(' ')
            }
          >
            <Icon name={item.icon} />
            <span className={styles.navLabel}>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <main className={styles.main}>
        <div className={styles.content}>
          <DemoNotice />
          <Outlet />
        </div>
      </main>
    </div>
  )
}
