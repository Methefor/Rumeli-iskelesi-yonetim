import { describe, expect, it } from 'vitest'
import pageSource from './ManagerDashboardPage.tsx?raw'

/** The Command Center page must not drift back to a per-branch (N+1) request pattern: it may only use the two batch services. */
describe('ManagerDashboardPage data access', () => {
  it('uses only the batch services (2 requests regardless of the number of branches)', () => {
    const source: string = pageSource
    expect(source).toContain('fetchDashboardRaws')
    expect(source).toContain('getCommandCenterSignals')
    expect(source).not.toMatch(/fetchBranchDashboardRaw|getBranchOperationsSignals/)
    expect(source).not.toMatch(/branches\.map\([^)]*=>\s*(fetch|get)/)
  })
})
