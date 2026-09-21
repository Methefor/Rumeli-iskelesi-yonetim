import { Link, type LinkProps } from 'react-router-dom'
import { buttonClassName, type ButtonSize, type ButtonVariant } from './buttonClassName'

export interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

/** A router link styled as a button — the semantically correct element for navigation actions. */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...rest}
    />
  )
}
