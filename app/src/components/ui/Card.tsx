import { type HTMLAttributes, forwardRef } from 'react'
import styles from './Card.module.css'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean
  interactive?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ padded = true, interactive = false, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={[
        styles.card,
        padded ? styles.padded : '',
        interactive ? styles.interactive : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  ),
)

Card.displayName = 'Card'
