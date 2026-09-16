import type { ReactNode } from 'react'
import { Card } from './Card'
import styles from './StatCard.module.css'

export type StatTrend = 'up' | 'down' | 'flat'

export interface StatCardProps {
  label: string
  value: ReactNode
  trend?: StatTrend
  changeLabel?: string
  icon?: ReactNode
}

const trendSign: Record<StatTrend, string> = { up: '▲', down: '▼', flat: '·' }

export function StatCard({ label, value, trend, changeLabel, icon }: StatCardProps) {
  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {icon && <span className={styles.icon}>{icon}</span>}
      </div>
      <div className={styles.value}>{value}</div>
      {trend && changeLabel && (
        <div className={[styles.change, styles[trend]].join(' ')}>
          <span aria-hidden="true">{trendSign[trend]}</span> {changeLabel}
        </div>
      )}
    </Card>
  )
}
