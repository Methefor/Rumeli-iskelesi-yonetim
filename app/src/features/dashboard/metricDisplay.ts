import type { MetricState } from '../../domain/dashboard'
import { fromKurus, type Kurus } from '../../domain/dashboard'
import { formatMoney } from '../../utils/format'

/** Turkish copy for a state that has no value at all — never a bare "-" and never a silent 0. */
const FALLBACK: Record<'unavailable' | 'not_applicable', string> = {
  unavailable: 'Veri yok',
  not_applicable: 'Takip edilmiyor',
}

/**
 * Renders any MetricState as plain text, applying `toText` only when a
 * value exists. Never returns "0" for an unavailable/not_applicable state —
 * and never the full `reason` sentence here, since this is meant for a
 * compact value slot (a StatCard, a comparison-row cell). The longer reason
 * belongs in a footnote/paragraph next to the card, not inside it.
 */
export function metricText<T>(state: MetricState<T>, toText: (value: T) => string): string {
  if (state.status === 'available' || state.status === 'partial') return toText(state.value)
  return FALLBACK[state.status]
}

export function metricMoneyText(state: MetricState<Kurus>): string {
  return metricText(state, (kurus) => formatMoney(fromKurus(kurus)))
}

export function metricIntText(state: MetricState<number>): string {
  return metricText(state, (n) => String(n))
}

/** "Kısmi" suffix shown next to a partial value; empty for every other status. */
export function partialSuffix<T>(state: MetricState<T>): string {
  return state.status === 'partial' ? ' · Kısmi' : ''
}

/**
 * Revenue text that never lets an X-only (provisional) reading pass as final revenue:
 *   finalized value        -> "₺9.600,00"
 *   some days without Z    -> "₺9.600,00 · Kısmi (+ geçici X ₺…)"
 *   only X so far          -> "Geçici (X): ₺…" (no finalized revenue yet)
 */
export function revenueText(state: MetricState<Kurus>, provisionalKurus: Kurus): string {
  const money = (k: Kurus) => formatMoney(fromKurus(k))
  if (state.status !== 'partial') return metricMoneyText(state)
  if (state.value === 0 && provisionalKurus > 0) return `Geçici (X): ${money(provisionalKurus)}`
  return `${money(state.value)} · Kısmi` + (provisionalKurus > 0 ? ` (+ geçici X ${money(provisionalKurus)})` : '')
}

/**
 * The big number and a small note for a revenue hero: the big number is only ever FINALIZED (Z) revenue.
 *   finalized                 -> "₺9.600,00"
 *   some days without Z       -> "₺9.600,00" + note "Kısmi · geçici X ₺… toplama dahil değil"
 *   nothing finalized yet     -> "Z bekleniyor" + note "Geçici (X): ₺…"
 */
export function revenueHero(state: MetricState<Kurus>, provisionalKurus: Kurus): { main: string; note: string | null } {
  const money = (k: Kurus) => formatMoney(fromKurus(k))
  if (state.status !== 'partial') return { main: metricMoneyText(state), note: null }
  if (state.value === 0 && provisionalKurus > 0) return { main: 'Z bekleniyor', note: `Geçici (X): ${money(provisionalKurus)}` }
  return { main: money(state.value), note: provisionalKurus > 0 ? `Kısmi · geçici X ${money(provisionalKurus)} toplama dahil değil` : 'Kısmi' }
}
