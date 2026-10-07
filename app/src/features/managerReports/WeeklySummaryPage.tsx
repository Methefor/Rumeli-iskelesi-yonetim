import { useState } from 'react'
import { Unauthorized } from '../../components/navigation/Unauthorized'
import { Button, DataBoundary, EmptyState, PageHeader, Stack } from '../../components/ui'
import { canAnalytics, weekStartOf } from '../../domain/analytics'
import { dateTr } from '../../domain/managerReport'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../hooks/useAuth'
import { useSelectedBranch } from '../../hooks/useSelectedBranch'
import { addDaysIso, istanbulDate } from '../../utils/dates'
import { loadWeeklyReport } from './loadReport'
import { NarrativeView } from './NarrativeView'
import styles from './ManagerReports.module.css'

/**
 * HAFTALIK YÖNETİCİ ÖZETİ (Monday..Sunday, Europe/Istanbul business dates). The current week is shown as "in progress" and never as a
 * final week. The analytics-snapshot portions of a past week are immutable and versioned, but a completed week may still be `partial` (not exactly
 * reproducible) when mutable historical sources such as waste/count facts are included; current live state is never substituted into a past week.
 * Deterministic, no AI.
 */
export function WeeklySummaryPage() {
  const { roles } = useAuth()
  const { branches, loading: branchesLoading } = useSelectedBranch()
  const currentWeek = weekStartOf(istanbulDate())
  const [weekStart, setWeekStart] = useState(currentWeek)
  const canRead = canAnalytics(roles, 'analytics.read')
  const key = branchesLoading || !canRead || branches.length === 0 ? null : `weekly-report:${branches.map((b) => b.id).sort().join(',')}:${weekStart}`
  const state = useAsync(key, () => loadWeeklyReport(branches, weekStart))

  if (!canRead) return <Unauthorized message="Yönetici özeti için analiz yetkisi gerekir." />
  if (!branchesLoading && branches.length === 0) return <EmptyState icon="📋" title="Şube yok" description="Özet, erişebildiğiniz şubeler için hazırlanır." />

  const label = `${dateTr(weekStart)} – ${dateTr(addDaysIso(weekStart, 6))}`

  return (
    <Stack>
      <PageHeader title="Haftalık yönetici özeti" subtitle="Pazartesi – Pazar" back={{ to: '/app/manager', label: 'Kontrol merkezi' }} />
      <div className={styles.picker}>
        <Button variant="secondary" onClick={() => setWeekStart((w) => addDaysIso(w, -7))} aria-label="Önceki hafta">
          ‹ Önceki hafta
        </Button>
        <span className={styles.weekLabel} aria-live="polite">
          {label}
        </span>
        <Button variant="secondary" onClick={() => setWeekStart((w) => addDaysIso(w, 7))} disabled={weekStart >= currentWeek} aria-label="Sonraki hafta">
          Sonraki hafta ›
        </Button>
      </div>
      {weekStart !== currentWeek && (
        <Button variant="ghost" onClick={() => setWeekStart(currentWeek)}>
          Bu haftaya dön
        </Button>
      )}
      <DataBoundary state={state} rows={4}>
        {({ pack, narrative }) => <NarrativeView pack={pack} resolved={narrative} />}
      </DataBoundary>
    </Stack>
  )
}
