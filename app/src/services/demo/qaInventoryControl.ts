/**
 * SYNTHETIC QA scenarios for the fire report and the closing-count review (Phase 1B). Everything is invented
 * ("Örnek Kontrol Ürünü ..", "Demo .."): no production values, URLs, keys or identities. Applied by
 * applyQaFixtures after the base history, so the manager screens show every state:
 *
 *   Rumeli (yesterday evening closing count, K1..K6, mirrors supabase/tests/inventory_control.test.sql):
 *     K1 balanced                    K2 shortage + equal waste recorded after the count (timing_uncertain)
 *     K3 smaller waste recorded after (timing_uncertain, partial candidate)   K4 unexplained (waste was recorded BEFORE the count, so it is already in the expected stock)
 *     K5 surplus                     K6 shortage + waste recorded after the count whose cost is unknown (missing-cost waste, timing_uncertain)
 *   Dondurma: counts exist, but none today (missing closing count today); normal costed + uncosted fire from the base set
 *   Balık Ekmek: its only count today is voided (voided_only)
 */
import type { QaDeps } from './qaFixtures'
import type { DemoState } from './store'

const R = 'demo-branch-rumeli'
const B = 'demo-branch-balik'

export function applyQaInventoryControl(state: DemoState, deps: QaDeps, date: (offset: number) => string): void {
  const { instant } = deps
  const item = (id: string, branchId: string, code: string, name: string) =>
    state.items.push({ id, branchId, code, name, unit: 'kg', allowsDecimal: true, salesCategoryId: null, isActive: true })
  const cost = (id: string, unitCost: number) =>
    state.costs.push({ id: `demo-cost-ctl-${id}`, inventoryItemId: id, unitCost, effectiveFrom: instant(date(-50), 9).toISOString(), reason: 'ilk maliyet' })

  const ids = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map((k) => `demo-ctl-${k}`)
  ids.forEach((id, i) => item(id, R, `DEMO-K${i + 1}`, `Örnek Kontrol Ürünü K${i + 1}`))
  ids.slice(0, 5).forEach((id, i) => cost(id, [10, 20, 30, 40, 50][i] ?? 10)) // K6 deliberately has NO cost
  for (const id of ids) {
    deps.addMovement(state, { itemId: id, type: 'RECEIPT', quantity: 20, at: instant(date(-3), 12), createdBy: 'demo-m001', reference: 'ÖRNEK-TESLİMAT-KONTROL' })
  }

  const evening = state.shifts.find((s) => s.branchId === R && s.businessDate === date(-1) && s.definition.key === 'evening')
  const shiftId = evening?.id ?? null
  const waste = (id: string, qty: number, hour: number, minute: number, reasonCode: string) =>
    deps.addMovement(state, { itemId: id, type: 'WASTE', quantity: qty, at: instant(date(-1), hour, minute), createdBy: 'demo-k001', shiftId, reasonCode, reason: 'Sentetik fire kaydı' })

  waste('demo-ctl-k4', 3, 21, 0, 'expired') // BEFORE the count: already inside the expected stock
  deps.submitCount(
    state,
    {
      branchId: R,
      shiftId,
      note: 'Sentetik kapanış sayımı (kontrol senaryoları)',
      lines: [
        { inventoryItemId: 'demo-ctl-k1', physicalQuantity: 20 }, // balanced
        { inventoryItemId: 'demo-ctl-k2', physicalQuantity: 18 }, // shortage 2
        { inventoryItemId: 'demo-ctl-k3', physicalQuantity: 15 }, // shortage 5
        { inventoryItemId: 'demo-ctl-k4', physicalQuantity: 13 }, // shortage 4 (expected 17)
        { inventoryItemId: 'demo-ctl-k5', physicalQuantity: 23 }, // surplus 3
        { inventoryItemId: 'demo-ctl-k6', physicalQuantity: 17 }, // shortage 3
      ],
    },
    instant(date(-1), 23, 30),
    { submittedBy: 'demo-k001' },
  )
  waste('demo-ctl-k2', 2, 23, 50, 'damaged') // candidate for K2 (timing uncertain)
  waste('demo-ctl-k3', 2, 23, 52, 'spilled') // candidate for 2 of K3's 5
  waste('demo-ctl-k6', 3, 23, 55, 'quality') // candidate for K6; no cost snapshot exists

  // Balık Ekmek: the only count of today is voided (voided_only)
  state.items.push({ id: 'demo-ctl-kb1', branchId: B, code: 'DEMO-KB1', name: 'Örnek Kontrol Ürünü KB1', unit: 'kg', allowsDecimal: true, salesCategoryId: null, isActive: true })
  deps.addMovement(state, { itemId: 'demo-ctl-kb1', type: 'RECEIPT', quantity: 10, at: instant(date(-3), 12), createdBy: 'demo-m001', reference: 'ÖRNEK-TESLİMAT-KONTROL' })
  deps.submitCount(
    state,
    { branchId: B, shiftId: null, note: 'Sentetik sayım (iptal edilecek)', lines: [{ inventoryItemId: 'demo-ctl-kb1', physicalQuantity: 9 }] },
    instant(date(0), 9, 0),
    { submittedBy: 'demo-f001' },
  )
  const voided = state.counts[0]
  if (voided) {
    voided.status = 'voided'
    voided.voidReason = 'Sentetik iptal: yanlış ürün sayıldı'
  }
}
