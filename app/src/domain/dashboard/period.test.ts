import { describe, expect, it } from 'vitest'
import { resolveCustomPeriod, resolveDashboardPeriod, validateCustomRange } from './period'

describe('resolveDashboardPeriod', () => {
  it('today is exactly one Istanbul calendar day', () => {
    const p = resolveDashboardPeriod('today', new Date('2027-06-15T10:00:00+03:00'))
    expect(p.fromDate).toBe('2027-06-15')
    expect(p.toDateInclusive).toBe('2027-06-15')
    expect(p.days).toBe(1)
    expect(p.fromInstant).toBe('2027-06-14T21:00:00.000Z') // Istanbul 00:00 = UTC 21:00 the previous day (UTC+3, no DST)
  })

  it('7d and 30d cover exactly 7 / 30 Istanbul calendar days ending today', () => {
    const now = new Date('2027-06-15T10:00:00+03:00')
    const p7 = resolveDashboardPeriod('7d', now)
    const p30 = resolveDashboardPeriod('30d', now)
    expect(p7.fromDate).toBe('2027-06-09')
    expect(p7.toDateInclusive).toBe('2027-06-15')
    expect(p7.days).toBe(7)
    expect(p30.fromDate).toBe('2027-05-17')
    expect(p30.toDateInclusive).toBe('2027-06-15')
    expect(p30.days).toBe(30)
  })

  it('the instant range is a right-open interval spanning exactly `days` x 24h', () => {
    const p = resolveDashboardPeriod('7d', new Date('2027-06-15T10:00:00+03:00'))
    const spanMs = new Date(p.toInstantExclusive).getTime() - new Date(p.fromInstant).getTime()
    expect(spanMs).toBe(7 * 86_400_000)
  })

  it('gives the identical Istanbul business date no matter which timezone the input instant is expressed in', () => {
    // All four represent slightly different UTC instants but the same Istanbul calendar day (2027-06-15).
    const utc = new Date('2027-06-15T10:00:00Z')
    const nyc = new Date('2027-06-15T04:00:00-04:00') // 11:00 Istanbul
    const tokyo = new Date('2027-06-15T17:00:00+09:00') // 11:00 Istanbul
    const istanbul = new Date('2027-06-15T13:00:00+03:00')
    for (const now of [utc, nyc, tokyo, istanbul]) {
      expect(resolveDashboardPeriod('today', now).fromDate).toBe('2027-06-15')
    }
  })

  it('a late-evening New York instant that is already the next Istanbul day resolves to the NEXT day', () => {
    // 2027-06-15 23:30 New York (UTC-4) = 2027-06-16 06:30 Istanbul.
    const now = new Date('2027-06-15T23:30:00-04:00')
    expect(resolveDashboardPeriod('today', now).fromDate).toBe('2027-06-16')
  })

  it('an early-morning Tokyo instant that is still the previous Istanbul day resolves to the PREVIOUS day', () => {
    // 2027-06-16 05:00 Tokyo (UTC+9) = 2027-06-15 23:00 Istanbul.
    const now = new Date('2027-06-16T05:00:00+09:00')
    expect(resolveDashboardPeriod('today', now).fromDate).toBe('2027-06-15')
  })

  it('crosses a month boundary correctly (30d from 2027-01-10)', () => {
    const p = resolveDashboardPeriod('30d', new Date('2027-01-10T12:00:00+03:00'))
    expect(p.fromDate).toBe('2026-12-12')
    expect(p.toDateInclusive).toBe('2027-01-10')
    expect(p.days).toBe(30)
  })

  it('crosses a year boundary correctly (7d from 2027-01-02)', () => {
    const p = resolveDashboardPeriod('7d', new Date('2027-01-02T12:00:00+03:00'))
    expect(p.fromDate).toBe('2026-12-27')
    expect(p.toDateInclusive).toBe('2027-01-02')
  })
})

describe('validateCustomRange / resolveCustomPeriod', () => {
  const now = new Date('2027-06-15T10:00:00+03:00')

  it('rejects a reversed range, a future end date, and a malformed date', () => {
    expect(validateCustomRange('2027-06-15', '2027-06-01', now)).toMatch(/başlangıç/i)
    expect(validateCustomRange('2027-06-01', '2027-07-01', now)).toMatch(/gelecek/i)
    expect(validateCustomRange('15-06-2027', '2027-06-15', now)).toMatch(/geçersiz/i)
  })

  it('accepts a valid past range and resolves the same shared period shape', () => {
    expect(validateCustomRange('2027-06-01', '2027-06-10', now)).toBeNull()
    const p = resolveCustomPeriod('2027-06-01', '2027-06-10')
    expect(p.kind).toBe('custom')
    expect(p.days).toBe(10)
  })

  it('a single-day custom range equals a 1-day period', () => {
    const p = resolveCustomPeriod('2027-06-15', '2027-06-15')
    expect(p.days).toBe(1)
  })
})
