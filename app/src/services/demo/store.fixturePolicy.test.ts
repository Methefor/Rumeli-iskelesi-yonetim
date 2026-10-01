import { describe, expect, it } from 'vitest'
import { createDemoState } from './store'

describe('Preview fixture policy', () => {
  it('keeps navigation identities but removes invented financial and inventory data', () => {
    const state = createDemoState(new Date('2026-10-01T12:00:00+03:00'), {
      includeSyntheticOperations: false,
    })

    expect(state.branches).toHaveLength(3)
    expect(state.employees.length).toBeGreaterThan(0)
    expect(state.reports).toEqual([])
    expect(state.items).toEqual([])
    expect(state.costs).toEqual([])
    expect(state.movements).toEqual([])
    expect(state.counts).toEqual([])
  })
})
