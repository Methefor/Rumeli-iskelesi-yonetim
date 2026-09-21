import { Button } from './Button'
import styles from './ErrorState.module.css'

export interface ErrorStateProps {
  /** A Turkish, user-safe message (see services/errors) — never raw database text. */
  message: string
  onRetry?: () => void
  title?: string
}

export function ErrorState({
  message,
  onRetry,
  title = 'Bir sorun oluştu',
}: ErrorStateProps) {
  return (
    <div className={styles.container} role="alert">
      <div className={styles.icon} aria-hidden="true">
        ⚠️
      </div>
      <p className={styles.title}>{title}</p>
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Tekrar Dene
        </Button>
      )}
    </div>
  )
}
