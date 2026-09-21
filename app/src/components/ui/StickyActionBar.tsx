import type { ReactNode } from 'react'
import styles from './StickyActionBar.module.css'

/**
 * Keeps a form's primary action inside thumb reach: pinned just above the
 * bottom navigation on phones (and to the bottom of the viewport on
 * desktop, where the nav is a sidebar). Render it as the LAST child of a
 * form; the page adds bottom padding so nothing is hidden behind it.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return <div className={styles.bar}>{children}</div>
}
