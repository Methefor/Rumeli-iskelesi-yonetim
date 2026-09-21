import type { ReactNode } from 'react'
import { Card } from './Card'
import styles from './RowCard.module.css'

export interface RowCardProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Small muted line under the subtitle. */
  meta?: ReactNode
  /** Right-aligned content (a StatusChip or a figure). */
  trailing?: ReactNode
  /** Extra content below the row (actions, forms). */
  children?: ReactNode
  onClick?: () => void
}

/** The standard list item: title + supporting lines on the left, status/figure on the right, optional body below. */
export function RowCard({
  title,
  subtitle,
  meta,
  trailing,
  children,
  onClick,
}: RowCardProps) {
  const content = (
    <>
      <div className={styles.row}>
        <div className={styles.text}>
          <div className={styles.title}>{title}</div>
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
          {meta && <div className={styles.meta}>{meta}</div>}
        </div>
        {trailing && <div className={styles.trailing}>{trailing}</div>}
      </div>
      {children && <div className={styles.body}>{children}</div>}
    </>
  )

  if (onClick) {
    return (
      <Card interactive className={styles.card}>
        <button type="button" className={styles.buttonRow} onClick={onClick}>
          {content}
        </button>
      </Card>
    )
  }
  return <Card className={styles.card}>{content}</Card>
}
