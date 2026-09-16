import { EmptyState } from '../ui/EmptyState'
import { StatusChip } from '../ui/StatusChip'
import styles from './RoutePlaceholder.module.css'

export interface RoutePlaceholderProps {
  title: string
  description: string
  icon?: string
}

/** Shared shell for a not-yet-implemented route — Phase B ships the route and layout, not the feature. */
export function RoutePlaceholder({
  title,
  description,
  icon = '🚧',
}: RoutePlaceholderProps) {
  return (
    <div className={styles.wrapper}>
      <StatusChip tone="info">Faz B — yer tutucu</StatusChip>
      <EmptyState icon={icon} title={title} description={description} />
    </div>
  )
}
