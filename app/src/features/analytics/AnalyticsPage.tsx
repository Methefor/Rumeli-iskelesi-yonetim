import { useState } from 'react'
import { canAnalytics, weekStartOf } from '../../domain/analytics'
import { Unauthorized } from '../../components/navigation/Unauthorized'
import { DataBoundary, EmptyState, Input, PageHeader, SegmentedControl, Stack } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { useAuth } from '../../hooks/useAuth'
import { useSelectedBranch } from '../../hooks/useSelectedBranch'
import {
  getAnalyticsReport,
  getDailyAnalytics,
  getWeeklyAnalytics,
  listAnalyticsInsights,
  regenerateDailyAnalytics,
  regenerateWeeklyAnalytics,
} from '../../services/data'
import { addDaysIso, istanbulDate } from '../../utils/dates'
import { AiReportCard } from './AiReportCard'
import { FreshnessBar } from './parts'
import {
  DailyAnalytics,
  HourlyAnalytics,
  ManagerSummaryCard,
  ProductsAnalytics,
  WeatherEffectCard,
  WeeklyAnalytics,
} from './sections'

type Tab = 'summary' | 'daily' | 'weekly' | 'products' | 'hourly' | 'weather'

const TABS = [
  { value: 'summary', label: 'Özet' },
  { value: 'daily', label: 'Günlük' },
  { value: 'weekly', label: 'Haftalık' },
  { value: 'products', label: 'Ürünler' },
  { value: 'hourly', label: 'Saatlik' },
  { value: 'weather', label: 'Hava' },
] as const

/**
 * Analytics Engine V1. Every number on this page was calculated by the database
 * (or its deterministic TypeScript twin in demo mode); the AI report is an
 * optional interpretation card that can never block or alter a metric. The server
 * re-checks permissions and branch scope for every call.
 */
export function AnalyticsPage() {
  const { roles } = useAuth()
  const { selectedBranchId, selectedBranch } = useSelectedBranch()
  const [tab, setTab] = useState<Tab>('summary')
  const [date, setDate] = useState(() => addDaysIso(istanbulDate(), -1))
  const canRead = canAnalytics(roles, 'analytics.read')
  const canRegenerate = canAnalytics(roles, 'analytics.regenerate')
  const week = weekStartOf(date)
  const branchId = canRead ? selectedBranchId : null

  const daily = useAsync(branchId ? `analytics:d:${branchId}:${date}` : null, async () => {
    const envelope = await getDailyAnalytics(branchId as string, date)
    const insights = await listAnalyticsInsights(branchId as string, 'daily', envelope.snapshotId).catch(() => [])
    return { envelope, insights }
  })
  const weekly = useAsync(branchId ? `analytics:w:${branchId}:${week}` : null, async () => {
    const envelope = await getWeeklyAnalytics(branchId as string, week)
    const insights = await listAnalyticsInsights(branchId as string, 'weekly', envelope.snapshotId).catch(() => [])
    return { envelope, insights }
  })
  // The AI report is loaded on its own so that its failure can never affect the metrics above.
  const report = useAsync(
    branchId && canAnalytics(roles, 'analytics.ai.read') ? `analytics:r:${branchId}:${week}` : null,
    () => getAnalyticsReport(branchId as string, week).catch(() => null),
  )

  if (!canRead) return <Unauthorized message="Analiz ekranı için analiz yetkisi gerekir." />
  if (!branchId)
    return <EmptyState icon="📊" title="Şube seçin" description="Analiz, seçili şube için gösterilir." />

  const regenDaily = async (reason: string) => {
    const result = await regenerateDailyAnalytics(branchId, date, reason)
    if (!result.error) daily.reload()
    return result.error
  }
  const regenWeekly = async (reason: string) => {
    const result = await regenerateWeeklyAnalytics(branchId, week, reason)
    if (!result.error) weekly.reload()
    return result.error
  }

  const dailyPayload = daily.data?.envelope.payload
  const weeklyPayload = weekly.data?.envelope.payload
  const dayTab = tab === 'summary' || tab === 'daily' || tab === 'hourly'
  const wantsWeekly = tab === 'weekly' || tab === 'products' || tab === 'weather'

  return (
    <Stack>
      <PageHeader title="Analiz" subtitle={`${selectedBranch?.name ?? ''} · hesaplanmış veriler`} />
      <div className="analytics-tabs">
        <SegmentedControl label="Analiz bölümü" options={TABS} value={tab} onChange={setTab} />
      </div>
      <Input label="Tarih" type="date" value={date} max={istanbulDate()} onChange={(e) => e.target.value && setDate(e.target.value)} />

      {dayTab && (
        <DataBoundary state={daily}>
          {({ envelope, insights }) => (
            <Stack>
              <FreshnessBar envelope={envelope} canRegenerate={canRegenerate} onRegenerate={regenDaily} />
              {tab === 'summary' && <ManagerSummaryCard daily={dailyPayload} weekly={weeklyPayload} insights={insights} />}
              {tab === 'daily' &&
                (dailyPayload ? <DailyAnalytics p={dailyPayload} /> : <EmptyState icon="📊" title="Bu gün için anlık görüntü yok" description="Yetkili bir kullanıcı yeniden hesaplayabilir." />)}
              {tab === 'hourly' && <HourlyAnalytics daily={dailyPayload} />}
            </Stack>
          )}
        </DataBoundary>
      )}

      {wantsWeekly && (
        <DataBoundary state={weekly}>
          {({ envelope, insights }) => (
            <Stack>
              <FreshnessBar envelope={envelope} canRegenerate={canRegenerate} onRegenerate={regenWeekly} />
              {!weeklyPayload ? (
                <EmptyState icon="📊" title="Bu hafta için anlık görüntü yok" description="Yetkili bir kullanıcı yeniden hesaplayabilir." />
              ) : (
                <>
                  {tab === 'weekly' && (
                    <>
                      <WeeklyAnalytics p={weeklyPayload} />
                      {insights.length > 0 && <ManagerSummaryCard daily={undefined} weekly={weeklyPayload} insights={insights} />}
                      {canAnalytics(roles, 'analytics.ai.read') && <AiReportCard report={report.data} />}
                    </>
                  )}
                  {tab === 'products' && <ProductsAnalytics p={weeklyPayload} />}
                  {tab === 'weather' && <WeatherEffectCard effect={weeklyPayload.weatherEffect} redacted={weeklyPayload.redacted === true} />}
                </>
              )}
            </Stack>
          )}
        </DataBoundary>
      )}
    </Stack>
  )
}
