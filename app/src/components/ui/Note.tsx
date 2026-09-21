import type { ReactNode } from 'react'
import styles from './Note.module.css'

/** Small supporting text (disclaimers, "why can't I edit this"). */
export function Note({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>
}
