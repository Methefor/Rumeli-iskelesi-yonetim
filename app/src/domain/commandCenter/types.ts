import type { BranchCountOverview, WasteReport } from '../inventory/control'
import type { ProcurementAttention } from '../procurement'
import type { BranchWeather } from '../weather'

/**
 * Command Center model. TypeScript twin of get_branch_operations_signals (supabase/migrations/20261006000800_command_center.sql):
 * the SQL bundles the EXISTING read models of one branch; this module derives the prioritised attention feed from them and from the
 * existing dashboard model. No revenue logic and no analytics calculation lives here.
 */

/** One part of the bundle: available, or unavailable with the reason (no_permission, no_snapshot, ...). Never an empty success. */
export type SignalPart<T> = { state: 'available'; data: T } | { state: 'unavailable'; reason: string }

export interface AnalyticsSignalInsight {
  code: string
  title: string
  confidence: 'fact' | 'relationship' | 'hypothesis'
  isFinancial: boolean
  origin: 'deterministic' | 'ai'
}

/** The latest EXISTING snapshots (nothing is recomputed): the daily one and the current week's one. Either may be missing. */
export interface AnalyticsSignal {
  daily: { businessDate: string; version: number; generatedAt: string; completeness: string | null; insights: AnalyticsSignalInsight[] } | null
  weekly: { weekStart: string; version: number; generatedAt: string; weekComplete: boolean; insights: AnalyticsSignalInsight[] } | null
}

export interface BranchSignals {
  branchId: string
  /** the branch-local business date (branch time zone) */
  businessDate: string
  timezone: string
  location: { state: 'set' | 'missing' }
  counts: SignalPart<BranchCountOverview>
  waste: SignalPart<WasteReport>
  procurement: SignalPart<ProcurementAttention>
  weather: SignalPart<BranchWeather>
  analytics: SignalPart<AnalyticsSignal>
}

export type AttentionSeverity = 'critical' | 'warning' | 'info'

/** Category = priority order: data integrity first, analytics observations last. */
export type AttentionCategory = 'data_integrity' | 'reporting' | 'inventory' | 'procurement' | 'weather' | 'analytics'

export type AttentionSource = 'dashboard' | 'inventory_control' | 'procurement' | 'weather' | 'analytics'

export interface AttentionItem {
  id: string
  branchId: string
  branchName: string
  category: AttentionCategory
  severity: AttentionSeverity
  title: string
  description: string
  /** stable machine code, e.g. reconciliation_error, count_unexplained_shortage */
  reasonCode: string
  source: AttentionSource
  businessDate: string
  /** where tapping the item leads (never a dead informational card) */
  actionRoute: string
  /** a count/amount behind the item, when there is one; otherwise null (no fake zero) */
  count: number | null
  /** due today / overdue / awaiting a decision: sorted ahead of timeless items of the same severity and category */
  timeSensitive: boolean
  observedAt: string
}

export interface AttentionFeed {
  items: AttentionItem[]
  counts: Record<AttentionSeverity, number>
  /** sources a role cannot see or that are not available: shown as a coverage note, never silently as "all clear" */
  unavailableSources: Array<{ branchId: string; branchName: string; source: AttentionSource; reason: string }>
}
