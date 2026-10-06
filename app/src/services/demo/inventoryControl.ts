/**
 * Demo mirror of services/supabase/inventoryControl.ts. Same results as the SQL functions for the same data
 * (shared rules in domain/inventory/control.ts), computed over the in-memory SYNTHETIC store. Zero network.
 * Nothing here is business data; authorization mirrors RLS + the RPCs for demo review only.
 */
import {
  COUNT_METHOD,
  canManageWasteReasons,
  canReviewControl,
  classifyCountLine,
  costMetric,
  type BranchCountOverview,
  type CountReview,
  type CountReviewLine,
  type CountSummary,
  type QuantityByUnit,
  type WasteReport,
} from '../../domain/inventory/control'
import { canInventory } from '../../domain/inventory'
import { currentDemoUser } from '../../features/auth/demoSession'
import type { DemoUser } from '../../features/auth/demoUsers'
import { istanbulDate } from '../../utils/dates'
import type { ControlResult, UpsertWasteReasonInput } from '../supabase/inventoryControl'
import { demoState } from './state'
import type { DemoCount, DemoMovement, DemoState } from './store'

const DENIED = 'Bu işlem için yetkiniz yok.'
const CODE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/

function inScope(actor: DemoUser, branchId: string): boolean {
  return actor.roles.includes('owner') || actor.roles.includes('manager') || actor.branchIds.includes(branchId)
}

function reviewActor(branchId: string): DemoUser {
  const actor = currentDemoUser()
  if (!actor || !canReviewControl(actor.roles) || !inScope(actor, branchId)) throw new Error(DENIED)
  return actor
}

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000

function sumByUnit(rows: Array<{ unit: string; quantity: number }>): QuantityByUnit[] {
  const map = new Map<string, number>()
  for (const r of rows) map.set(r.unit, round3((map.get(r.unit) ?? 0) + r.quantity))
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([unit, quantity]) => ({ unit, quantity }))
}

function isReversed(state: DemoState, movement: DemoMovement): boolean {
  return state.movements.some((m) => m.reversesMovementId === movement.id)
}

// ---------------------------------------------------------------------------
// Waste report
// ---------------------------------------------------------------------------

export function buildWasteReport(state: DemoState, branchId: string, from: string, to: string, canCost: boolean): WasteReport {
  const inRange = state.movements.filter((m) => {
    if (m.branchId !== branchId || m.type !== 'WASTE') return false
    const day = istanbulDate(new Date(m.occurredAt))
    return day >= from && day <= to
  })
  const live = inRange.filter((m) => !isReversed(state, m))
  const itemOf = (m: DemoMovement) => state.items.find((i) => i.id === m.inventoryItemId)
  const unitOf = (m: DemoMovement) => itemOf(m)?.unit ?? ''
  const costed = (m: DemoMovement) => m.unitCostSnapshot !== null
  const metric = (rows: DemoMovement[]) =>
    costMetric(
      rows.reduce((s, m) => s + m.quantity, 0),
      rows.filter(costed).reduce((s, m) => s + m.quantity, 0),
      rows.filter(costed).reduce((s, m) => s + m.quantity * (m.unitCostSnapshot ?? 0), 0),
      canCost,
    )
  const group = <K>(rows: DemoMovement[], key: (m: DemoMovement) => K) => {
    const map = new Map<K, DemoMovement[]>()
    for (const m of rows) map.set(key(m), [...(map.get(key(m)) ?? []), m])
    return map
  }

  const employeeOf = (id: string) => state.employees.find((e) => e.id === id)
  const shiftOf = (id: string | null) => (id ? state.shifts.find((s) => s.id === id) : undefined)

  return {
    branchId,
    from,
    to,
    entries: live.length,
    reversedEntries: inRange.length - live.length,
    cost: metric(live),
    costCoverage: {
      state: !canCost ? 'unavailable' : live.length === 0 || live.every(costed) ? 'available' : live.some(costed) ? 'partial' : 'unavailable',
      costedEntries: live.filter(costed).length,
      entries: live.length,
    },
    quantityByUnit: sumByUnit(live.map((m) => ({ unit: unitOf(m), quantity: m.quantity }))),
    byItem: [...group(live, (m) => m.inventoryItemId).entries()]
      .map(([id, rows]) => ({ id, rows, item: state.items.find((i) => i.id === id) }))
      .sort((a, b) => (a.item?.code ?? '').localeCompare(b.item?.code ?? ''))
      .map(({ id, rows, item }) => ({
        inventoryItemId: id,
        code: item?.code ?? '',
        name: item?.name ?? '',
        unit: item?.unit ?? '',
        entries: rows.length,
        quantity: round3(rows.reduce((s, m) => s + m.quantity, 0)),
        cost: metric(rows),
      })),
    byReason: [...group(live, (m) => m.reasonCode ?? '').entries()]
      .sort(([ka, a], [kb, b]) => b.length - a.length || ka.localeCompare(kb))
      .map(([code, rows]) => ({
        reasonCode: code,
        name: state.wasteReasons.find((r) => r.code === code)?.name ?? code,
        entries: rows.length,
        quantityByUnit: sumByUnit(rows.map((m) => ({ unit: unitOf(m), quantity: m.quantity }))),
        cost: metric(rows),
      })),
    byEmployee: [...group(live, (m) => m.createdBy).entries()]
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([id, rows]) => ({
        userId: id,
        name: employeeOf(id)?.fullName ?? 'Bilinmiyor',
        employeeCode: employeeOf(id)?.employeeCode ?? null,
        entries: rows.length,
        cost: metric(rows),
      })),
    byShift: [...group(live, (m) => m.shiftId).entries()]
      .map(([id, rows]) => ({
        shiftId: id,
        label: shiftOf(id)?.definition.name ?? 'Vardiya belirtilmedi',
        businessDate: shiftOf(id)?.businessDate ?? null,
        entries: rows.length,
        cost: metric(rows),
      }))
      .sort((a, b) => (a.businessDate ?? '9999').localeCompare(b.businessDate ?? '9999') || a.label.localeCompare(b.label)),
  }
}

// ---------------------------------------------------------------------------
// Count classification
// ---------------------------------------------------------------------------

/**
 * Waste RECORDED after the count, same item, inside the count window: a timing-uncertain CANDIDATE, never a confirmation
 * (mirror of inventory_count_classified_lines; occurredAt is the insertion instant, there is no separate effective time).
 */
export function candidateWasteFor(state: DemoState, count: DemoCount, itemId: string): number {
  const nextAt = state.counts
    .filter((c) => c.branchId === count.branchId && c.status === 'submitted' && c.submittedAt > count.submittedAt && c.lines.some((l) => l.inventoryItemId === itemId))
    .map((c) => c.submittedAt)
    .sort()[0]
  return round3(
    state.movements
      .filter((m) => {
        if (m.inventoryItemId !== itemId || m.type !== 'WASTE') return false
        if (m.occurredAt <= count.submittedAt || (nextAt !== undefined && m.occurredAt >= nextAt)) return false
        if (isReversed(state, m)) return false
        if (count.shiftId && m.shiftId === count.shiftId) return true
        return (count.shiftId === null || m.shiftId === null) && istanbulDate(new Date(m.occurredAt)) === count.businessDate
      })
      .reduce((s, m) => s + m.quantity, 0),
  )
}

function classifiedLines(state: DemoState, count: DemoCount, canCost: boolean): CountReviewLine[] {
  return count.lines
    .map((l) => {
      const item = state.items.find((i) => i.id === l.inventoryItemId)
      const c = classifyCountLine(l.theoreticalQuantity, l.physicalQuantity, candidateWasteFor(state, count, l.inventoryItemId))
      const costs = state.costs
        .filter((x) => x.inventoryItemId === l.inventoryItemId && x.effectiveFrom <= count.submittedAt)
        .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))
      const unitCost = costs[0]?.unitCost ?? null
      const variance = l.varianceQuantity
      const varianceValue: CountReviewLine['varianceValue'] = !canCost
        ? { state: 'unavailable', reason: 'no_permission' }
        : variance === 0
          ? { state: 'available', value: 0 }
          : unitCost === null
            ? { state: 'unavailable', reason: 'missing_cost' }
            : { state: 'available', value: Math.round(variance * unitCost * 100) / 100 }
      return {
        inventoryItemId: l.inventoryItemId,
        code: item?.code ?? '',
        name: item?.name ?? '',
        unit: item?.unit ?? '',
        expectedQuantity: l.theoreticalQuantity,
        physicalQuantity: l.physicalQuantity,
        varianceQuantity: variance,
        classification: c.classification,
        explanation: {
          status: c.explanation,
          candidateWasteQuantity: c.candidateWasteQuantity,
          potentialExplainedQuantity: c.potentialExplainedQuantity,
          confirmedExplainedQuantity: c.confirmedExplainedQuantity,
          unexplainedQuantity: c.unexplainedQuantity,
        },
        varianceValue,
      }
    })
    .sort((a, b) => a.code.localeCompare(b.code))
}

export function summarizeCount(state: DemoState, count: DemoCount, canCost: boolean): CountSummary {
  const lines = classifiedLines(state, count, canCost)
  const unitCostOf = (l: CountReviewLine) => (l.varianceValue.state === 'available' ? (l.varianceValue.value ?? 0) : null)
  const varied = lines.filter((l) => l.varianceQuantity !== 0)
  return {
    lines: lines.length,
    balancedLines: lines.filter((l) => l.classification === 'balanced').length,
    shortageLines: lines.filter((l) => l.classification === 'shortage').length,
    surplusLines: lines.filter((l) => l.classification === 'surplus').length,
    timingUncertainLines: lines.filter((l) => l.explanation.status === 'timing_uncertain').length,
    unexplainedLines: lines.filter((l) => l.explanation.status === 'unexplained').length,
    unexplainedQuantityByUnit: sumByUnit(lines.filter((l) => l.explanation.status === 'unexplained').map((l) => ({ unit: l.unit, quantity: l.explanation.unexplainedQuantity }))),
    timingUncertainQuantityByUnit: sumByUnit(lines.filter((l) => l.explanation.status === 'timing_uncertain').map((l) => ({ unit: l.unit, quantity: l.explanation.unexplainedQuantity }))),
    shortageQuantityByUnit: sumByUnit(lines.filter((l) => l.classification === 'shortage').map((l) => ({ unit: l.unit, quantity: -l.varianceQuantity }))),
    surplusQuantityByUnit: sumByUnit(lines.filter((l) => l.classification === 'surplus').map((l) => ({ unit: l.unit, quantity: l.varianceQuantity }))),
    varianceValue: costMetric(
      varied.reduce((s, l) => s + Math.abs(l.varianceQuantity), 0),
      varied.filter((l) => unitCostOf(l) !== null).reduce((s, l) => s + Math.abs(l.varianceQuantity), 0),
      varied.reduce((s, l) => s + (unitCostOf(l) ?? 0), 0),
      canCost,
    ),
  }
}

function canSeeCost(actor: DemoUser, branchId: string): boolean {
  return canInventory(actor.roles, 'inventory.cost.read') && inScope(actor, branchId)
}

function submitterOf(state: DemoState, count: DemoCount) {
  const e = state.employees.find((x) => x.id === count.submittedBy)
  return { userId: count.submittedBy ?? null, name: e?.fullName ?? null, employeeCode: e?.employeeCode ?? null }
}

export const demoInventoryControl = {
  async listWasteReasons() {
    const state = demoState()
    const actor = currentDemoUser()
    if (!actor) return []
    const manager = canManageWasteReasons(actor.roles)
    return [...state.wasteReasons].filter((r) => manager || r.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  },

  async upsertWasteReason(input: UpsertWasteReasonInput): Promise<ControlResult> {
    const state = demoState()
    const actor = currentDemoUser()
    if (!actor || !canManageWasteReasons(actor.roles)) return { error: DENIED }
    if (input.reason.trim().length < 5) return { error: 'En az 5 karakterlik bir gerekçe yazın.' }
    if (!input.name.trim()) return { error: 'Ad zorunludur.' }
    if (input.id === null) {
      const code = input.code.trim().toLowerCase()
      if (!CODE_PATTERN.test(code)) return { error: 'Kod küçük harf, rakam ve alt çizgiden oluşmalı (2-40 karakter, harfle başlamalı).' }
      if (state.wasteReasons.some((r) => r.code === code)) return { error: 'Bu kod zaten kullanılıyor.' }
      state.wasteReasons.push({ id: `demo-reason-${code}`, code, name: input.name.trim(), description: input.description?.trim() || null, isActive: true, sortOrder: input.sortOrder })
      return { error: null }
    }
    const reason = state.wasteReasons.find((r) => r.id === input.id)
    if (!reason) return { error: 'Fire nedeni bulunamadı.' }
    reason.name = input.name.trim() // the code is immutable
    reason.description = input.description?.trim() || null
    reason.sortOrder = input.sortOrder
    return { error: null }
  },

  async setWasteReasonActive(reasonId: string, active: boolean, reason: string): Promise<ControlResult> {
    const actor = currentDemoUser()
    if (!actor || !canManageWasteReasons(actor.roles)) return { error: DENIED }
    if (reason.trim().length < 5) return { error: 'En az 5 karakterlik bir gerekçe yazın.' }
    const row = demoState().wasteReasons.find((r) => r.id === reasonId)
    if (!row) return { error: 'Fire nedeni bulunamadı.' }
    row.isActive = active
    return { error: null }
  },

  async getWasteReport(branchId: string, from: string, to: string): Promise<WasteReport> {
    const actor = reviewActor(branchId)
    if (to < from) throw new Error('Geçerli bir tarih aralığı seçin.')
    return buildWasteReport(demoState(), branchId, from, to, canSeeCost(actor, branchId))
  },

  async getInventoryCountReview(countId: string): Promise<CountReview> {
    const state = demoState()
    const count = state.counts.find((c) => c.id === countId)
    if (!count) throw new Error(DENIED)
    const actor = reviewActor(count.branchId)
    const canCost = canSeeCost(actor, count.branchId)
    const shift = count.shiftId ? state.shifts.find((s) => s.id === count.shiftId) : undefined
    return {
      count: {
        id: count.id,
        branchId: count.branchId,
        shiftId: count.shiftId,
        shiftName: shift?.definition.name ?? null,
        businessDate: count.businessDate,
        status: count.status,
        submittedAt: count.submittedAt,
        submittedBy: submitterOf(state, count),
        note: count.note,
        voidedAt: count.status === 'voided' ? count.submittedAt : null,
        voidReason: count.voidReason ?? null,
      },
      summary: summarizeCount(state, count, canCost),
      lines: classifiedLines(state, count, canCost),
      method: COUNT_METHOD,
    }
  },

  async getBranchCountOverview(branchId: string): Promise<BranchCountOverview> {
    const actor = reviewActor(branchId)
    const state = demoState()
    const canCost = canSeeCost(actor, branchId)
    const today = istanbulDate(state.now())
    const counts = state.counts.filter((c) => c.branchId === branchId).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
    const todays = counts.filter((c) => c.businessDate === today)
    const latest = counts.find((c) => c.status === 'submitted')
    return {
      branchId,
      today,
      todayStatus: todays.some((c) => c.status === 'submitted') ? 'submitted' : todays.some((c) => c.status === 'voided') ? 'voided_only' : 'missing',
      latestCountId: latest?.id ?? null,
      latestSummary: latest ? summarizeCount(state, latest, canCost) : null,
      recent: counts.slice(0, 10).map((c) => {
        const who = submitterOf(state, c)
        return {
          id: c.id,
          businessDate: c.businessDate,
          status: c.status,
          submittedAt: c.submittedAt,
          shiftId: c.shiftId,
          submittedBy: who.name,
          employeeCode: who.employeeCode,
          voidReason: c.voidReason ?? null,
          summary: c.status === 'submitted' ? summarizeCount(state, c, canCost) : null,
        }
      }),
    }
  }
}
