import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_STORAGE_KEY } from '../../features/auth/demoSession'
import { demoApi } from './api'
import { buildWasteReport, summarizeCount } from './inventoryControl'
import { resetDemoState, demoState } from './state'
import { createDemoState, DEMO_BRANCH_BALIK, DEMO_BRANCH_DONDURMA, DEMO_BRANCH_RUMELI } from './store'
import { istanbulDate, addDaysIso } from '../../utils/dates'

const NOW = new Date('2026-10-07T12:00:00+03:00')
const today = istanbulDate(NOW)
const yesterday = addDaysIso(today, -1)
const qa = createDemoState(NOW, { fixtureSet: 'qa' })

const signInAs = (code: string) => sessionStorage.setItem(DEMO_STORAGE_KEY, `${code}:2027`)

describe('synthetic fire / closing-count scenarios (QA set)', () => {
  const count = qa.counts.find((c) => c.branchId === DEMO_BRANCH_RUMELI && c.businessDate === yesterday)
  const review = (code: string) => {
    const line = count?.lines.find((l) => l.inventoryItemId === `demo-ctl-${code}`)
    if (!count || !line) throw new Error('scenario missing')
    return line
  }

  it('has the controlled Rumeli closing count with a known submitter', () => {
    expect(count?.lines).toHaveLength(6)
    expect(count?.submittedBy).toBe('demo-k001')
  })

  it('classifies every scenario line as the SQL does', () => {
    const summary = summarizeCount(qa, count!, true)
    expect(summary).toMatchObject({ lines: 6, balancedLines: 1, shortageLines: 4, surplusLines: 1, timingUncertainLines: 3, unexplainedLines: 1 })
    expect(summary.unexplainedQuantityByUnit).toEqual([{ unit: 'kg', quantity: 4 }]) // K4 only: waste was recorded before the count
    expect(summary.timingUncertainQuantityByUnit).toEqual([{ unit: 'kg', quantity: 10 }]) // K2 2 + K3 5 + K6 3
    expect(JSON.stringify(summarizeCount(qa, count!, true))).not.toContain('explained_by_waste')
    expect(review('k4').varianceQuantity).toBe(-4)
  })

  it('fire report: normal and missing-cost waste, cost state partial, never a silent zero', () => {
    const report = buildWasteReport(qa, DEMO_BRANCH_RUMELI, yesterday, yesterday, true)
    expect(report.entries).toBe(4)
    expect(report.cost.state).toBe('partial')
    expect(report.cost.reason).toBe('missing_cost')
    expect(report.byItem.find((i) => i.code === 'DEMO-K6')?.cost).toEqual({ state: 'unavailable', reason: 'missing_cost', knownCostKurus: null, costedQuantity: 0, totalQuantity: 3 })
    expect(report.byItem.find((i) => i.code === 'DEMO-K2')?.cost).toEqual({ state: 'available', value: 40, knownCostKurus: 4000, costedQuantity: 2, totalQuantity: 2 })
    expect(buildWasteReport(qa, DEMO_BRANCH_RUMELI, yesterday, yesterday, false).cost).toEqual({ state: 'unavailable', reason: 'no_permission' })
  })

  it('a branch with no count today is missing; one with only a voided count is voided_only', () => {
    const todays = (branchId: string) => qa.counts.filter((c) => c.branchId === branchId && c.businessDate === today)
    expect(todays(DEMO_BRANCH_DONDURMA)).toHaveLength(0)
    expect(todays(DEMO_BRANCH_BALIK).map((c) => c.status)).toEqual(['voided'])
  })
})

describe('demo service permissions (mirrors RLS)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    sessionStorage.clear()
    resetDemoState(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('manager reads reports and manages reasons; cashier does neither', async () => {
    signInAs('M001')
    await expect(demoApi.getWasteReport(DEMO_BRANCH_DONDURMA, today, today)).resolves.toMatchObject({ entries: expect.any(Number) })
    expect((await demoApi.listWasteReasons()).length).toBeGreaterThanOrEqual(6)
    expect((await demoApi.upsertWasteReason({ id: null, code: 'closed_early', name: 'Erken kapanış', description: null, sortOrder: 60, reason: 'yeni neden' })).error).toBeNull()
    expect((await demoApi.upsertWasteReason({ id: null, code: 'closed_early', name: 'Dup', description: null, sortOrder: 1, reason: 'duplicate' })).error).not.toBeNull()
    expect((await demoApi.upsertWasteReason({ id: null, code: 'Bad Code', name: 'Bad', description: null, sortOrder: 1, reason: 'bad code' })).error).not.toBeNull()

    signInAs('K001')
    await expect(demoApi.getWasteReport(DEMO_BRANCH_RUMELI, today, today)).rejects.toThrow()
    expect((await demoApi.upsertWasteReason({ id: null, code: 'cashier_code', name: 'No', description: null, sortOrder: 1, reason: 'cashier tries' })).error).not.toBeNull()
    const visible = await demoApi.listWasteReasons()
    expect(visible.every((r) => r.isActive)).toBe(true)
  })

  it('deactivating a reason hides it from entry users but keeps history valid', async () => {
    signInAs('M001')
    const sample = (await demoApi.listWasteReasons()).find((r) => r.code === 'sample')!
    expect((await demoApi.setWasteReasonActive(sample.id, false, 'numune kapatıldı')).error).toBeNull()
    expect((await demoApi.listWasteReasons()).find((r) => r.code === 'sample')?.isActive).toBe(false)
    signInAs('K001')
    expect((await demoApi.listWasteReasons()).some((r) => r.code === 'sample')).toBe(false)
    expect(demoState().movements.length).toBeGreaterThan(0) // existing ledger rows untouched
  })
})
