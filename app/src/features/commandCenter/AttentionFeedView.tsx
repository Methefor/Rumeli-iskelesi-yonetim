import { useState } from 'react'
import { LinkButton, Note, RowCard, Stack, StatusChip, type StatusTone } from '../../components/ui'
import type { AttentionFeed, AttentionSeverity } from '../../domain/commandCenter'
import styles from './CommandCenter.module.css'

const TONES: Record<AttentionSeverity, StatusTone> = { critical: 'danger', warning: 'warning', info: 'info' }
const LABELS: Record<AttentionSeverity, string> = { critical: 'Kritik', warning: 'Uyarı', info: 'Bilgi' }
const SOURCE_LABELS: Record<string, string> = {
  inventory_control: 'stok/sayım verisi',
  procurement: 'sipariş verisi',
  weather: 'hava verisi',
  analytics: 'analiz verisi',
  dashboard: 'özet verisi',
}
const INITIAL = 5

/** B. ATTENTION REQUIRED. Prioritised, deterministic; every item leads somewhere. Progressive disclosure: the top items first. */
export function AttentionFeedView({ feed, multiBranch }: { feed: AttentionFeed; multiBranch: boolean }) {
  const [all, setAll] = useState(false)
  const shown = all ? feed.items : feed.items.slice(0, INITIAL)
  return (
    <section aria-labelledby="cc-attention">
      <div className={styles.sectionHead}>
        <h2 id="cc-attention">Dikkat gerekiyor</h2>
        <small>
          {feed.counts.critical} kritik · {feed.counts.warning} uyarı · {feed.counts.info} bilgi
        </small>
      </div>
      <Stack gap="sm">
        {feed.items.length === 0 && <Note>Şu an dikkat gerektiren bir durum yok.</Note>}
        {shown.map((item) => (
          <RowCard
            key={item.id}
            title={item.title}
            subtitle={item.description}
            meta={multiBranch ? item.branchName : undefined}
            trailing={<StatusChip tone={TONES[item.severity]}>{LABELS[item.severity]}</StatusChip>}
          >
            <LinkButton to={item.actionRoute} variant="secondary">
              Aç
            </LinkButton>
          </RowCard>
        ))}
        {feed.items.length > INITIAL && (
          <button type="button" className={styles.muted} onClick={() => setAll((v) => !v)} style={{ background: 'none', border: 0, textDecoration: 'underline', minHeight: 44 }}>
            {all ? 'Daha az göster' : `Tümünü göster (${feed.items.length})`}
          </button>
        )}
        {feed.unavailableSources.length > 0 && (
          <Note>
            Bazı veriler görüntülenemiyor, bu yüzden “sorun yok” anlamına gelmez:{' '}
            {[...new Set(feed.unavailableSources.map((u) => SOURCE_LABELS[u.source] ?? u.source))].join(', ')}.
          </Note>
        )}
      </Stack>
    </section>
  )
}
