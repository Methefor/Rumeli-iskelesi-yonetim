import { describe, expect, it } from 'vitest'
import { getBranchTheme } from './branchTheme'

describe('getBranchTheme', () => {
  it('uses branch key and Turkish branch name', () => {
    expect(
      getBranchTheme({ id: '1', key: 'iskele_dondurma', name: 'İskele Dondurma' }),
    ).toBe('dondurma')
    expect(getBranchTheme({ id: '2', key: 'rumeli', name: 'Rumeli İskelesi' })).toBe(
      'rumeli',
    )
    expect(getBranchTheme({ id: '3', key: 'balik_ekmek', name: 'Balık Ekmek' })).toBe(
      'balik',
    )
  })

  it('keeps other branches on the neutral identity', () => {
    expect(getBranchTheme({ id: '4', key: 'depo', name: 'Merkez Depo' })).toBe('default')
    expect(getBranchTheme(null)).toBe('default')
  })
})
