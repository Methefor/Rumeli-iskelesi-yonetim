import { describe, expect, it } from 'vitest'
import { canAnalytics } from './permissions'
import { isoWeekday, isMonday, weekDates, weekStartOf } from './week'

describe('analytics permissions (UI visibility)', () => {
  it('owner and manager hold everything', () => {
    for (const role of ['owner', 'manager']) {
      for (const p of ['analytics.read', 'analytics.financial.read', 'analytics.ai.read', 'analytics.regenerate'] as const) {
        expect(canAnalytics([role], p)).toBe(true)
      }
    }
  })
  it('branch_manager reads but cannot regenerate', () => {
    expect(canAnalytics(['branch_manager'], 'analytics.financial.read')).toBe(true)
    expect(canAnalytics(['branch_manager'], 'analytics.ai.read')).toBe(true)
    expect(canAnalytics(['branch_manager'], 'analytics.regenerate')).toBe(false)
  })
  it('cashier, employee and viewer are denied by default', () => {
    for (const role of ['cashier', 'employee', 'viewer', 'unknown-role']) {
      expect(canAnalytics([role], 'analytics.read')).toBe(false)
    }
  })
})

describe('week helpers', () => {
  it('ISO weekday: Monday 1 .. Sunday 7', () => {
    expect(isoWeekday('2026-09-28')).toBe(1)
    expect(isoWeekday('2026-10-04')).toBe(7)
    expect(isoWeekday('2026-09-30')).toBe(3)
  })
  it('week start is the Monday of the ISO week, across a month boundary', () => {
    expect(weekStartOf('2026-10-04')).toBe('2026-09-28')
    expect(weekStartOf('2026-10-05')).toBe('2026-10-05')
    expect(isMonday('2026-10-05')).toBe(true)
    expect(weekDates('2026-09-28')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })
})
