import type { BranchSignals } from '../commandCenter'
import type { ProcurementAttention } from '../procurement'
import { unsupportedFact, type EvidenceBook, type LimitationBook } from './support'
import type { BranchRef, ProcurementFacts, Support } from './types'

/**
 * Procurement facts from the EXISTING `get_procurement_attention` read model (carried by the Command Center signals). It is a
 * current-state model: it is only used when the report covers "now" (today / the current week); there is no order logic here and
 * nothing is ever ordered automatically.
 */
export function buildProcurementFacts(
  book: EvidenceBook,
  limits: LimitationBook,
  branches: readonly BranchRef[],
  signals: Record<string, BranchSignals | null> | null,
  enabled: boolean,
  disabledReason: string,
): ProcurementFacts {
  const none = (reason: string): ProcurementFacts => ({
    state: 'unavailable',
    reason,
    awaitingApproval: unsupportedFact(reason),
    dueToday: unsupportedFact(reason),
    overdue: unsupportedFact(reason),
    partiallyReceived: unsupportedFact(reason),
    receiptWarnings: unsupportedFact(reason),
    lowStockNoOpenOrder: unsupportedFact(reason),
  })
  if (!enabled) return none(disabledReason)
  if (!signals) {
    limits.add('source_unavailable')
    return none('source_unavailable')
  }
  const avail: ProcurementAttention[] = []
  let denied = 0
  for (const b of branches) {
    const p = signals[b.id]?.procurement
    if (p && p.state === 'available') avail.push(p.data)
    else if (p && p.reason === 'no_permission') denied += 1
  }
  if (avail.length === 0) {
    // procurement is its own domain: without its permission the report says so (it never borrows access from analytics.read)
    const reason = denied > 0 && denied === branches.length ? 'no_permission' : 'source_unavailable'
    limits.add(reason)
    return none(reason)
  }
  const support: Support = avail.length === branches.length ? 'complete' : 'partial'
  if (support === 'partial') limits.add(denied > 0 ? 'no_permission' : 'source_unavailable')
  const n = (ref: string, label: string, pick: (p: ProcurementAttention) => number) =>
    book.fact(ref, avail.reduce((s, p) => s + pick(p), 0), 'count', label, support, support === 'partial' ? ['not_all_branches'] : [])
  return {
    state: 'available',
    awaitingApproval: n('procurement.awaitingApproval', 'Onay bekleyen sipariş', (p) => p.awaitingApproval.length),
    dueToday: n('procurement.dueToday', 'Bugün teslimi beklenen sipariş', (p) => p.dueToday.length),
    overdue: n('procurement.overdue', 'Teslimi geciken sipariş', (p) => p.overdueDelivery.length),
    partiallyReceived: n('procurement.partiallyReceived', 'Kısmen teslim alınan sipariş', (p) => p.partiallyReceived.length),
    receiptWarnings: n('procurement.receiptWarnings', 'Stok kaydıyla uyuşmayan teslimat', (p) => p.reconciliationWarnings.length),
    lowStockNoOpenOrder: n('procurement.lowStockNoOpenOrder', 'Stoğu az, açık siparişi olmayan ürün', (p) => p.lowStockNoOpenOrder.length),
  }
}
