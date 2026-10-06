import { useState } from 'react'
import { Input, Note, PageHeader, RowCard, SegmentedControl, Select, Stack, StatCard, DataBoundary } from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import { canReviewControl, periodRange, type QuantityByUnit, type ReportPeriod } from '../../../domain/inventory/control'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { useSelectedBranch } from '../../../hooks/useSelectedBranch'
import { getWasteReport } from '../../../services/data'
import { istanbulDate } from '../../../utils/dates'
import { formatQuantity } from '../../../utils/format'
import { CostMetricText } from '../../inventory/components/CostMetricText'

const units = (rows: QuantityByUnit[]) => rows.map((r) => `${formatQuantity(r.quantity)} ${r.unit}`).join(' · ') || '—'

type Grouping = 'reason' | 'item' | 'employee' | 'shift'

/** Manager fire report: every figure comes from get_waste_report (SQL); this page only displays it. */
export function WasteReportPage() {
  const { roles } = useAuth()
  const { selectedBranchId, selectedBranch } = useSelectedBranch()
  const today = istanbulDate()
  const [period, setPeriod] = useState<ReportPeriod>('week')
  const [custom, setCustom] = useState({ from: today, to: today })
  const [grouping, setGrouping] = useState<Grouping>('reason')
  const allowed = canReviewControl(roles)
  const range = period === 'custom' ? custom : periodRange(period, today)
  const valid = range.from <= range.to
  const state = useAsync(allowed && selectedBranchId && valid ? `waste-report:${selectedBranchId}:${range.from}:${range.to}` : null, () =>
    getWasteReport(selectedBranchId as string, range.from, range.to),
  )

  if (!allowed) return <Unauthorized message="Fire raporu için yetkiniz yok." />

  return (
    <Stack>
      <PageHeader title="Fire raporu" subtitle={selectedBranch?.name} back={{ to: '/app/manager/management', label: 'Yönetim' }} />
      <SegmentedControl
        label="Dönem"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'today', label: 'Bugün' },
          { value: 'week', label: '7 gün' },
          { value: 'month', label: 'Bu ay' },
          { value: 'custom', label: 'Özel' },
        ]}
      />
      {period === 'custom' && (
        <Stack gap="sm">
          <Input label="Başlangıç" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          <Input label="Bitiş" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          {!valid && <Note>Bitiş tarihi başlangıçtan önce olamaz.</Note>}
        </Stack>
      )}
      <DataBoundary state={state} rows={4}>
        {(r) => (
          <Stack>
            <StatCard label="Fire kaydı" value={r.entries} changeLabel={r.reversedEntries > 0 ? `${r.reversedEntries} geri alınan hariç` : undefined} />
            <StatCard label="Miktar" value={units(r.quantityByUnit)} />
            <StatCard label="Maliyet etkisi" value={<CostMetricText metric={r.cost} />} />
            {r.cost.state !== 'available' && r.cost.reason === 'missing_cost' && (
              <Note>
                {r.costCoverage.costedEntries}/{r.costCoverage.entries} kaydın maliyeti biliniyor. Maliyeti tanımsız kayıtlar 0 sayılmaz; tutar eksik olabilir.
              </Note>
            )}
            <Select
              label="Grupla"
              value={grouping}
              onChange={(e) => setGrouping(e.target.value as Grouping)}
              options={[
                { value: 'reason', label: 'Neden' },
                { value: 'item', label: 'Ürün' },
                { value: 'employee', label: 'Çalışan' },
                { value: 'shift', label: 'Vardiya' },
              ]}
            />
            {r.entries === 0 && <Note>Bu dönemde fire kaydı yok.</Note>}
            <Stack gap="sm">
              {grouping === 'reason' &&
                r.byReason.map((x) => (
                  <RowCard key={x.reasonCode} title={x.name} subtitle={`${x.entries} kayıt · ${units(x.quantityByUnit)}`} trailing={<CostMetricText metric={x.cost} />} />
                ))}
              {grouping === 'item' &&
                r.byItem.map((x) => (
                  <RowCard key={x.inventoryItemId} title={x.name} subtitle={`${x.entries} kayıt · ${formatQuantity(x.quantity)} ${x.unit}`} meta={x.code} trailing={<CostMetricText metric={x.cost} />} />
                ))}
              {grouping === 'employee' &&
                r.byEmployee.map((x) => (
                  <RowCard key={x.userId ?? 'unknown'} title={x.name} subtitle={`${x.entries} kayıt`} meta={x.employeeCode ?? undefined} trailing={<CostMetricText metric={x.cost} />} />
                ))}
              {grouping === 'shift' &&
                r.byShift.map((x) => (
                  <RowCard key={x.shiftId ?? 'none'} title={x.label} subtitle={`${x.entries} kayıt`} meta={x.businessDate ?? undefined} trailing={<CostMetricText metric={x.cost} />} />
                ))}
            </Stack>
            <Note>Geri alınan (iptal edilen) fire kayıtları toplama dahil edilmez. Dönem İstanbul takvim gününe göre hesaplanır.</Note>
          </Stack>
        )}
      </DataBoundary>
    </Stack>
  )
}
