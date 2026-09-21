import styles from './SegmentedControl.module.css'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
}

/** A small radio group rendered as equal-width buttons — the mobile-friendly way to pick 2–4 mutually exclusive options. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={[styles.segment, selected ? styles.selected : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
