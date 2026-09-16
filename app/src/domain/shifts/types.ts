export interface ShiftTimingRule {
  shiftKey: string
  cutoffHour: number
  cutoffMinute: number
  /** 0 = same calendar day as the business date, 1 = the next calendar day (a cutoff past midnight). */
  cutoffDayOffset: 0 | 1
}
