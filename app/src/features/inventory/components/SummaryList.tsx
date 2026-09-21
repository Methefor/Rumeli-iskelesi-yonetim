import type { ReactNode } from 'react'
import { Note } from '../../../components/ui'
import styles from './SummaryList.module.css'

export interface SummaryRow {
  key: string
  label: ReactNode
  value: ReactNode
  /** Emphasise (e.g. a line with a variance). */
  highlight?: boolean
}

/** A compact label/value list for confirmation sheets and result summaries. */
export function SummaryList({
  rows,
  footnote,
}: {
  rows: readonly SummaryRow[]
  footnote?: ReactNode
}) {
  return (
    <div className={styles.wrapper}>
      <dl className={styles.list}>
        {rows.map((row) => (
          <div
            key={row.key}
            className={[styles.row, row.highlight ? styles.highlight : '']
              .filter(Boolean)
              .join(' ')}
          >
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {footnote && <Note>{footnote}</Note>}
    </div>
  )
}
