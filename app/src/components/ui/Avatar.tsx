import styles from './Avatar.module.css'

export type AvatarSize = 'sm' | 'md' | 'lg'

export interface AvatarProps {
  name: string
  src?: string | null
  size?: AvatarSize
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  const classes = [styles.avatar, styles[size]].join(' ')
  if (src) {
    return <img className={classes} src={src} alt={name} />
  }
  return (
    <div className={classes} role="img" aria-label={name}>
      {initials(name)}
    </div>
  )
}
