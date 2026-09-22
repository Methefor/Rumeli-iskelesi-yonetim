import { describe, expect, it } from 'vitest'
import { evaluateOnTime } from './evaluateOnTime'
import type { ShiftTimingRule } from './types'

const morningRule: ShiftTimingRule = {
  shiftKey: 'sabah',
  cutoffHour: 17,
  cutoffMinute: 30,
  cutoffDayOffset: 0,
}

const eveningRule: ShiftTimingRule = {
  shiftKey: 'aksam',
  cutoffHour: 1,
  cutoffMinute: 0,
  cutoffDayOffset: 1,
}

describe('evaluateOnTime', () => {
  it('is on-time exactly at the cutoff', () => {
    const submittedAt = new Date('2027-06-15T17:30:00+03:00')
    expect(
      evaluateOnTime({
        rule: morningRule,
        businessDate: '2027-06-15',
        submittedAt,
        isBackdated: false,
      }),
    ).toBe(true)
  })

  it('is late one minute after the cutoff', () => {
    const submittedAt = new Date('2027-06-15T17:31:00+03:00')
    expect(
      evaluateOnTime({
        rule: morningRule,
        businessDate: '2027-06-15',
        submittedAt,
        isBackdated: false,
      }),
    ).toBe(false)
  })

  it('supports a cutoff that rolls past midnight, on-time just after midnight', () => {
    const submittedAt = new Date('2027-06-16T00:45:00+03:00')
    expect(
      evaluateOnTime({
        rule: eveningRule,
        businessDate: '2027-06-15',
        submittedAt,
        isBackdated: false,
      }),
    ).toBe(true)
  })

  it('is late once the post-midnight cutoff has actually passed', () => {
    const submittedAt = new Date('2027-06-16T02:00:00+03:00')
    expect(
      evaluateOnTime({
        rule: eveningRule,
        businessDate: '2027-06-15',
        submittedAt,
        isBackdated: false,
      }),
    ).toBe(false)
  })

  it('is never on-time for a backdated entry', () => {
    const submittedAt = new Date('2027-06-15T10:00:00+03:00')
    expect(
      evaluateOnTime({
        rule: morningRule,
        businessDate: '2027-06-10',
        submittedAt,
        isBackdated: true,
      }),
    ).toBe(false)
  })
})

describe('Istanbul cutoff boundaries independent of device timezone', () => {
  it.each([
    ['2027-06-15', morningRule, '2027-06-15T14:29:59.999Z', true],
    ['2027-06-15', morningRule, '2027-06-15T14:30:00.000Z', true],
    ['2027-06-15', morningRule, '2027-06-15T14:30:00.001Z', false],
    ['2027-06-15', eveningRule, '2027-06-15T22:00:00.000Z', true],
    ['2027-06-15', eveningRule, '2027-06-15T22:00:00.001Z', false],
    ['2027-12-31', eveningRule, '2027-12-31T22:00:00.000Z', true],
    ['2027-12-31', eveningRule, '2027-12-31T22:00:00.001Z', false],
    ['2028-02-29', eveningRule, '2028-02-29T22:00:00.000Z', true],
  ] as const)('%s / %s / %s', (businessDate, rule, timestamp, expected) => {
    expect(
      evaluateOnTime({
        businessDate,
        rule,
        submittedAt: new Date(timestamp),
        isBackdated: false,
      }),
    ).toBe(expected)
  })
})
