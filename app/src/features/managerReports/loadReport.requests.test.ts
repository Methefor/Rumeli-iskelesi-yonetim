import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Counts the REAL backend requests of the report LOADERS (the Supabase client is replaced by a counter): every table query (`from`) and
 * every RPC is one request. A report must cost a CONSTANT number of requests however many branches exist, must never query a table
 * directly and must never regenerate analytics (opening a report rebuilds nothing).
 */
const calls: string[] = []
let answer: ((name: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) | null = null

vi.mock('../../services/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      calls.push(`from:${table}`)
      throw new Error(`unexpected table query on ${table}: reports must use the batch RPCs`)
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}`)
      if (answer) return answer(name, args)
      const ids = (args.p_branch_ids as string[]) ?? []
      if (name === 'get_dashboard_inputs') {
        return { data: ids.map((id) => ({ branchId: id, shifts: [], reports: [], openReconciliationCount: 0, items: [], balances: [], lastCounts: [], wasteEntryCount: 0, countsSubmitted: 0, grossProfit: null })), error: null }
      }
      if (name === 'get_command_center_signals') return { data: ids.map((id) => ({ branchId: id, error: 'unavailable' })), error: null }
      if (name === 'get_manager_report_inputs') {
        const no = { state: 'unavailable', reason: 'no_permission' }
        return { data: ids.map((id) => ({ branchId: id, input: { access: { financial: true, reports: true, stock: true, weather: true }, daily: { envelope: { state: 'missing' }, insights: [] }, weekly: { envelope: { state: 'missing' }, insights: [] }, days: [], waste: no, counts: no } })), error: null }
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } }
    },
  },
}))

// the loaders read through the data facade; here it is wired straight to the real (mocked-client) services
vi.mock('../../services/data', async () => {
  const cc = await import('../../services/supabase/commandCenter')
  const mr = await import('../../services/supabase/managerReport')
  return { fetchDashboardRaws: cc.fetchDashboardRaws, getCommandCenterSignals: cc.getCommandCenterSignals, getManagerReportInputs: mr.getManagerReportInputs }
})

const NOW = new Date('2026-10-08T09:00:00Z') // Thursday 2026-10-08 12:00 Istanbul
const branches = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `b${i + 1}`, key: `key${i + 1}`, name: `Şube ${i + 1}` }))
const sorted = () => [...calls].sort()

beforeEach(() => {
  calls.length = 0
  answer = null
})

describe('manager report loaders: constant backend request count (no per-branch N+1)', () => {
  it.each([1, 3, 10, 20])('daily report of TODAY for %i branch(es) costs exactly 3 requests', async (n) => {
    const { loadDailyReport } = await import('./loadReport')
    const { pack } = await loadDailyReport(branches(n), '2026-10-08', NOW)
    expect(sorted()).toEqual(['rpc:get_command_center_signals', 'rpc:get_dashboard_inputs', 'rpc:get_manager_report_inputs'])
    expect(pack.scope.branches).toHaveLength(n)
  })

  it.each([1, 3, 20])('daily report of a PAST date for %i branch(es) costs exactly 2 requests (no live signals)', async (n) => {
    const { loadDailyReport } = await import('./loadReport')
    await loadDailyReport(branches(n), '2026-10-05', NOW)
    expect(sorted()).toEqual(['rpc:get_dashboard_inputs', 'rpc:get_manager_report_inputs'])
  })

  it.each([1, 3, 20])('weekly report of the CURRENT week for %i branch(es) costs exactly 2 requests', async (n) => {
    const { loadWeeklyReport } = await import('./loadReport')
    await loadWeeklyReport(branches(n), '2026-10-05', NOW)
    expect(sorted()).toEqual(['rpc:get_command_center_signals', 'rpc:get_manager_report_inputs'])
  })

  it.each([1, 3, 20])('weekly report of a PAST week for %i branch(es) costs exactly 1 request', async (n) => {
    const { loadWeeklyReport } = await import('./loadReport')
    await loadWeeklyReport(branches(n), '2026-09-28', NOW)
    expect(calls).toEqual(['rpc:get_manager_report_inputs'])
  })

  it('never queries a table and never regenerates analytics (a render rebuilds nothing)', async () => {
    const { loadDailyReport, loadWeeklyReport } = await import('./loadReport')
    await loadDailyReport(branches(3), '2026-10-08', NOW)
    await loadWeeklyReport(branches(3), '2026-10-05', NOW)
    expect(calls.filter((c) => c.startsWith('from:'))).toEqual([])
    expect(calls.filter((c) => /regenerate|internal_/.test(c))).toEqual([])
  })

  it('a branch the caller can not read is a limitation in the report (never an all-clear)', async () => {
    answer = (name, args) => {
      const ids = (args.p_branch_ids as string[]) ?? []
      if (name === 'get_manager_report_inputs') {
        return { data: [{ branchId: 'b1', input: { access: { financial: true, reports: true, stock: true, weather: true }, daily: { envelope: { state: 'missing' }, insights: [] }, waste: { state: 'unavailable', reason: 'no_permission' }, counts: { state: 'unavailable', reason: 'no_permission' } } }, { branchId: 'b2', error: 'unavailable' }], error: null }
      }
      if (name === 'get_dashboard_inputs') return { data: [], error: null }
      return { data: ids.map((id) => ({ branchId: id, error: 'unavailable' })), error: null }
    }
    const { loadDailyReport } = await import('./loadReport')
    const { pack } = await loadDailyReport(branches(2), '2026-10-05', NOW)
    expect(pack.limitations.some((l) => l.code === 'source_unavailable')).toBe(true)
    expect(pack.completeness.overall).toBe('no_data')
  })
})
