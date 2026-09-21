import type { CSSProperties, HTMLAttributes } from 'react'
import styles from './Layout.module.css'

type Gap = 'xs' | 'sm' | 'md' | 'lg'

const GAP: Record<Gap, string> = {
  xs: 'var(--space-1)',
  sm: 'var(--space-2)',
  md: 'var(--space-4)',
  lg: 'var(--space-6)',
}

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: Gap
}

/** Vertical rhythm without one-off inline styles. */
export function Stack({ gap = 'md', className, style, ...rest }: StackProps) {
  return (
    <div
      className={[styles.stack, className ?? ''].filter(Boolean).join(' ')}
      style={{ '--gap': GAP[gap], ...style } as CSSProperties}
      {...rest}
    />
  )
}

export interface InlineProps extends HTMLAttributes<HTMLDivElement> {
  gap?: Gap
  align?: 'start' | 'center' | 'end' | 'between'
  wrap?: boolean
}

export function Inline({
  gap = 'sm',
  align = 'center',
  wrap = true,
  className,
  style,
  ...rest
}: InlineProps) {
  return (
    <div
      className={[
        styles.inline,
        styles[`align_${align}`],
        wrap ? styles.wrap : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--gap': GAP[gap], ...style } as CSSProperties}
      {...rest}
    />
  )
}

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /** Minimum column width before wrapping, in px. */
  min?: number
  gap?: Gap
}

/** Responsive auto-fit grid (e.g. stat cards): 2 columns on a 360px phone, more on wider screens. */
export function Grid({ min = 150, gap = 'sm', className, style, ...rest }: GridProps) {
  return (
    <div
      className={[styles.grid, className ?? ''].filter(Boolean).join(' ')}
      style={{ '--gap': GAP[gap], '--min': `${min}px`, ...style } as CSSProperties}
      {...rest}
    />
  )
}
