import type { ReconciliationStatus } from './types'

/**
 * Where a sales report came from. `legacy_import` = created by the audited legacy
 * migration (it has a lineage link); everything else is `native` V4 work.
 */
export type ReportOrigin = 'native' | 'legacy_import'

/** active = operational work for today's managers; historical = imported legacy findings. */
export type ReconciliationScope = 'active' | 'historical'

export interface QueueCandidate {
  status: string
  reconciliationStatus: ReconciliationStatus
  origin?: ReportOrigin
}

/**
 * A report needs reconciliation attention when it is not cancelled and its stored
 * status is WARNING/ERROR. The status itself is NEVER changed here: historical imported
 * findings keep their ERROR/WARNING; they are only kept out of the DEFAULT (active)
 * operational queue and remain retrievable through the historical scope.
 */
export function inReconciliationQueue(report: QueueCandidate, scope: ReconciliationScope): boolean {
  if (report.status === 'cancelled' || report.reconciliationStatus === 'OK') return false
  const imported = report.origin === 'legacy_import'
  return scope === 'historical' ? imported : !imported
}
