import { type SelectHTMLAttributes, forwardRef, useId } from 'react'
import fieldStyles from './Input.module.css'
import styles from './Select.module.css'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'children'
> {
  label?: string
  error?: string
  hint?: string
  options: readonly SelectOption[]
  /** Renders a first, empty "choose" option. */
  placeholder?: string
}

/** A native <select> (best mobile UX: the OS picker) with the same field chrome as Input. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, id, className, options, placeholder, ...rest }, ref) => {
    const generatedId = useId()
    const selectId = id ?? generatedId

    return (
      <div className={fieldStyles.field}>
        {label && (
          <label className={fieldStyles.label} htmlFor={selectId}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={[
            fieldStyles.input,
            styles.select,
            error ? fieldStyles.inputError : '',
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-invalid={error ? true : undefined}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
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

Select.displayName = 'Select'
