/**
 * Rich SYNTHETIC QA dataset for phone/Preview testing (opt-in: VITE_DEMO_FIXTURES=qa).
 *
 * Everything here is invented and deterministic (seeded by the business date): no production data, no
 * secrets, no network. It exists so the manager screens (dashboard, analytics, stock, fire, closing
 * count, reconciliation) can be reviewed with populated, realistic STATES. Nothing may be read as a
 * business figure: products are "Örnek Ürün A..", people are "Demo ..", the notice says synthetic.
 *
 * Scenarios deliberately included (offset 0 = today):
 *   - ~40 days of X (afternoon) + Z (evening) readings for all three branches
 *   - a PROVISIONAL X-only day in the past (Rumeli -9, Dondurma -6) and today's X-only morning
 *   - a Z below X anomaly (Rumeli -5) -> z_below_x warning
 *   - reconciliation WARNING and ERROR reports (Rumeli -3 / Dondurma -4)
 *   - legacy-import-origin history (Rumeli -41..-33): revenue only, no transaction counts
 *   - inventory (Dondurma) with a costed and an uncosted product, receipts, waste (several reasons), closing counts
 *   - synthetic weather per day, correlated with Dondurma sales so the analytics relationship has a sample
 */
import { addDaysIso } from '../../utils/dates'
import type { DemoState, ReportInput } from './store'

const D = 'demo-branch-dondurma'
const R = 'demo-branch-rumeli'
const B = 'demo-branch-balik'

export interface QaDeps {
  today: string
  createReport: (state: DemoState, input: ReportInput, actorId: string, at: Date) => unknown
  addMovement: (state: DemoState, input: Record<string, unknown>) => unknown
  submitCount: (state: DemoState, input: Record<string, unknown>, at: Date) => unknown
  instant: (dateIso: string, hour: number, minute?: number) => Date
}

/** deterministic PRNG (mulberry32) so every page load shows the same synthetic history */
function prng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7)
const round = (n: number, step = 5) => Math.round(n / step) * step
const WEEKDAY_FACTOR = [0.85, 0.8, 0.85, 0.9, 1.05, 1.3, 1.4] // Mon..Sun

function isoWeekdayIndex(dateIso: string): number {
  const [y = 1970, m = 1, d = 1] = dateIso.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return (day + 6) % 7
}

export function applyQaFixtures(state: DemoState, deps: QaDeps): void {
  const { today, instant } = deps
  const cat = (key: string) => `demo-cat-${key}`
  const date = (offset: number) => addDaysIso(today, offset)
  const shiftId = (branchId: string, key: string, offset: number) => `demo-shift-${branchId}-${key}-${offset}`

  // ---- shifts for the history window (the base seed only covers -2..+2)
  for (const branch of state.branches) {
    const keys = branch.id === R ? ['morning', 'evening'] : ['daily']
    for (let offset = -42; offset <= -3; offset += 1) {
      for (const key of keys) {
        const def = state.shiftDefinitions.find((d) => d.branchId === branch.id && d.key === key)
        if (!def) throw new Error('qa fixtures: missing shift definition')
        const { branchId: _unused, ...definition } = def
        void _unused
        state.shifts.push({ id: shiftId(branch.id, key, offset), branchId: branch.id, branchName: branch.name, businessDate: date(offset), status: 'closed', definition })
      }
    }
  }

  // ---- synthetic weather per day (today included): Oct-like, with a few rainy days
  state.externalContext = {}
  for (let offset = -42; offset <= 2; offset += 1) {
    const rnd = prng(hash(`wx${offset}`))
    const temp = Math.round((17 + 5 * Math.sin(offset / 5) + (rnd() - 0.5) * 4) * 10) / 10
    const rainy = rnd() < 0.22
    state.externalContext[date(offset)] = {
      temperatureC: temp,
      apparentTemperatureC: Math.round((temp - 1 + rnd() * 1.5) * 10) / 10,
      precipitationMm: rainy ? Math.round((1.2 + rnd() * 6) * 10) / 10 : 0,
      windKmh: Math.round((8 + rnd() * 18) * 10) / 10,
    }
  }

  // ---- Dondurma stock catalogue (clearly synthetic), costs and opening receipts
  const item = (id: string, code: string, name: string, unit: string, dec: boolean, category: string | null, active = true) =>
    state.items.push({ id, branchId: D, code, name, unit, allowsDecimal: dec, salesCategoryId: category ? cat(category) : null, isActive: active })
  item('demo-item-a', 'DEMO-A', 'Örnek Ürün A', 'kg', true, 'dondurma')
  item('demo-item-b', 'DEMO-B', 'Örnek Ürün B', 'kg', true, 'dondurma')
  item('demo-item-c', 'DEMO-C', 'Örnek Ürün C (maliyetsiz)', 'kg', true, 'dondurma')
  item('demo-item-d', 'DEMO-D', 'Örnek Ürün D', 'adet', false, 'soguk_icecek')
  item('demo-item-e', 'DEMO-E', 'Örnek Ürün E (pasif)', 'kg', true, 'dondurma', false)
  const cost = (itemId: string, unitCost: number, offset: number, reason: string) =>
    state.costs.push({ id: `demo-cost-qa-${itemId}-${offset}`, inventoryItemId: itemId, unitCost, effectiveFrom: instant(date(offset), 9).toISOString(), reason })
  cost('demo-item-a', 42.5, -50, 'ilk maliyet')
  cost('demo-item-a', 45, -12, 'fiyat artışı')
  cost('demo-item-b', 38, -50, 'ilk maliyet')
  cost('demo-item-d', 12, -50, 'ilk maliyet')
  // demo-item-c deliberately has NO cost: the uncosted gross-profit state.
  for (const [id, qty] of [['demo-item-a', 420], ['demo-item-b', 320], ['demo-item-c', 220], ['demo-item-d', 950]] as const) {
    deps.addMovement(state, { itemId: id, type: 'RECEIPT', quantity: qty, at: instant(date(-43), 12), createdBy: 'demo-m001', reference: 'ÖRNEK-TESLİMAT-AÇILIŞ' })
  }

  // ---- sales history
  const branchSpec = [
    { id: R, shift: (k: 'X' | 'Z') => (k === 'X' ? 'morning' : 'evening'), base: 18500, actor: 'demo-k001' },
    { id: D, shift: () => 'daily', base: 6800, actor: 'demo-d001' },
    { id: B, shift: () => 'daily', base: 7600, actor: 'demo-f001' },
  ] as const

  for (const spec of branchSpec) {
    for (let offset = -42; offset <= 0; offset += 1) {
      const d = date(offset)
      const rnd = prng(hash(`${spec.id}${d}`))
      const wx = state.externalContext[d]
      const weatherFactor = spec.id === D && wx ? Math.max(0.5, 1 + 0.035 * (wx.temperatureC - 17)) * (wx.precipitationMm >= 1 ? 0.75 : 1) : 1
      const z = Math.max(500, round(spec.base * (WEEKDAY_FACTOR[isoWeekdayIndex(d)] ?? 1) * weatherFactor * (0.92 + rnd() * 0.16)))
      let x = round(z * (0.38 + rnd() * 0.14))
      const tx = Math.max(10, Math.round(z / (52 + rnd() * 14)))
      const xTx = Math.max(4, Math.round(tx * (x / z)))
      const legacy = spec.id === R && offset <= -33

      // scenarios
      const xOnly = (spec.id === R && offset === -9) || (spec.id === D && offset === -6) || offset === 0 // today: only the morning X exists yet
      const zBelowX = spec.id === R && offset === -5
      if (zBelowX) x = round(z * 1.2)
      // today is in progress: only the morning X exists
      const skipZ = xOnly
      const inventoryDay = spec.id === D && offset >= -41 && !xOnly

      // category / product lines. reconciliation: items sum = gross, except the planned WARNING / ERROR days
      const drift = (spec.id === R && offset === -3) ? 0.035 : (spec.id === D && offset === -4) ? 0.09 : 0
      const lines = (gross: number, withProducts: boolean): ReportInput['items'] => {
        const total = gross * (1 - drift)
        if (spec.id === R) {
          return [
            { categoryId: cat('gida'), amount: round(total * 0.5, 1) },
            { categoryId: cat('kahve'), amount: round(total * 0.3, 1) },
            { categoryId: cat('tatli'), amount: Math.round((total - round(total * 0.5, 1) - round(total * 0.3, 1)) * 100) / 100 },
          ]
        }
        if (spec.id === B) {
          const a = round(total * 0.8, 1)
          return [{ categoryId: cat('balik_ekmek'), amount: a }, { categoryId: cat('soguk_icecek'), amount: Math.round((total - a) * 100) / 100 }]
        }
        if (!withProducts) return [{ categoryId: cat('dondurma'), amount: Math.round(total * 100) / 100 }]
        const a = round(total * 0.45, 1)
        const b = round(total * 0.35, 1)
        return [
          { inventoryItemId: 'demo-item-a', inventoryQuantity: Math.max(1, Math.round(a / 600)), amount: a },
          { inventoryItemId: 'demo-item-b', inventoryQuantity: Math.max(1, Math.round(b / 550)), amount: b },
          { inventoryItemId: 'demo-item-d', inventoryQuantity: Math.max(1, Math.round((total - a - b) / 90)), amount: Math.round((total - a - b) * 100) / 100 },
        ]
      }

      const xReport = deps.createReport(state, { shiftId: shiftId(spec.id, spec.shift('X'), offset), reportType: 'X', grossRevenue: x, transactionCount: legacy ? null : xTx, items: lines(x, false) }, spec.actor, instant(d, 15, 20)) as { origin?: 'legacy_import' }
      let zReport: { origin?: 'legacy_import' } | null = null
      if (!skipZ) {
        zReport = deps.createReport(state, { shiftId: shiftId(spec.id, spec.shift('Z'), offset), reportType: 'Z', grossRevenue: zBelowX ? round(z * 0.9) : z, transactionCount: legacy ? null : tx, items: lines(zBelowX ? round(z * 0.9) : z, inventoryDay) }, spec.actor, instant(d, 23, 40)) as { origin?: 'legacy_import' }
      }
      if (legacy) {
        xReport.origin = 'legacy_import'
        if (zReport) zReport.origin = 'legacy_import'
      }
    }
  }

  // ---- waste (several reasons, several people/shifts) and closing counts (variances) for Dondurma
  const reasons = ['expired', 'damaged', 'spilled', 'quality', 'other'] as const
  for (let offset = -30; offset <= -1; offset += 3) {
    const rnd = prng(hash(`waste${offset}`))
    const itemId = (['demo-item-a', 'demo-item-b', 'demo-item-d'] as const)[Math.floor(rnd() * 3)]!
    const isD = itemId === 'demo-item-d'
    deps.addMovement(state, {
      itemId,
      type: 'WASTE',
      quantity: isD ? 1 + Math.floor(rnd() * 3) : Math.round((0.5 + rnd() * 1.5) * 10) / 10,
      at: instant(date(offset), 21, 10),
      createdBy: rnd() < 0.6 ? 'demo-d001' : 'demo-d002',
      shiftId: shiftId(D, 'daily', offset),
      reasonCode: reasons[Math.floor(rnd() * reasons.length)],
      reason: 'Sentetik fire kaydı',
    })
  }
  for (const offset of [-14, -7, -3, -1]) {
    const rnd = prng(hash(`count${offset}`))
    const lines = (['demo-item-a', 'demo-item-b', 'demo-item-c', 'demo-item-d'] as const).map((id) => {
      const theoretical = state.movements.filter((m) => m.inventoryItemId === id && m.occurredAt <= instant(date(offset), 23, 30).toISOString()).reduce((s, m) => s + m.stockDelta, 0)
      const drift = id === 'demo-item-d' ? Math.round((rnd() - 0.6) * 6) : Math.round((rnd() - 0.6) * 20) / 10
      return { inventoryItemId: id, physicalQuantity: Math.max(0, Math.round((theoretical + drift) * 1000) / 1000) }
    })
    deps.submitCount(state, { branchId: D, shiftId: shiftId(D, 'daily', offset), lines, note: 'Sentetik kapanış sayımı' }, instant(date(offset), 23, 45))
  }
}
