import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSelectedBranch } from '../../../hooks/useSelectedBranch'
import { listBranchReports, type SalesReportSummary } from '../../../services/supabase'
import { Card, StatusChip, Button, EmptyState, Skeleton } from '../../../components/ui'

const RECONCILIATION_TONE = { OK: 'success', WARNING: 'warning', ERROR: 'danger' } as const

export function SalesOverviewPage() {
  const { branches, selectedBranchId, setSelectedBranchId } = useSelectedBranch()
  const [reports, setReports] = useState<SalesReportSummary[] | null>(null)

  useEffect(() => {
    if (!selectedBranchId) return
    void listBranchReports(selectedBranchId).then(setReports)
  }, [selectedBranchId])

  const flaggedCount = reports?.filter((r) => r.reconciliationStatus !== 'OK' && r.status !== 'cancelled').length ?? 0

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Satış Genel Bakış</h1>
        <Link to="reconciliation">
          <Button size="md" variant={flaggedCount > 0 ? 'danger' : 'secondary'}>
            Mutabakat Kuyruğu {flaggedCount > 0 ? `(${flaggedCount})` : ''}
          </Button>
        </Link>
      </div>

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
        <EmptyState icon="🧾" title="Rapor yok" description="Bu şube için henüz gönderilmiş bir satış raporu yok." />
      )}
      {reports?.map((r) => (
        <Card key={r.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontWeight: 600 }}>{r.reportType} Raporu</p>
              <p style={{ fontSize: 13, opacity: 0.75 }}>{new Date(r.submittedAt).toLocaleString('tr-TR')}</p>
              <p style={{ fontSize: 15, marginTop: 4 }}>{r.grossRevenue.toFixed(2)} ₺</p>
            </div>
            <StatusChip tone={RECONCILIATION_TONE[r.reconciliationStatus]}>{r.reconciliationStatus}</StatusChip>
          </div>
        </Card>
      ))}
    </div>
  )
}
