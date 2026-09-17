import { useEffect, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { listMyRecentReports, type SalesReportSummary } from '../../../services/supabase'
import { Card, StatusChip, EmptyState, Skeleton } from '../../../components/ui'

const RECONCILIATION_TONE = { OK: 'success', WARNING: 'warning', ERROR: 'danger' } as const
const STATUS_TONE = { submitted: 'neutral', edited: 'info', cancelled: 'danger' } as const

export function MyRecentReportsPage() {
  const { user } = useAuth()
  const [reports, setReports] = useState<SalesReportSummary[] | null>(null)

  useEffect(() => {
    if (!user) return
    void listMyRecentReports(user.id).then(setReports)
  }, [user])

  if (reports === null) {
    return (
      <div style={{ padding: 16, display: 'grid', gap: 12 }}>
        <Skeleton height={70} />
        <Skeleton height={70} />
      </div>
    )
  }

  if (reports.length === 0) {
    return <EmptyState icon="🧾" title="Son Raporlarım" description="Henüz gönderilmiş bir satış raporunuz yok." />
  }

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>Son Raporlarım</h1>
      {reports.map((r) => (
        <Card key={r.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontWeight: 600 }}>
                {r.branchName} — {r.reportType} Raporu
              </p>
              <p style={{ fontSize: 13, opacity: 0.75 }}>{new Date(r.submittedAt).toLocaleString('tr-TR')}</p>
              <p style={{ fontSize: 15, marginTop: 4 }}>{r.grossRevenue.toFixed(2)} ₺</p>
            </div>
            <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
              <StatusChip tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? 'neutral'}>{r.status}</StatusChip>
              <StatusChip tone={RECONCILIATION_TONE[r.reconciliationStatus]}>{r.reconciliationStatus}</StatusChip>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
