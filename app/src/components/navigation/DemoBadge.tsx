import { StatusChip } from '../ui/StatusChip'
import { useAuth } from '../../hooks/useAuth'
import styles from './DemoBadge.module.css'

/**
 * Small, non-intrusive "Demo / Preview" indicator shown only while the
 * current session is a synthetic demo login (AuthContext.isDemo) — never
 * shown for a real Supabase session, regardless of environment.
 */
export function DemoBadge() {
  const { isDemo } = useAuth()
  if (!isDemo) return null

  return (
    <div className={styles.badge}>
      <StatusChip tone="warning">Demo / Preview</StatusChip>
    </div>
  )
}
