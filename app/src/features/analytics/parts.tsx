import { useState } from 'react'
import type { Confidence, SnapshotEnvelope } from '../../domain/analytics'
import { Button, Card, ConfirmSheet, Input, Note, StatusChip } from '../../components/ui'
import { formatDateTime } from '../../utils/dates'
import { CONFIDENCE_HELP, CONFIDENCE_LABEL, CONFIDENCE_TONE } from './analyticsFormat'
import styles from './Analytics.module.css'

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span title={CONFIDENCE_HELP[confidence]}>
      <StatusChip tone={CONFIDENCE_TONE[confidence]}>{CONFIDENCE_LABEL[confidence]}</StatusChip>
    </span>
  )
}

/** Snapshot freshness (current / stale / missing) plus the audited manual regeneration. */
export function FreshnessBar({
  envelope,
  canRegenerate,
  onRegenerate,
}: {
  envelope: SnapshotEnvelope<unknown> | null
  canRegenerate: boolean
  onRegenerate: (reason: string) => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = envelope?.state ?? 'missing'

  async function confirm() {
    setBusy(true)
    const message = await onRegenerate(reason.trim())
    setBusy(false)
    if (message) setError(message)
    else {
      setOpen(false)
      setReason('')
      setError(null)
    }
  }

  return (
    <div className={styles.freshness}>
      {state === 'current' && <StatusChip tone="success">Güncel</StatusChip>}
      {state === 'stale' && <StatusChip tone="warning">Eski: yeni veri geldi</StatusChip>}
      {state === 'missing' && <StatusChip tone="neutral">Anlık görüntü yok</StatusChip>}
      {envelope?.version !== undefined && (
        <span>
          v{envelope.version}
          {envelope.generatedAt ? ` · ${formatDateTime(envelope.generatedAt)}` : ''}
          {envelope.generationKind === 'manual' ? ' · elle yenilendi' : ''}
        </span>
      )}
      {canRegenerate && (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Yeniden hesapla
        </Button>
      )}
      <ConfirmSheet
        open={open}
        title="Analizi yeniden hesapla"
        confirmLabel="Yeniden hesapla"
        loading={busy}
        confirmDisabled={reason.trim().length < 5}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      >
        <Input label="Gerekçe (denetim kaydına yazılır)" value={reason} onChange={(e) => setReason(e.target.value)} error={error ?? undefined} />
        <Note>Yeni bir sürüm oluşur; önceki sürümler değişmez.</Note>
      </ConfirmSheet>
    </div>
  )
}

export function RedactedNote() {
  return (
    <Card>
      <Note>Finansal analiz verilerini görüntüleme yetkiniz yok; yalnızca hacim metrikleri gösteriliyor.</Note>
    </Card>
  )
}
