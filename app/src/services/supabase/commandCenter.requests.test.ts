import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDashboardPeriod } from '../../domain/dashboard'

/**
 * Counts the REAL backend requests the Command Center data layer makes (the Supabase client is replaced by a counter): every table query
 * (`from`) and every RPC is one request. The initial load must stay at a CONSTANT number of requests however many branches exist.
 */
const calls: string[] = []
let answer: ((name: string) => { data: unknown; error: null }) | null = null // per-test override of the RPC answers

vi.mock('./client', () => ({
  supabase: {
    from: (table: string) => {
      calls.push(`from:${table}`)
      throw new Error(`unexpected table query on ${table}: the Command Center must use the batch RPCs`)
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}`)
      if (answer) return answer(name)
      const ids = (args.p_branch_ids as string[]) ?? []
      if (name === 'get_dashboard_inputs') {
        return {
          data: ids.map((id) => ({
            branchId: id, shifts: [], reports: [], openReconciliationCount: 0, items: [], balances: [], lastCounts: [], wasteEntryCount: 0, countsSubmitted: 0, grossProfit: null,
          })),
          error: null,
        }
      }
      if (name === 'get_command_center_signals') return { data: ids.map((id) => ({ branchId: id, signals: { branchId: id } })), error: null }
      return { data: null, error: { message: `unexpected rpc ${name}` } }
    },
  },
}))

const branches = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `b${i + 1}`, key: `key${i + 1}`, name: `Şube ${i + 1}` }))

beforeEach(() => {
  calls.length = 0
  answer = null
})

describe('Command Center initial load: constant backend request count (no per-branch N+1)', () => {
  it.each([1, 3, 10, 20])('%i branch(es) cost exactly 2 backend requests', async (n) => {
    const { fetchDashboardRaws, getCommandCenterSignals } = await import('./commandCenter')
    const list = branches(n)
    const [raws, signals] = await Promise.all([fetchDashboardRaws(list, resolveDashboardPeriod('today')), getCommandCenterSignals(list.map((b) => b.id))])
    expect(calls.sort()).toEqual(['rpc:get_command_center_signals', 'rpc:get_dashboard_inputs'])
    expect(raws).toHaveLength(n)
    expect(Object.keys(signals)).toHaveLength(n)
  })

  it('any other period (7/30 days) is also ONE request', async () => {
    const { fetchDashboardRaws } = await import('./commandCenter')
    await fetchDashboardRaws(branches(3), resolveDashboardPeriod('30d'))
    expect(calls).toEqual(['rpc:get_dashboard_inputs'])
  })

  it('no branches means no request at all', async () => {
    const { fetchDashboardRaws, getCommandCenterSignals } = await import('./commandCenter')
    expect(await fetchDashboardRaws([], resolveDashboardPeriod('today'))).toEqual([])
    expect(await getCommandCenterSignals([])).toEqual({})
    expect(calls).toEqual([])
  })

  it('a branch missing from the answer is absent from the dashboard (never an empty all-clear) and null in the signals', async () => {
    answer = (name) => ({
      data:
        name === 'get_dashboard_inputs'
          ? [{ branchId: 'b1', shifts: [], reports: [], openReconciliationCount: 0, items: [], balances: [], lastCounts: [], wasteEntryCount: 0, countsSubmitted: 0, grossProfit: null }]
          : [{ branchId: 'b1', signals: { branchId: 'b1' } }, { branchId: 'b2', error: 'unavailable' }],
      error: null,
    })
    try {
      const { fetchDashboardRaws, getCommandCenterSignals } = await import('./commandCenter')
      expect((await fetchDashboardRaws(branches(2), resolveDashboardPeriod('today'))).map((r) => r.branchId)).toEqual(['b1'])
      const s = await getCommandCenterSignals(['b1', 'b2'])
      expect(s.b1).not.toBeNull()
      expect(s.b2).toBeNull()
    } finally {
      answer = null
    }
  })
})

describe('batch payload mapping keeps the dashboard model contract', () => {
  it('maps raw report facts, items, balances, last counts and gross profit into BranchRawData (alerts derived by the inventory domain)', async () => {
    const { mapDashboardInputs } = await import('./commandCenter')
    const raw = mapDashboardInputs(
      {
        branchId: 'b1',
        shifts: [{ id: 's1', businessDate: '2026-10-07', status: 'closed' }],
        reports: [{ shiftId: 's1', businessDate: '2026-10-07', submittedAt: '2026-10-07T20:00:00Z', reportType: 'Z', grossRevenue: '1234.50', status: 'submitted', reconciliationStatus: 'OK', origin: 'native' }],
        openReconciliationCount: 2,
        items: [{ id: 'i1', branch_id: 'b1', code: 'A', name: 'A', unit: 'kg', allows_decimal: true, sales_category_id: null, is_active: true }],
        balances: [{ inventory_item_id: 'i1', branch_id: 'b1', theoretical_quantity: '4', last_movement_at: null }],
        lastCounts: [],
        wasteEntryCount: 3,
        countsSubmitted: 1,
        grossProfit: { lines: [{ inventory_item_id: 'i1', code: 'A', name: 'A', unit: 'kg', sold_quantity: '2', product_revenue: '100', cogs: '40', costed_quantity: '2', uncosted_quantity: '0' }], unmapped_category_revenue: '0' },
      },
      { key: 'rumeli', name: 'Rumeli' },
    )
    expect(raw).toMatchObject({ branchId: 'b1', branchKey: 'rumeli', branchName: 'Rumeli', openReconciliationCount: 2, inventoryTracked: true, wasteEntryCountInPeriod: 3, countsSubmittedInPeriod: 1 })
    expect(raw.period.reports[0]).toMatchObject({ grossRevenue: 1234.5, reportType: 'Z', businessDate: '2026-10-07', origin: 'native' })
    expect(raw.grossProfit?.lines[0]).toMatchObject({ soldQuantity: 2, productRevenue: 100, cogs: 40 })
    expect(typeof raw.inventoryAlertCount).toBe('number')
  })

  it('a branch without inventory is not tracked and carries no inventory facts', async () => {
    const { mapDashboardInputs } = await import('./commandCenter')
    const raw = mapDashboardInputs(
      { branchId: 'b2', shifts: [], reports: [], openReconciliationCount: 0, items: [], balances: [], lastCounts: [], wasteEntryCount: 9, countsSubmitted: 9, grossProfit: null },
      { key: 'k', name: 'N' },
    )
    expect(raw).toMatchObject({ inventoryTracked: false, inventoryAlertCount: 0, wasteEntryCountInPeriod: 0, countsSubmittedInPeriod: 0, grossProfit: null })
  })
})
