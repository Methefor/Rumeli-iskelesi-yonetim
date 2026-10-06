import type { CostMetric } from '../../../domain/inventory/control'
import { formatMoney } from '../../../utils/format'

/**
 * Renders a database cost metric honestly: an unknown cost is NEVER shown as 0.
 *   available    -> the exact amount
 *   partial      -> "en az <amount>" + a note that some entries have no cost
 *   unavailable  -> "Maliyet yok" (no snapshot) or "Yetki yok" (caller may not see costs)
 */
export function CostMetricText({ metric }: { metric: CostMetric }) {
  if (metric.state === 'available') return <span>{formatMoney(metric.value ?? 0)}</span>
  if (metric.state === 'partial') {
    return (
      <span title="Bazı kayıtların maliyeti tanımlı değil; tutar yalnızca maliyeti olan kısmı kapsar.">
        en az {formatMoney(metric.value ?? 0)} <small>(eksik maliyet)</small>
      </span>
    )
  }
  return <span>{metric.reason === 'no_permission' ? 'Yetki yok' : 'Maliyet yok'}</span>
}
