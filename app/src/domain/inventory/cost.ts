import type { CostRecord } from './types'

const MAX_FUTURE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * The unit cost in effect at `at`: the record with the greatest
 * effectiveFrom <= at. Returns null when no cost had been set yet — callers
 * must treat that as UNKNOWN cost, never as zero.
 */
export function effectiveCostAt(
  costs: readonly CostRecord[],
  at: string | Date,
): number | null {
  const atMs = typeof at === 'string' ? Date.parse(at) : at.getTime()
  let best: CostRecord | null = null
  let bestMs = -Infinity
  for (const cost of costs) {
    const ms = Date.parse(cost.effectiveFrom)
    if (ms <= atMs && ms > bestMs) {
      best = cost
      bestMs = ms
    }
  }
  return best ? best.unitCost : null
}

export type CostValidation =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'negative' | 'precision' | 'not_later' | 'too_far' }

/**
 * Client-side mirror of the server's cost rules (inventory_set_cost_internal,
 * 014) for instant form feedback. The server remains authoritative.
 */
export function validateNewCost(
  existing: readonly CostRecord[],
  candidate: { unitCost: number; effectiveFrom: string },
  now: Date,
): CostValidation {
  if (!Number.isFinite(candidate.unitCost)) return { ok: false, reason: 'invalid' }
  if (candidate.unitCost < 0) return { ok: false, reason: 'negative' }
  if (Math.round(candidate.unitCost * 10000) / 10000 !== candidate.unitCost) {
    return { ok: false, reason: 'precision' }
  }

  const effectiveMs = Date.parse(candidate.effectiveFrom)
  if (Number.isNaN(effectiveMs)) return { ok: false, reason: 'invalid' }
  if (effectiveMs > now.getTime() + MAX_FUTURE_MS) return { ok: false, reason: 'too_far' }

  const latestMs = existing.reduce(
    (max, c) => Math.max(max, Date.parse(c.effectiveFrom)),
    -Infinity,
  )
  if (existing.length > 0 && effectiveMs <= latestMs)
    return { ok: false, reason: 'not_later' }

  return { ok: true }
}

export interface CostHistoryEntry extends CostRecord {
  /** The cost in effect right now. */
  isCurrent: boolean
  /** Set in advance; not effective yet. */
  isScheduled: boolean
}

/** Newest first, marking which row is current / scheduled. History is never edited — this is display shaping only. */
export function buildCostHistory(
  costs: readonly CostRecord[],
  now: Date,
): CostHistoryEntry[] {
  const sorted = [...costs].sort(
    (a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom),
  )
  const currentRow =
    sorted.find((c) => Date.parse(c.effectiveFrom) <= now.getTime()) ?? null
  return sorted.map((c) => ({
    ...c,
    isScheduled: Date.parse(c.effectiveFrom) > now.getTime(),
    isCurrent: currentRow !== null && c === currentRow,
  }))
}
