import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_STORAGE_KEY } from '../../features/auth/demoSession'
import { demoApi } from './api'
import { demoState, resetDemoState } from './state'

const R = 'demo-branch-rumeli'
const NOW = new Date('2027-06-15T09:00:00+03:00')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  sessionStorage.clear()
  sessionStorage.setItem(DEMO_STORAGE_KEY, 'M001:2027')
  resetDemoState(NOW)
})
afterEach(() => vi.useRealTimers())

describe('reconciliation queue: native vs historical imported findings (demo mirror of the SQL view)', () => {
  it('keeps a native ERROR in the active queue and imported findings out of it, without changing any status', async () => {
    const state = demoState()
    const nativeError = state.reports.find(
      (x) => x.branchId === R && x.reconciliationStatus === 'ERROR',
    )!
    expect(nativeError).toBeDefined()
    const template = state.reports.find((x) => x.branchId === R)!
    state.reports.push({
      ...template,
      id: 'imported-1',
      origin: 'legacy_import',
      reconciliationStatus: 'ERROR',
      status: 'submitted',
    })
    state.reports.push({
      ...template,
      id: 'imported-2',
      origin: 'legacy_import',
      reconciliationStatus: 'WARNING',
      status: 'submitted',
    })
    const overridesBefore = state.overrides.length
    const auditBefore = state.auditLog.length

    const active = await demoApi.listReconciliationQueue(R)
    expect(active.map((x) => x.id)).toContain(nativeError.id)
    expect(active.map((x) => x.id)).not.toContain('imported-1')
    expect(active.map((x) => x.id)).not.toContain('imported-2')

    const historical = await demoApi.listReconciliationQueue(R, 'historical')
    expect(historical.map((x) => x.id).sort()).toEqual(['imported-1', 'imported-2'])
    expect(historical.find((x) => x.id === 'imported-1')?.reconciliationStatus).toBe('ERROR')
    expect(historical.find((x) => x.id === 'imported-2')?.reconciliationStatus).toBe('WARNING')

    expect(state.overrides.length).toBe(overridesBefore)
    expect(state.auditLog.length).toBe(auditBefore)
    expect(state.reports.find((x) => x.id === 'imported-1')?.reconciliationStatus).toBe('ERROR')
  })
})
