import { useEffect, useState } from 'react'
import { useSelectedBranch } from '../../../hooks/useSelectedBranch'
import { listReconciliationQueue, overrideReconciliation, type SalesReportSummary } from '../../../services/supabase'
import { Card, StatusChip, Button, Input, EmptyState, Skeleton } from '../../../components/ui'
import { useToast } from '../../../hooks/useToast'

const RECONCILIATION_TONE = { OK: 'success', WARNING: 'warning', ERROR: 'danger' } as const

export function ReconciliationQueuePage() {
  const { branches, selectedBranchId, setSelectedBranchId } = useSelectedBranch()
  const { showToast } = useToast()
  const [reports, setReports] = useState<SalesReportSummary[] | null>(null)
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({})
  const [overridingId, setOverridingId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!selectedBranchId) return
    let cancelled = false
    listReconciliationQueue(selectedBranchId).then((data) => {
      if (!cancelled) setReports(data)
    })
    return () => {
      cancelled = true
    }
  }, [selectedBranchId, reloadKey])

  async function handleOverride(reportId: string) {
    const reason = reasonDraft[reportId]?.trim()
    if (!reason) {
      showToast('Gerekçe zorunludur', 'danger')
      return
    }
    setOverridingId(reportId)
    const { error } = await overrideReconciliation({ reportId, newStatus: 'OK', reason })
    setOverridingId(null)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Mutabakat durumu güncellendi', 'success')
    setReloadKey((k) => k + 1)
  }

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>Mutabakat Kuyruğu</h1>

      {branches.length > 1 && (
        <select value={selectedBranchId ?? ''} onChange={(e) => setSelectedBranchId(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      {reports === null && <Skeleton height={160} />}
      {reports !== null && reports.length === 0 && (
        <EmptyState icon="✅" title="Kuyruk boş" description="Mutabakat gerektiren bir rapor yok." />
      )}
      {reports?.map((r) => (
        <Card key={r.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <p style={{ fontWeight: 600 }}>{r.reportType} Raporu — {r.grossRevenue.toFixed(2)} ₺</p>
              <p style={{ fontSize: 13, opacity: 0.75 }}>{new Date(r.submittedAt).toLocaleString('tr-TR')}</p>
            </div>
            <StatusChip tone={RECONCILIATION_TONE[r.reconciliationStatus]}>{r.reconciliationStatus}</StatusChip>
          </div>
          <Input
            label="Onay gerekçesi (zorunlu)"
            value={reasonDraft[r.id] ?? ''}
            onChange={(e) => setReasonDraft((prev) => ({ ...prev, [r.id]: e.target.value }))}
          />
          <Button
            size="md"
            loading={overridingId === r.id}
            onClick={() => void handleOverride(r.id)}
            style={{ marginTop: 8 }}
          >
            OK Olarak Onayla
          </Button>
        </Card>
      ))}
    </div>
  )
}
