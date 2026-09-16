import { type InputHTMLAttributes, forwardRef, useId, useState, useEffect } from 'react'
import styles from './Input.module.css'
import currencyStyles from './CurrencyInput.module.css'

export interface CurrencyInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  label?: string
  error?: string
  hint?: string
  /** Raw numeric value, or null when empty. Never a formatted string. */
  value: number | null
  onValueChange: (value: number | null) => void
  currencySymbol?: string
}

/**
 * Fast numeric entry field for money amounts (₺). Keeps a plain numeric
 * value in application state — all formatting is display-only, so this
 * never becomes a source of parsing bugs in revenue calculations.
 */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      label,
      error,
      hint,
      id,
      value,
      onValueChange,
      currencySymbol = '₺',
      className,
      ...rest
    },
    ref,
  ) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const [draft, setDraft] = useState(value === null ? '' : String(value))

    useEffect(() => {
      setDraft(value === null ? '' : String(value))
    }, [value])

    function handleChange(raw: string) {
      const normalized = raw.replace(',', '.').replace(/[^0-9.]/g, '')
      const parts = normalized.split('.')
      const safe =
        parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : normalized

      setDraft(safe)

      if (safe === '' || safe === '.') {
        onValueChange(null)
        return
      }
      const parsed = Number(safe)
      onValueChange(Number.isNaN(parsed) ? null : parsed)
    }

    return (
      <div className={styles.field}>
        {label && (
          <label className={styles.label} htmlFor={inputId}>
            {label}
          </label>
        )}
        <div className={currencyStyles.wrapper}>
          <span className={currencyStyles.symbol} aria-hidden="true">
            {currencySymbol}
          </span>
          <input
            ref={ref}
            id={inputId}
            className={[
              styles.input,
              currencyStyles.input,
              error ? styles.inputError : '',
              className ?? '',
            ]
              .filter(Boolean)
              .join(' ')}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="0.00"
            {...rest}
          />
        </div>
        {hint && !error && <span className={styles.hint}>{hint}</span>}
        {error && (
          <span className={styles.error} role="alert">
            {error}
          </span>
        )}
      </div>
    )
  },
)

CurrencyInput.displayName = 'CurrencyInput'
