import { describe, expect, it } from 'vitest'
import { evaluateBackdatedEntry } from './backdatedPolicy'

const TODAY = '2026-09-22'

describe('evaluateBackdatedEntry', () => {
  it.each([
    ['2026-09-22', 0],
    ['2026-09-21', -1],
    ['2026-09-20', -2],
    ['2026-09-19', -3],
  ])('%s (today %d days ago) is within the normal window for every role', (date) => {
    for (const isOwnerOrManager of [true, false]) {
      const status = evaluateBackdatedEntry(date, isOwnerOrManager, TODAY)
      expect(status.withinNormalWindow).toBe(true)
      expect(status.isFuture).toBe(false)
      expect(status.deniedForRole).toBe(false)
      expect(status.requiresOverrideReason).toBe(false)
    }
  })

  it('2026-09-18 (-4 days): denied for a normal role, override-with-reason for owner/manager', () => {
    const normal = evaluateBackdatedEntry('2026-09-18', false, TODAY)
    expect(normal.withinNormalWindow).toBe(false)
    expect(normal.isFuture).toBe(false)
    expect(normal.deniedForRole).toBe(true)
    expect(normal.requiresOverrideReason).toBe(false)

    const privileged = evaluateBackdatedEntry('2026-09-18', true, TODAY)
    expect(privileged.withinNormalWindow).toBe(false)
    expect(privileged.deniedForRole).toBe(false)
    expect(privileged.requiresOverrideReason).toBe(true)
  })

  it('a future business date is always denied, even for owner/manager', () => {
    for (const isOwnerOrManager of [true, false]) {
      const status = evaluateBackdatedEntry('2026-09-23', isOwnerOrManager, TODAY)
      expect(status.isFuture).toBe(true)
      expect(status.withinNormalWindow).toBe(false)
      expect(status.requiresOverrideReason).toBe(false)
      expect(status.deniedForRole).toBe(false)
    }
  })

  it('is a calendar-date rule, not a rolling 72 hours', () => {
    // -3 days is allowed regardless of what time of day "today" is — the
    // function only ever sees yyyy-mm-dd strings, never a timestamp.
    expect(evaluateBackdatedEntry('2026-09-19', false, TODAY).withinNormalWindow).toBe(
      true,
    )
  })
})
