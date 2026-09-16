import type { CategoryAmounts } from './types'

/** Sums a category->amount map, treating missing/NaN values as 0. */
export function sumCategoryAmounts(categories: CategoryAmounts): number {
  return Object.values(categories).reduce((sum, value) => {
    const n = Number(value)
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
}

/**
 * Core X/Z accounting rule for a business day with a morning and evening
 * register reading (see BACKLOG.md / legacy audit):
 *
 *   morning revenue          = X
 *   evening incremental rev. = Z - X
 *
 * The evening reading (Z) is a cumulative register total that already
 * includes the morning's X total, so it must never be added on top of X —
 * this is the single shared implementation every screen must call instead
 * of re-deriving the subtraction itself.
 *
 * Returns 0 (not negative) if Z < X, since a register total going backwards
 * indicates a data-entry problem rather than negative revenue; callers
 * that need to flag that condition should compare xTotal/zTotal themselves.
 */
export function calculateEveningIncrement(xTotal: number, zTotal: number): number {
  const increment = zTotal - xTotal
  return increment > 0 ? increment : 0
}

export interface DailyRevenueInput {
  morningX: number | null
  eveningZ: number | null
}

/**
 * Total revenue for a business date given an optional morning (X) and
 * evening (Z) reading. Handles the three valid states: morning only,
 * evening only, or both.
 */
export function calculateDailyRevenue({ morningX, eveningZ }: DailyRevenueInput): number {
  const x = morningX ?? 0
  const z = eveningZ ?? 0

  if (morningX !== null && eveningZ !== null) {
    return x + calculateEveningIncrement(x, z)
  }
  if (morningX !== null) return x
  if (eveningZ !== null) return z
  return 0
}
