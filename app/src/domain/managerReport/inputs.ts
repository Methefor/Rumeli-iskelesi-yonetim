import type { AnalyticsInsight, AnalyticsOrigin, DailyAnalyticsPayload, Finalization, SnapshotEnvelope, WeeklyAnalyticsPayload } from '../analytics'
import type { AnalyticsSignalInsight, SignalPart } from '../commandCenter'
import type { BranchCountOverview, WasteReport } from '../inventory/control'
import type { ReportAccess } from './types'

/**
 * Raw inputs of the manager report: the SAME shapes the existing read models return. The only new read model is the batch
 * `get_manager_report_inputs` (supabase/migrations/20261007000100_manager_reports.sql), which merely BUNDLES existing snapshot and
 * report RPCs per branch. Nothing here is calculated.
 */

export type ReportInsight = Pick<AnalyticsInsight, 'code' | 'title' | 'confidence' | 'isFinancial' | 'origin'> | AnalyticsSignalInsight

/** One stored daily analytics snapshot reduced to what recurrence/weather-history needs (no financial values). */
export interface DayProjection {
  date: string
  state: 'present' | 'missing'
  snapshotVersion?: number
  finalization?: Finalization
  origin?: AnalyticsOrigin
  reconciliation?: { OK: number; WARNING: number; ERROR: number }
  zBelowX?: boolean
  multipleReadings?: boolean
  context?: {
    state: 'present' | 'missing'
    provenance?: 'manual' | 'observed' | 'reanalysis' | 'provider_historical' | null
    temperatureC?: number | null
    temperatureMinC?: number | null
    temperatureMaxC?: number | null
    precipitationMm?: number | null
  }
}

export interface ManagerReportBranchInput {
  branchId: string
  /** the caller's access to each underlying domain: analytics.read alone exposes nothing of them (see MANAGER_REPORT_MODEL.md) */
  access: ReportAccess
  /** daily scope: the snapshot of the business date */
  daily?: { envelope: SnapshotEnvelope<DailyAnalyticsPayload>; insights: ReportInsight[] } | null
  /** weekly scope: the snapshot of the week */
  weekly?: { envelope: SnapshotEnvelope<WeeklyAnalyticsPayload>; insights: ReportInsight[] } | null
  /** weekly scope: the 7 days of the week, from stored daily snapshots */
  days?: DayProjection[]
  /** waste of the date (daily) or of the week (weekly) */
  waste: SignalPart<WasteReport>
  /** recent closing counts (window of the latest 14) */
  counts: SignalPart<BranchCountOverview>
}

/** null = the branch could not be read by the caller (never an all-clear) */
export type ManagerReportInputs = Record<string, ManagerReportBranchInput | null>

/** Reduces a daily analytics envelope to the non-financial projection the weekly report needs (the SQL read model produces the same shape). */
export function projectDailyEnvelope(date: string, env: SnapshotEnvelope<DailyAnalyticsPayload>): DayProjection {
  const p = env.payload
  if (env.state === 'missing' || !p) return { date, state: 'missing' }
  const ctx = p.context
  return {
    date,
    state: 'present',
    snapshotVersion: env.version,
    finalization: p.finalization,
    origin: p.origin,
    reconciliation: p.reports?.reconciliation,
    zBelowX: p.warnings?.some((w) => w.code === 'z_below_x') ?? false,
    multipleReadings: p.warnings?.some((w) => w.code === 'multiple_active_readings') ?? false,
    context: ctx
      ? {
          state: ctx.state,
          provenance: ctx.provenance ?? null,
          temperatureC: ctx.temperatureC ?? null,
          temperatureMinC: ctx.temperatureMinC ?? null,
          temperatureMaxC: ctx.temperatureMaxC ?? null,
          precipitationMm: ctx.precipitationMm ?? null,
        }
      : undefined,
  }
}
