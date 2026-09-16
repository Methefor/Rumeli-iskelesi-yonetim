import type { ReactNode } from 'react'
import styles from './StatusChip.module.css'

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export interface StatusChipProps {
  children: ReactNode
  tone?: StatusTone
}

export function StatusChip({ children, tone = 'neutral' }: StatusChipProps) {
  return <span className={[styles.chip, styles[tone]].join(' ')}>{children}</span>
}
