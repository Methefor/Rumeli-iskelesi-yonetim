import { type InputHTMLAttributes, forwardRef, useId, useState } from 'react'
import fieldStyles from './Input.module.css'
import styles from './QuantityInput.module.css'

export interface QuantityInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'inputMode'
> {
  label?: string
  error?: string
  hint?: string
  /** Raw numeric value, or null when empty. Never a formatted string. */
  value: number | null
  onValueChange: (value: number | null) => void
  /** Shown as a suffix, e.g. "kg" / "adet". */
  unit?: string
  /** false = whole numbers only (no decimal separator, numeric keypad). */
  allowDecimal?: boolean
  /** Decimal places accepted (the database stores 3). */
  maxDecimals?: number
}

/**
 * Fast quantity entry: opens the numeric keypad on phones, accepts "," or "."
 * as the decimal separator, and keeps a plain number in state so nothing
 * downstream ever parses a formatted string.
 */
export const QuantityInput = forwardRef<HTMLInputElement, QuantityInputProps>(
  (
    {
      label,
      error,
      hint,
      id,
      value,
      onValueChange,
      unit,
      allowDecimal = true,
      maxDecimals = 3,
      className,
      ...rest
    },
    ref,
  ) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const [draft, setDraft] = useState(value === null ? '' : String(value))

    // The draft is what the user is typing (so "1." and "0," survive). It is
    // shown only while it still represents `value`; if the parent changes the
    // value to something else (a form reset, a prefill) the number wins.
    const draftRepresentsValue =
      value === null
        ? draft === '' || draft === '.'
        : draft !== '' && Number(draft) === value
    const shown = draftRepresentsValue ? draft : value === null ? '' : String(value)

    function handleChange(raw: string) {
      let cleaned = raw
        .replace(',', '.')
        .replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '')
      const firstDot = cleaned.indexOf('.')
      if (firstDot !== -1) {
        const whole = cleaned.slice(0, firstDot)
        const fraction = cleaned
          .slice(firstDot + 1)
          .replace(/\./g, '')
          .slice(0, maxDecimals)
        cleaned = `${whole}.${fraction}`
      }
      setDraft(cleaned)
      if (cleaned === '' || cleaned === '.') {
        onValueChange(null)
        return
      }
      const parsed = Number(cleaned)
      onValueChange(Number.isNaN(parsed) ? null : parsed)
    }

    return (
      <div className={fieldStyles.field}>
        {label && (
          <label className={fieldStyles.label} htmlFor={inputId}>
            {label}
          </label>
        )}
        <div className={styles.wrapper}>
          <input
            ref={ref}
            id={inputId}
            className={[
              fieldStyles.input,
              styles.input,
              unit ? styles.withUnit : '',
              error ? fieldStyles.inputError : '',
              className ?? '',
            ]
              .filter(Boolean)
              .join(' ')}
            inputMode={allowDecimal ? 'decimal' : 'numeric'}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            value={shown}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="0"
            {...rest}
          />
          {unit && (
            <span className={styles.unit} aria-hidden="true">
              {unit}
            </span>
          )}
        </div>
        {hint && !error && <span className={fieldStyles.hint}>{hint}</span>}
        {error && (
          <span className={fieldStyles.error} role="alert">
            {error}
          </span>
        )}
      </div>
    )
  },
)

QuantityInput.displayName = 'QuantityInput'
