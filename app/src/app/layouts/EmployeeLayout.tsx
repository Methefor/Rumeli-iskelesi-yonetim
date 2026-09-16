import { Outlet } from 'react-router-dom'
import { BottomNav, type BottomNavItem } from '../../components/navigation/BottomNav'
import styles from './AppLayout.module.css'

const navItems: BottomNavItem[] = [
  { to: '/app/employee', label: 'Ana Sayfa', icon: '🏠', end: true },
  { to: '/app/employee/shifts', label: 'Vardiyam', icon: '🕒' },
  { to: '/app/employee/tasks', label: 'Görevler', icon: '✅', disabled: true },
  { to: '/app/employee/performance', label: 'Performans', icon: '📈', disabled: true },
  { to: '/app/employee/profile', label: 'Profil', icon: '👤' },
]

/** Layout shell for employee-facing routes: content area + bottom nav. */
export function EmployeeLayout() {
  return (
    <div className={styles.layout}>
      <main className={styles.content}>
        <Outlet />
      </main>
      <BottomNav items={navItems} />
    </div>
  )
}
