import { Card, Note, Stack, StatusChip } from '../../components/ui'
import type { AnalyticsReportView } from '../../services/data'
import { formatDateTime } from '../../utils/dates'
import { ConfidenceBadge } from './parts'
import styles from './Analytics.module.css'

/**
 * The AI interpretation of a weekly snapshot. It is optional, separate and
 * never blocks the metrics: a missing or failed report is a note, not an error.
 */
export function AiReportCard({ report }: { report: AnalyticsReportView | null }) {
  if (!report)
    return (
      <Card>
        <Note>AI yorumu henüz yok. Metrikler AI olmadan hesaplanır ve bu durumdan etkilenmez.</Note>
      </Card>
    )
  if (report.status !== 'generated' || !report.output)
    return (
      <Card>
        <Stack gap="sm">
          <StatusChip tone="warning">AI yorumu üretilemedi</StatusChip>
          <Note>Metrikler etkilenmedi. Son deneme: {formatDateTime(report.generatedAt)}.</Note>
        </Stack>
      </Card>
    )
  return (
    <Card>
      <Stack gap="sm">
        <h3 className={styles.sectionTitle}>AI yorumu</h3>
        <Note>Bu metin yalnızca hesaplanmış verileri yorumlar; yeni sayı üretmez. v{report.version} · {formatDateTime(report.generatedAt)}</Note>
        <p>{report.output.summary}</p>
        {report.output.claims.map((c) => (
          <div key={c.id} className={styles.claim}>
            <ConfidenceBadge confidence={c.confidence} />
            <p className={styles.insightTitle}>{c.text}</p>
            <p className={styles.evidence}>{c.evidence.map((e) => `${e.metric} = ${String(e.value)}`).join(' · ')}</p>
          </div>
        ))}
        {report.output.limitations.length > 0 && <Note>Sınırlamalar: {report.output.limitations.join(' ')}</Note>}
      </Stack>
    </Card>
  )
}
