import styles from './Skeleton.module.css'

export interface SkeletonProps {
  width?: string | number
  height?: string | number
  radius?: string
  className?: string
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius,
  className,
}: SkeletonProps) {
  return (
    <span
      className={[styles.skeleton, className ?? ''].filter(Boolean).join(' ')}
      style={{
        width,
        height,
        borderRadius: radius ?? 'var(--radius-sm)',
      }}
      aria-hidden="true"
    />
  )
}
