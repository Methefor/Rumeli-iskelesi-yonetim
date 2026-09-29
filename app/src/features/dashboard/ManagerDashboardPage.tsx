import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildBranchDetail,
  buildDashboard,
  buildOperationalSummary,
  resolveDashboardPeriod,
  type DashboardPeriodKind,
} from '../../domain/dashboard'
import { DataBoundary, PageHeader, SegmentedControl, Stack } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../hooks/useAuth'
import { useSelectedBranch } from '../../hooks/useSelectedBranch'
import { fetchBranchDashboardRaw } from '../../services/data'
import { formatDateTime } from '../../utils/dates'
import { BranchComparison } from './BranchComparison'
import { BranchDetail } from './BranchDetail'
import { OperationalEfficiency } from './OperationalEfficiency'
import { OrganizationOverview } from './OrganizationOverview'
import styles from './Dashboard.module.css'

const PERIOD_OPTIONS: Array<{ value: Exclude<DashboardPeriodKind, 'custom'>; label: string }> = [
  { value: 'today', label: 'Bugün' },
  { value: '7d', label: 'Son 7 gün' },
  { value: '30d', label: 'Son 30 gün' },
]

/**
 * The manager's operational and financial control center. Every number on
 * this page comes from `domain/dashboard` (period model + aggregation) fed
 * by `services/data` — nothing here computes revenue, gross profit,
 * reconciliation status or shift completion itself. See
 * `DASHBOARD_MODEL.md` for the money/period/missing-data rules this page
 * must never violate.
 */
export function ManagerDashboardPage() {
  const { profile } = useAuth()
  const { branches, loading: branchesLoading } = useSelectedBranch()
  const [periodKind, setPeriodKind] = useState<Exclude<DashboardPeriodKind, 'custom'>>('today')
  const [detailBranchId, setDetailBranchId] = useState<string | null>(null)
  // Resolved ONCE per render pass and threaded through every fetch/aggregation below —
  // no widget computes its own "today"/"7 days ago" independently (see period.ts).
  const period = useMemo(() => resolveDashboardPeriod(periodKind), [periodKind])

  const branchIdsKey = branches
    .map((b) => b.id)
    .sort()
    .join(',')
  const state = useAsync(
    branchesLoading ? null : `manager-dashboard:${branchIdsKey}:${period.kind}:${period.fromDate}:${period.toDateInclusive}`,
    async () => {
      const raws = await Promise.all(
        branches.map((b) => fetchBranchDashboardRaw(b.id, b.key, b.name, period)),
      )
      const { organization, branches: rows } = buildDashboard(period, raws)
      const operational = buildOperationalSummary(rows)
      return { raws, organization, rows, operational }
    },
  )

  const refreshedAtRef = useRef<Date | null>(null)
  useEffect(() => {
    if (state.data) refreshedAtRef.current = new Date()
  }, [state.data])

  return (
    <Stack>
      <PageHeader
        title="Yönetim Paneli"
        subtitle={profile?.fullName ? `Merhaba, ${profile.fullName}.` : undefined}
      />
      <div className={styles.periodRow}>
        <SegmentedControl
          label="Dönem"
          options={PERIOD_OPTIONS}
          value={periodKind}
          onChange={setPeriodKind}
        />
      </div>

      <DataBoundary state={state} rows={5}>
        {(data) => {
          const selected =
            data.rows.find((r) => r.branchId === detailBranchId) ?? data.rows[0] ?? null
          const selectedRaw = selected ? data.raws.find((r) => r.branchId === selected.branchId) : null

          return (
            <Stack>
              <OrganizationOverview summary={data.organization} />
              <BranchComparison
                rows={data.rows}
                selectedBranchId={selected?.branchId ?? null}
                onSelectBranch={setDetailBranchId}
              />
              <OperationalEfficiency summary={data.operational} />
              {selected && selectedRaw && <BranchDetail detail={buildBranchDetail(selected, selectedRaw)} />}
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
