import { EmptyState } from '../ui/EmptyState'
import { StatusChip } from '../ui/StatusChip'
import styles from './RoutePlaceholder.module.css'

export interface UnauthorizedProps {
  message?: string
}

/** Shown when an authenticated user's role/branch doesn't permit a route. */
export function Unauthorized({ message }: UnauthorizedProps) {
  return (
    <div className={styles.wrapper}>
      <StatusChip tone="danger">Erişim reddedildi</StatusChip>
      <EmptyState
        icon="🔒"
        title="Bu sayfayı görüntüleme yetkiniz yok"
        description={
          message ?? 'Bu işlem için gereken rol veya şube ataması hesabınızda bulunmuyor.'
        }
      />
    </div>
  )
}
