import { useState } from 'react'
import { Unauthorized } from '../../components/navigation/Unauthorized'
import { Button, DataBoundary, EmptyState, Input, PageHeader, Stack } from '../../components/ui'
import { canAnalytics } from '../../domain/analytics'
import { dateWithWeekdayTr } from '../../domain/managerReport'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../hooks/useAuth'
import { useSelectedBranch } from '../../hooks/useSelectedBranch'
import { addDaysIso, istanbulDate } from '../../utils/dates'
import { loadDailyReport } from './loadReport'
import { NarrativeView } from './NarrativeView'
import styles from './ManagerReports.module.css'

/**
 * GÜNLÜK YÖNETİCİ ÖZETİ. A deterministic Turkish summary rendered from the validated daily Fact Pack (see MANAGER_REPORT_MODEL.md).
 * It reads existing read models (3 requests for today, 2 for a past date, whatever the number of branches), recomputes nothing and
 * calls no AI. Missing data is stated, never turned into a reassuring sentence.
 */
export function DailySummaryPage() {
  const { roles } = useAuth()
  const { branches, loading: branchesLoading } = useSelectedBranch()
  const today = istanbulDate()
  const [date, setDate] = useState(today)
  const canRead = canAnalytics(roles, 'analytics.read')
  const key = branchesLoading || !canRead || branches.length === 0 ? null : `daily-report:${branches.map((b) => b.id).sort().join(',')}:${date}`
  const state = useAsync(key, () => loadDailyReport(branches, date))

  if (!canRead) return <Unauthorized message="Yönetici özeti için analiz yetkisi gerekir." />
  if (!branchesLoading && branches.length === 0) return <EmptyState icon="📋" title="Şube yok" description="Özet, erişebildiğiniz şubeler için hazırlanır." />

  const shift = (days: number) => setDate((d) => addDaysIso(d, days))

  return (
    <Stack>
      <PageHeader title="Günlük yönetici özeti" subtitle={dateWithWeekdayTr(date)} back={{ to: '/app/manager', label: 'Kontrol merkezi' }} />
      <div className={styles.picker}>
        <Button variant="secondary" onClick={() => shift(-1)} aria-label="Önceki gün">
          ‹ Önceki gün
        </Button>
        <Input label="Tarih" type="date" value={date} max={today} onChange={(e) => e.target.value && e.target.value <= today && setDate(e.target.value)} />
        <Button variant="secondary" onClick={() => shift(1)} disabled={date >= today} aria-label="Sonraki gün">
          Sonraki gün ›
        </Button>
      </div>
      <DataBoundary state={state} rows={4}>
        {({ pack, narrative }) => <NarrativeView pack={pack} resolved={narrative} />}
      </DataBoundary>
    </Stack>
  )
}
