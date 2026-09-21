export interface ClosingInputs {
  salesReportSubmitted: boolean
  /** Number of waste entries recorded for the shift (informational — see below). */
  wasteEntries: number
  countSubmitted: boolean
}

export interface ClosingStep {
  key: 'sales' | 'count' | 'waste'
  label: string
  done: boolean
  /** An optional step never blocks completion. */
  optional: boolean
}

export interface ClosingStatus {
  steps: ClosingStep[]
  /** Required steps done. */
  complete: boolean
  doneCount: number
  requiredCount: number
}

/**
 * Bounded closing workflow for a shift (NOT a task-management system):
 *  - sales report submitted   REQUIRED
 *  - physical count submitted REQUIRED
 *  - waste recorded           OPTIONAL — a day with no waste is normal and
 *    the system stores no "nothing to report" confirmation, so requiring
 *    waste entries would either block honest closes or invite fake ones.
 */
export function deriveClosingStatus(input: ClosingInputs): ClosingStatus {
  const steps: ClosingStep[] = [
    {
      key: 'sales',
      label: 'Satış raporu gönderildi',
      done: input.salesReportSubmitted,
      optional: false,
    },
    {
      key: 'count',
      label: 'Kapanış sayımı yapıldı',
      done: input.countSubmitted,
      optional: false,
    },
    {
      key: 'waste',
      label: 'Fire kaydı girildi (varsa)',
      done: input.wasteEntries > 0,
      optional: true,
    },
  ]
  const required = steps.filter((s) => !s.optional)
  const doneCount = required.filter((s) => s.done).length
  return {
    steps,
    complete: doneCount === required.length,
    doneCount,
    requiredCount: required.length,
  }
}
