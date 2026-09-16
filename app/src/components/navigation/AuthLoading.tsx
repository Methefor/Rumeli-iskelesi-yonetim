import { Skeleton } from '../ui/Skeleton'
import styles from './AuthLoading.module.css'

/** Shown while the Supabase session is being restored, before we know authenticated/unauthenticated. */
export function AuthLoading() {
  return (
    <div
      className={styles.wrapper}
      role="status"
      aria-live="polite"
      aria-label="Oturum kontrol ediliyor"
    >
      <Skeleton height={20} width="60%" />
      <Skeleton height={48} />
      <Skeleton height={48} />
    </div>
  )
}
