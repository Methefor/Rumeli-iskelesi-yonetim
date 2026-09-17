import { Outlet } from 'react-router-dom'
import { BottomNav, type BottomNavItem } from '../../components/navigation/BottomNav'
import { DemoBadge } from '../../components/navigation/DemoBadge'
import styles from './AppLayout.module.css'

const navItems: BottomNavItem[] = [
  { to: '/app/manager', label: 'Genel Bakış', icon: '📊', end: true },
  { to: '/app/manager/branches', label: 'Şubeler', icon: '🏬' },
  { to: '/app/manager/employees', label: 'Çalışanlar', icon: '👥' },
  { to: '/app/manager/reports', label: 'Raporlar', icon: '🧾' },
  { to: '/app/manager/management', label: 'Yönetim', icon: '⚙️' },
]

/** Layout shell for manager-facing routes: content area + bottom nav. */
export function ManagerLayout() {
  return (
    <div className={styles.layout}>
      <DemoBadge />
      <main className={styles.content}>
        <Outlet />
      </main>
      <BottomNav items={navItems} />
    </div>
  )
}
