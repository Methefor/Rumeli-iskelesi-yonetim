import type { CategoryAmounts } from './types'

/** Sums a category->amount map, treating missing/NaN values as 0. */
export function sumCategoryAmounts(categories: CategoryAmounts): number {
  return Object.values(categories).reduce((sum, value) => {
    const n = Number(value)
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
}

/*
 * X/Z REVENUE RULE (binding, 2026-10): X = provisional reading, Z = final management revenue.
 * A day with a Z has final revenue = Z exactly (never normalized or increased by X; Z < X keeps Z).
 * A day with only an X has no final revenue (the X is provisional). X + Z is never revenue.
 * The rule is decided per BUSINESS DAY, not per shift, and lives in exactly two places that must agree:
 * `domain/dashboard/aggregate.ts` (computeBranchRevenueBreakdown) and `domain/analytics/engine.ts`
 * (computeDay), plus their SQL twin analytics_compute_day. The former `calculateDailyRevenue`
 * (X + max(0, Z - X)) and `deriveShiftRevenueFromReports` were removed because they contradicted this rule.
 */
