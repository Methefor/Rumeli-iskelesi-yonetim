import { useAuth } from '../../hooks/useAuth'
import { isDemoFixtureDataEnabled } from '../../services/supabase/env'
import styles from './DemoNotice.module.css'

/**
 * Shown only in Preview demo mode. Makes it impossible to mistake the
 * screens for production. Financial fixtures are disabled in the owner-facing
 * Preview unless an explicit development-only flag opts into them.
 */
export function DemoNotice() {
  const { isDemo } = useAuth()
  if (!isDemo) return null

  return (
    <div className={styles.notice} role="note">
      <strong>Demo / Önizleme.</strong>{' '}
      {isDemoFixtureDataEnabled
        ? 'Bu ekrandaki veriler sentetik örnek verilerdir; gerçek işletme verisi değildir.'
        : 'Finansal deneme verileri kaldırıldı. Gerçek işletme verileri yalnızca güvenli bağlantı tamamlandığında gösterilecek.'}
    </div>
  )
}
