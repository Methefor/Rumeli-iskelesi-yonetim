import styles from './Toast.module.css'

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger'

export interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

export interface ToastProps {
  toast: ToastItem
  onDismiss: (id: string) => void
}

export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div className={[styles.toast, styles[toast.tone]].join(' ')} role="status">
      <span className={styles.message}>{toast.message}</span>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => onDismiss(toast.id)}
        aria-label="Kapat"
      >
        ✕
      </button>
    </div>
  )
}
