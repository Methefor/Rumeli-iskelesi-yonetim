import { LinkButton, Note, RowCard, Stack, StatusChip } from '../../components/ui'
import type { BranchSignals } from '../../domain/commandCenter'
import { ROUTES } from '../../domain/commandCenter'
import styles from './CommandCenter.module.css'

const CONFIDENCE = { fact: 'Bulgu', relationship: 'İlişki', hypothesis: 'Hipotez' } as const

/** E. PERFORMANCE / ANALYTICS summary: the existing, evidence-gated insights of the latest snapshot (nothing is recomputed here). */
export function AnalyticsPanel({ rows, signals }: { rows: Array<{ branchId: string; branchName: string }>; signals: Record<string, BranchSignals | null> }) {
  const withData = rows.filter((r) => signals[r.branchId]?.analytics.state === 'available')
  return (
    <section aria-labelledby="cc-analytics">
      <div className={styles.sectionHead}>
        <h2 id="cc-analytics">Analiz özeti</h2>
      </div>
      <Stack gap="sm">
        {withData.length === 0 && <Note>Henüz analiz anlık görüntüsü yok veya görüntüleme yetkiniz yok. Eksik veri “sorun yok” demek değildir.</Note>}
        {withData.map((r) => {
          const s = signals[r.branchId]
          if (s?.analytics.state !== 'available') return null
          const { daily, weekly } = s.analytics.data
          const insights = [...(weekly?.insights ?? []), ...(daily?.insights ?? [])].filter((i) => i.confidence !== 'hypothesis')
          const subtitle = [daily ? `${daily.businessDate} · ${daily.completeness === 'complete' ? 'veri tam' : 'veri kısmi'}` : null, weekly ? `hafta ${weekly.weekStart}${weekly.weekComplete ? '' : ' (sürüyor)'}` : null].filter(Boolean).join(' · ')
          return (
            <RowCard key={r.branchId} title={r.branchName} subtitle={subtitle}>
              <Stack gap="sm">
                {insights.length === 0 && <span className={styles.muted}>Kanıt eşiğini geçen bir gözlem yok (yetersiz örnek bir bulgu sayılmaz).</span>}
                {insights.slice(0, 4).map((i) => (
                  <div key={i.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{i.title}</span>
                    <StatusChip tone={i.confidence === 'relationship' ? 'warning' : 'info'}>{CONFIDENCE[i.confidence]}</StatusChip>
                  </div>
                ))}
              </Stack>
            </RowCard>
          )
        })}
        <LinkButton to={ROUTES.analytics} variant="secondary">Analiz sayfasını aç</LinkButton>
      </Stack>
    </section>
  )
}
