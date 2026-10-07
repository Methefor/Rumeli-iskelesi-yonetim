import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildBranchDetail,
  buildDashboard,
  buildOperationalSummary,
  resolveDashboardPeriod,
  type DashboardPeriodKind,
} from '../../domain/dashboard'
import { buildAttentionFeed, type BranchSignals } from '../../domain/commandCenter'
import { DataBoundary, PageHeader, SegmentedControl, Stack } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../hooks/useAuth'
import { useSelectedBranch } from '../../hooks/useSelectedBranch'
import { fetchDashboardRaws, getCommandCenterSignals } from '../../services/data'
import { formatDateTime } from '../../utils/dates'
import { AnalyticsPanel } from '../commandCenter/AnalyticsPanel'
import { AttentionFeedView } from '../commandCenter/AttentionFeedView'
import { OperationsPanel } from '../commandCenter/OperationsPanel'
import { ReportEntryPoints } from '../commandCenter/ReportEntryPoints'
import { TodaySummary } from '../commandCenter/TodaySummary'
import { WeatherPanel } from '../commandCenter/WeatherPanel'
import { BranchComparison } from './BranchComparison'
import { BranchDetail } from './BranchDetail'
import { OperationalEfficiency } from './OperationalEfficiency'
import { OrganizationOverview } from './OrganizationOverview'
import styles from './Dashboard.module.css'

const PERIOD_OPTIONS: Array<{
  value: Exclude<DashboardPeriodKind, 'custom'>
  label: string
}> = [
  { value: 'today', label: 'Bugün' },
  { value: '7d', label: 'Son 7 gün' },
  { value: '30d', label: 'Son 30 gün' },
]

/**
 * The MANAGER COMMAND CENTER. Hierarchy: A. today summary, B. attention required, C. operations, D. weather/context, E. analytics, then
 * the existing period-based PERFORMANCE section (branch comparison and drill-down) unchanged.
 *
 * Data: TWO batch requests for all branches (get_dashboard_inputs: raw inputs of the existing domain/dashboard model for TODAY, and
 * get_command_center_signals: the bundled per-branch signals) - a constant request count, never N+1. A failing signals call degrades that branch to "unavailable", never to "all clear". Every number
 * comes from domain/dashboard or the existing read models; the attention feed is derived deterministically in domain/commandCenter.
 * See COMMAND_CENTER_MODEL.md and DASHBOARD_MODEL.md for the money/period/missing-data rules this page must never violate.
 */
export function ManagerDashboardPage() {
  const { profile } = useAuth()
  const { branches, loading: branchesLoading } = useSelectedBranch()
  const [periodKind, setPeriodKind] =
    useState<Exclude<DashboardPeriodKind, 'custom'>>('today')
  const [detailBranchId, setDetailBranchId] = useState<string | null>(null)
  // Resolved ONCE per render pass and threaded through every fetch/aggregation below —
  // no widget computes its own "today"/"7 days ago" independently (see period.ts).
  const todayPeriod = useMemo(() => resolveDashboardPeriod('today'), [])
  const period = useMemo(() => resolveDashboardPeriod(periodKind), [periodKind])

  const branchIdsKey = branches
    .map((b) => b.id)
    .sort()
    .join(',')

  // TODAY: the command center (dashboard model for today + the bundled per-branch signals)
  const today = useAsync(
    branchesLoading ? null : `command-center:${branchIdsKey}:${todayPeriod.fromDate}`,
    async () => {
      // TWO batch requests in total (dashboard inputs + signals), independent of the number of branches
      const [raws, signals]: [Awaited<ReturnType<typeof fetchDashboardRaws>>, Record<string, BranchSignals | null>] = await Promise.all([
        fetchDashboardRaws(branches, todayPeriod),
        getCommandCenterSignals(branches.map((b) => b.id)).catch(() => ({}) as Record<string, BranchSignals | null>),
      ])
      const now = new Date()
      const { organization, branches: rows } = buildDashboard(todayPeriod, raws)
      const feed = buildAttentionFeed(
        rows.map((row) => ({ branchId: row.branchId, branchName: row.branchName, row, signals: signals[row.branchId] ?? null, now })),
      )
      return { raws, organization, rows, operational: buildOperationalSummary(rows), signals, feed, now }
    },
  )

  // PERFORMANCE: reuses today's data for "Bugün"; other periods fetch their own (no duplicate calls for the default view)
  const other = useAsync(
    branchesLoading || periodKind === 'today'
      ? null
      : `manager-dashboard:${branchIdsKey}:${period.kind}:${period.fromDate}:${period.toDateInclusive}`,
    async () => {
      const raws = await fetchDashboardRaws(branches, period) // one batch request for any period
      const { organization, branches: rows } = buildDashboard(period, raws)
      return { raws, organization, rows, operational: buildOperationalSummary(rows) }
    },
  )
  const perf =
    periodKind === 'today'
      ? {
          data: today.data ? { raws: today.data.raws, organization: today.data.organization, rows: today.data.rows, operational: today.data.operational } : null,
          error: today.error,
          loading: today.loading,
          reload: today.reload,
        }
      : other

  const refreshedAtRef = useRef<Date | null>(null)
  useEffect(() => {
    if (today.data) refreshedAtRef.current = new Date()
  }, [today.data])

  return (
    <Stack>
      <PageHeader
        title="Rumeli Kontrol Merkezi"
        subtitle={
          profile?.fullName
            ? `${profile.fullName} · Şubeler, riskler ve günlük sonuçlar`
            : 'Şubeler, riskler ve günlük sonuçlar'
        }
      />

      <DataBoundary state={today} rows={4}>
        {(c) => (
          <Stack>
            <TodaySummary organization={c.organization} rows={c.rows} businessDate={todayPeriod.fromDate} />
            <ReportEntryPoints />
            <AttentionFeedView feed={c.feed} multiBranch={c.rows.length > 1} />
            <OperationsPanel rows={c.rows} signals={c.signals} />
            <WeatherPanel branches={c.rows.map((r) => ({ id: r.branchId, name: r.branchName }))} signals={c.signals} now={c.now} />
            <AnalyticsPanel rows={c.rows} signals={c.signals} />
          </Stack>
        )}
      </DataBoundary>

      <h2 className={styles.sectionTitle}>Performans</h2>
      <div className={styles.periodRow}>
        <SegmentedControl
          label="Dönem"
          options={PERIOD_OPTIONS}
          value={periodKind}
          onChange={setPeriodKind}
        />
      </div>

      <DataBoundary state={perf} rows={5}>
        {(data) => {
          const selected =
            data.rows.find((r) => r.branchId === detailBranchId) ?? data.rows[0] ?? null
          const selectedRaw = selected
            ? data.raws.find((r) => r.branchId === selected.branchId)
            : null

          return (
            <Stack>
              <OrganizationOverview summary={data.organization} />
              <BranchComparison
                rows={data.rows}
                selectedBranchId={selected?.branchId ?? null}
                onSelectBranch={setDetailBranchId}
              />
              <OperationalEfficiency summary={data.operational} />
              {selected && selectedRaw && (
                <BranchDetail detail={buildBranchDetail(selected, selectedRaw)} />
              )}
              {refreshedAtRef.current && (
                <p className={styles.footnote}>
                  Son yenileme: {formatDateTime(refreshedAtRef.current.toISOString())}
                </p>
              )}
            </Stack>
          )
        }}
      </DataBoundary>
    </Stack>
  )
}
