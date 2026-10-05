import { describe, expect, it } from 'vitest'
import { inReconciliationQueue, type QueueCandidate } from './queue'

const r = (over: Partial<QueueCandidate>): QueueCandidate => ({
  status: 'submitted',
  reconciliationStatus: 'ERROR',
  ...over,
})

describe('inReconciliationQueue', () => {
  it('a current (native) V4 ERROR/WARNING is in the ACTIVE queue', () => {
    expect(inReconciliationQueue(r({}), 'active')).toBe(true)
    expect(
      inReconciliationQueue(r({ reconciliationStatus: 'WARNING', origin: 'native' }), 'active'),
    ).toBe(true)
  })

  it('a historical imported ERROR/WARNING is NOT in the active queue but IS in the historical view', () => {
    const imported = r({ origin: 'legacy_import' })
    expect(inReconciliationQueue(imported, 'active')).toBe(false)
    expect(inReconciliationQueue(imported, 'historical')).toBe(true)
    expect(
      inReconciliationQueue({ ...imported, reconciliationStatus: 'WARNING' }, 'historical'),
    ).toBe(true)
  })

  it('a native report never appears in the historical view', () => {
    expect(inReconciliationQueue(r({}), 'historical')).toBe(false)
  })

  it('OK and cancelled reports are in neither scope', () => {
    for (const scope of ['active', 'historical'] as const) {
      expect(
        inReconciliationQueue(r({ reconciliationStatus: 'OK', origin: 'legacy_import' }), scope),
      ).toBe(false)
      expect(inReconciliationQueue(r({ status: 'cancelled' }), scope)).toBe(false)
    }
  })

  it('classifying never mutates the stored status', () => {
    const imported = r({ origin: 'legacy_import' })
    inReconciliationQueue(imported, 'active')
    inReconciliationQueue(imported, 'historical')
    expect(imported.reconciliationStatus).toBe('ERROR')
  })
})
