import { supabase } from './client'
import { friendlyErrorMessage, friendlyFromSupabaseError } from '../errors'
import type {
  AiOutput,
  AnalyticsInsight,
  DailyAnalyticsPayload,
  SnapshotEnvelope,
  WeeklyAnalyticsPayload,
} from '../../domain/analytics'

/**
 * Analytics reads/regeneration. Metrics are calculated by the database
 * (supabase/migrations/20261006000100_analytics_engine_v1.sql); this module only
 * fetches snapshots, never computes a number. Authorization (analytics.* +
 * branch scope, financial redaction) is enforced by the RPCs and RLS.
 */

export interface AnalyticsMutationResult {
  error: string | null
  version?: number
  unchanged?: boolean
}

export interface AnalyticsReportView {
  version: number
  status: 'generated' | 'failed' | 'invalid'
  generatedAt: string
  model: string | null
  output: AiOutput | null
  errorCode: string | null
}

function failRead(error: { message?: string; code?: string }): never {
  throw new Error(friendlyErrorMessage(error.message, error.code))
}

export async function getDailyAnalytics(
  branchId: string,
  date: string,
): Promise<SnapshotEnvelope<DailyAnalyticsPayload>> {
  const { data, error } = await supabase.rpc('get_daily_analytics', { p_branch_id: branchId, p_date: date })
  if (error) failRead(error)
  return data as SnapshotEnvelope<DailyAnalyticsPayload>
}

export async function getWeeklyAnalytics(
  branchId: string,
  weekStart: string,
): Promise<SnapshotEnvelope<WeeklyAnalyticsPayload>> {
  const { data, error } = await supabase.rpc('get_weekly_analytics', { p_branch_id: branchId, p_week_start: weekStart })
  if (error) failRead(error)
  return data as SnapshotEnvelope<WeeklyAnalyticsPayload>
}

interface InsightRow {
  id: string
  scope: 'daily' | 'weekly'
  confidence: AnalyticsInsight['confidence']
  code: string
  title: string
  body: string | null
  evidence: Record<string, unknown>
  is_financial: boolean
  origin: 'deterministic' | 'ai'
}

/** Insights of the CURRENT snapshot version of a day or a week. RLS hides financial ones without the permission. */
export async function listAnalyticsInsights(
  branchId: string,
  scope: 'daily' | 'weekly',
  snapshotId: string | undefined,
): Promise<AnalyticsInsight[]> {
  if (!snapshotId) return []
  const column = scope === 'daily' ? 'daily_snapshot_id' : 'weekly_snapshot_id'
  const { data, error } = await supabase
    .from('analytics_insights')
    .select('id, scope, confidence, code, title, body, evidence, is_financial, origin')
    .eq('branch_id', branchId)
    .eq(column, snapshotId)
    .order('created_at', { ascending: true })
  if (error) failRead(error)
  return (data as InsightRow[]).map((r) => ({
    id: r.id,
    scope: r.scope,
    confidence: r.confidence,
    code: r.code,
    title: r.title,
    body: r.body,
    evidence: r.evidence,
    isFinancial: r.is_financial,
    origin: r.origin,
  }))
}

export async function regenerateDailyAnalytics(branchId: string, date: string, reason: string): Promise<AnalyticsMutationResult> {
  const { data, error } = await supabase.rpc('regenerate_daily_analytics', { p_branch_id: branchId, p_date: date, p_reason: reason })
  const message = friendlyFromSupabaseError(error)
  if (message) return { error: message }
  const res = data as { version: number; unchanged: boolean }
  return { error: null, version: res.version, unchanged: res.unchanged }
}

export async function regenerateWeeklyAnalytics(branchId: string, weekStart: string, reason: string): Promise<AnalyticsMutationResult> {
  const { data, error } = await supabase.rpc('regenerate_weekly_analytics', { p_branch_id: branchId, p_week_start: weekStart, p_reason: reason })
  const message = friendlyFromSupabaseError(error)
  if (message) return { error: message }
  const res = data as { version: number; unchanged: boolean }
  return { error: null, version: res.version, unchanged: res.unchanged }
}

interface ReportRow {
  version: number
  status: AnalyticsReportView['status']
  generated_at: string
  model: string | null
  output: AiOutput | null
  error_code: string | null
}

/** Latest AI report of a week, or null. A missing/failed report never affects the metrics. */
export async function getAnalyticsReport(branchId: string, weekStart: string): Promise<AnalyticsReportView | null> {
  const { data, error } = await supabase
    .from('analytics_reports')
    .select('version, status, generated_at, model, output, error_code')
    .eq('branch_id', branchId)
    .eq('week_start', weekStart)
    .order('version', { ascending: false })
    .limit(1)
  if (error) return null
  const row = (data as ReportRow[] | null)?.[0]
  if (!row) return null
  return { version: row.version, status: row.status, generatedAt: row.generated_at, model: row.model, output: row.output, errorCode: row.error_code }
}
