import { WEEKDAY_SHORT } from '../labels'

/** Mobile-friendly ISO weekday toggles (1 = Pzt .. 7 = Paz). Empty selection = not configured (null). */
export function WeekdayPicker({ label, value, onChange }: { label: string; value: number[] | null; onChange: (next: number[] | null) => void }) {
  const selected = value ?? []
  const toggle = (day: number) => {
    const next = selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day].sort((a, b) => a - b)
    onChange(next.length ? next : null)
  }
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontSize: 'var(--font-size-sm, 0.875rem)', marginBottom: 4 }}>{label}</legend>
      <div role="group" aria-label={label} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {WEEKDAY_SHORT.map((name, i) => {
          const day = i + 1
          const on = selected.includes(day)
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(day)}
              style={{ minWidth: 44, minHeight: 44, borderRadius: 8, border: '1px solid currentColor', background: on ? 'var(--color-primary, #0a6)' : 'transparent', color: on ? '#fff' : 'inherit' }}
            >
              {name}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
