import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../hooks/useToast'
import {
  listMyShiftAssignments,
  listBranchCategories,
  createSalesReport,
  type ShiftAssignmentSummary,
  type CategoryOption,
} from '../../../services/supabase'
import { Card, Button, Input, CurrencyInput, Skeleton } from '../../../components/ui'

export function NewSalesReportPage() {
  const { shiftId } = useParams<{ shiftId: string }>()
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [assignment, setAssignment] = useState<ShiftAssignmentSummary | null | undefined>(undefined)
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [reportType, setReportType] = useState<'X' | 'Z'>('X')
  const [grossRevenue, setGrossRevenue] = useState<number | null>(null)
  const [transactionCount, setTransactionCount] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [amounts, setAmounts] = useState<Record<string, number | null>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function load() {
      if (!user || !shiftId) return
      const assignments = await listMyShiftAssignments(user.id)
      const found = assignments.find((a) => a.shift.id === shiftId) ?? null
      setAssignment(found)
      if (found) {
        setCategories(await listBranchCategories(found.shift.branchId))
      }
    }
    void load()
  }, [user, shiftId])

  const itemsTotal = Object.values(amounts).reduce((sum: number, v) => sum + (v ?? 0), 0)

  async function handleSubmit() {
    if (!shiftId || grossRevenue === null) return
    setSubmitting(true)
    const { error } = await createSalesReport({
      shiftId,
      reportType,
      grossRevenue,
      transactionCount,
      notes: notes || null,
      items: categories
        .filter((c) => amounts[c.id] !== null && amounts[c.id] !== undefined)
        .map((c) => ({ categoryId: c.id, amount: amounts[c.id]! })),
    })
    setSubmitting(false)
    if (error) {
      showToast(error, 'danger')
      return
    }
    showToast('Rapor gönderildi', 'success')
    navigate('/app/employee/shifts/reports')
  }

  if (assignment === undefined) {
    return (
      <div style={{ padding: 16, display: 'grid', gap: 12 }}>
        <Skeleton height={40} />
        <Skeleton height={200} />
      </div>
    )
  }

  if (assignment === null) {
    return <div style={{ padding: 16 }}>Bu vardiyaya atanmış değilsiniz.</div>
  }

  return (
    <div style={{ padding: 16, display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>
        Satış Raporu — {assignment.shift.branchName} / {assignment.shift.definition.name}
      </h1>

      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['X', 'Z'] as const).map((type) => (
            <Button
              key={type}
              variant={reportType === type ? 'primary' : 'secondary'}
              size="md"
              onClick={() => setReportType(type)}
            >
              {type} Raporu
            </Button>
          ))}
        </div>

        <CurrencyInput label="Kasa Toplamı (Brüt Ciro)" value={grossRevenue} onValueChange={setGrossRevenue} />
        <Input
          label="İşlem Sayısı (opsiyonel)"
          type="number"
          value={transactionCount ?? ''}
          onChange={(e) => setTransactionCount(e.target.value === '' ? null : Number(e.target.value))}
        />
        <Input label="Not (opsiyonel)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Card>

      {categories.length > 0 && (
        <Card>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Kategori Dağılımı</p>
          {categories.map((c) => (
            <CurrencyInput
              key={c.id}
              label={c.name}
              value={amounts[c.id] ?? null}
              onValueChange={(v) => setAmounts((prev) => ({ ...prev, [c.id]: v }))}
            />
          ))}
          <p style={{ fontSize: 13, opacity: 0.75, marginTop: 8 }}>Kategori toplamı: {itemsTotal.toFixed(2)} ₺</p>
        </Card>
      )}

      <Button fullWidth loading={submitting} disabled={grossRevenue === null} onClick={() => void handleSubmit()}>
        Raporu Gönder
      </Button>
    </div>
  )
}
