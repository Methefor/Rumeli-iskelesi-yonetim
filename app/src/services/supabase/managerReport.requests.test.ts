import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Counts the REAL backend requests of the manager-report data service (the Supabase client is replaced by a counter): every table query
 * (`from`) and every RPC is one request. The batch read model must cost ONE request however many branches are asked for and must never
 * query a table directly. (The loaders built on top of it are covered where they live, in features/managerReports.)
 */
const calls: string[] = []
let answer: ((name: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) | null = null

vi.mock('./client', () => ({
  supabase: {
    from: (table: string) => {
      calls.push(`from:${table}`)
      throw new Error(`unexpected table query on ${table}: reports must use the batch RPC`)
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}`)
      if (answer) return answer(name, args)
      const ids = (args.p_branch_ids as string[]) ?? []
      if (name === 'get_manager_report_inputs') {
        const no = { state: 'unavailable', reason: 'no_permission' }
        return { data: ids.map((id) => ({ branchId: id, input: { access: { financial: true, reports: true, stock: true, weather: true }, daily: { envelope: { state: 'missing' }, insights: [] }, waste: no, counts: no } })), error: null }
      }
      return { data: null, error: { message: `unexpected rpc ${name}` } }
    },
  },
}))

const ids = (n: number) => Array.from({ length: n }, (_, i) => `b${i + 1}`)

beforeEach(() => {
  calls.length = 0
  answer = null
})

describe('manager report read model: ONE request, constant in the number of branches', () => {
  it.each([1, 3, 10, 20])('%i branch(es), daily and weekly scope, cost exactly 1 request each', async (n) => {
    const { getManagerReportInputs } = await import('./managerReport')
    const daily = await getManagerReportInputs(ids(n), 'daily', '2026-10-08')
    expect(calls).toEqual(['rpc:get_manager_report_inputs'])
    expect(Object.keys(daily)).toHaveLength(n)
    calls.length = 0
    const weekly = await getManagerReportInputs(ids(n), 'weekly', '2026-09-28')
    expect(calls).toEqual(['rpc:get_manager_report_inputs'])
    expect(Object.keys(weekly)).toHaveLength(n)
  })

  it('passes the scope and the date to the database and never queries a table', async () => {
    let seen: Record<string, unknown> = {}
    answer = (_name, args) => {
      seen = args
      return { data: [], error: null }
    }
    const { getManagerReportInputs } = await import('./managerReport')
    await getManagerReportInputs(['b1'], 'weekly', '2026-09-28')
    expect(seen).toEqual({ p_branch_ids: ['b1'], p_scope: 'weekly', p_date: '2026-09-28' })
    expect(calls.filter((c) => c.startsWith('from:'))).toEqual([])
  })

  it('no branches means no request at all', async () => {
    const { getManagerReportInputs } = await import('./managerReport')
    expect(await getManagerReportInputs([], 'daily', '2026-10-08')).toEqual({})
    expect(calls).toEqual([])
  })
})

describe('batch mapping', () => {
  it('keeps the caller access flags and returns null for a branch the caller can not read (never an all-clear)', async () => {
    answer = () => ({
      data: [
        { branchId: 'b1', input: { access: { financial: false, reports: true, stock: false, weather: false }, waste: { state: 'unavailable', reason: 'no_permission' }, counts: { state: 'unavailable', reason: 'no_permission' } } },
        { branchId: 'b2', error: 'unavailable' },
      ],
      error: null,
    })
    const { getManagerReportInputs } = await import('./managerReport')
    const inputs = await getManagerReportInputs(['b1', 'b2', 'b3'], 'daily', '2026-10-05')
    expect(inputs.b1?.branchId).toBe('b1')
    expect(inputs.b1?.access).toEqual({ financial: false, reports: true, stock: false, weather: false })
    expect(inputs.b2).toBeNull()
    expect(inputs.b3).toBeNull() // absent from the answer: unavailable, not empty
  })

  it('a database error is thrown as a friendly message (never raw database text)', async () => {
    answer = () => ({ data: null, error: { message: 'permission denied for function get_manager_report_inputs', code: '42501' } })
    const { getManagerReportInputs } = await import('./managerReport')
    await expect(getManagerReportInputs(['b1'], 'weekly', '2026-09-28')).rejects.toThrow(/yetki/i)
  })
})
