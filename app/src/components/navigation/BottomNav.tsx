import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import styles from './BottomNav.module.css'

export interface BottomNavItem {
  to: string
  label: string
  icon: ReactNode
  disabled?: boolean
  end?: boolean
}

export interface BottomNavProps {
  items: BottomNavItem[]
}

/** Primary mobile navigation surface — fixed to the bottom edge, large touch targets. */
export function BottomNav({ items }: BottomNavProps) {
  return (
    <nav className={styles.nav} aria-label="Ana gezinme">
      {items.map((item) =>
        item.disabled ? (
          <span key={item.to} className={[styles.item, styles.disabled].join(' ')}>
            <span className={styles.icon} aria-hidden="true">
              {item.icon}
            </span>
            <span className={styles.label}>{item.label}</span>
          </span>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [styles.item, isActive ? styles.active : ''].filter(Boolean).join(' ')
            }
          >
            <span className={styles.icon} aria-hidden="true">
              {item.icon}
            </span>
            <span className={styles.label}>{item.label}</span>
          </NavLink>
        ),
      )}
    </nav>
  )
}
