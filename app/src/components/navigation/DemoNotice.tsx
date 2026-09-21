import { useAuth } from '../../hooks/useAuth'
import styles from './DemoNotice.module.css'

/**
 * Shown only in Preview demo mode. Makes it impossible to mistake the
 * screens for production: every number here is synthetic sample data.
 */
export function DemoNotice() {
  const { isDemo } = useAuth()
  if (!isDemo) return null

  return (
    <div className={styles.notice} role="note">
      <strong>Demo / Önizleme.</strong> Bu ekrandaki tüm veriler sentetik örnek
      verilerdir; gerçek işletme verisi değildir.
    </div>
  )
}
