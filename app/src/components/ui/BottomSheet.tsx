import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import styles from './BottomSheet.module.css'

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/** Mobile-first sheet anchored to the bottom edge — the primary modal
 * pattern for phone-width screens, per the mobile-first navigation spec. */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.grabber} aria-hidden="true" />
        {title && <h2 className={styles.title}>{title}</h2>}
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
