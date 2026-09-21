import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './PageHeader.module.css'

export interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Renders a "← label" link above the title. */
  back?: { to: string; label: string }
  /** Right-aligned actions (buttons). Wraps below the title on narrow screens. */
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, back, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {back && (
        <Link to={back.to} className={styles.back}>
          <span aria-hidden="true">←</span> {back.label}
        </Link>
      )}
      <div className={styles.row}>
        <div className={styles.text}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </header>
  )
}
