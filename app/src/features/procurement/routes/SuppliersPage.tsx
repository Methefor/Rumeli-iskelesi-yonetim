import { useState } from 'react'
import { Button, DataBoundary, Input, Note, PageHeader, RowCard, Select, Stack, StatusChip } from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import type { Supplier, SupplierType } from '../../../domain/procurement'
import { useAsync } from '../../../hooks/useAsync'
import { useToast } from '../../../hooks/useToast'
import { listSuppliers, setSupplierActive, upsertSupplier } from '../../../services/data'
import { ReasonSheet } from '../../management/ReasonSheet'
import { useProcurementContext } from '../hooks'
import { SUPPLIER_TYPE_LABELS } from '../labels'

interface Draft {
  id: string | null
  code: string
  name: string
  supplierType: SupplierType
  contactName: string
  phone: string
  email: string
  notes: string
}

const emptyDraft: Draft = { id: null, code: '', name: '', supplierType: 'COMPANY', contactName: '', phone: '', email: '', notes: '' }

/** Supplier catalogue. Suppliers are deactivated, never deleted; the code cannot change after creation. Every change needs a reason and is audited. */
export function SuppliersPage() {
  const { can } = useProcurementContext()
  const { showToast } = useToast()
  const allowed = can('procurement.supplier.read')
  const manage = can('procurement.supplier.manage')
  const state = useAsync(allowed ? 'suppliers' : null, () => listSuppliers())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [toggle, setToggle] = useState<Supplier | null>(null)
  const [saving, setSaving] = useState(false)

  if (!allowed) return <Unauthorized message="Tedarikçi listesi için yetkiniz yok." />

  async function save(reason: string) {
    if (!draft) return
    setSaving(true)
    const result = await upsertSupplier({
      id: draft.id,
      code: draft.code,
      name: draft.name,
      supplierType: draft.supplierType,
      contactName: draft.contactName.trim() || null,
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null,
      notes: draft.notes.trim() || null,
      reason,
    })
    setSaving(false)
    if (result.error) return showToast(result.error, 'danger')
    showToast('Tedarikçi kaydedildi', 'success')
    setDraft(null)
    state.reload()
  }

  async function confirmToggle(reason: string) {
    if (!toggle) return
    setSaving(true)
    const result = await setSupplierActive(toggle.id, !toggle.isActive, reason)
    setSaving(false)
    if (result.error) return showToast(result.error, 'danger')
    showToast(toggle.isActive ? 'Tedarikçi pasifleştirildi' : 'Tedarikçi aktifleştirildi', 'success')
    setToggle(null)
    state.reload()
  }

  return (
    <Stack>
      <PageHeader title="Tedarikçiler" subtitle="Firmalar ve merkez depo" back={{ to: '/app/manager/procurement', label: 'Tedarik' }} />
      <Note>Tedarikçiler silinmez, yalnızca pasifleştirilir. Kod sonradan değiştirilemez. Pasif tedarikçiye yeni sipariş verilemez.</Note>
      {manage && <Button onClick={() => setDraft({ ...emptyDraft })}>Yeni tedarikçi ekle</Button>}
      <DataBoundary state={state} rows={3}>
        {(suppliers) =>
          suppliers.length === 0 ? (
            <Note>Henüz tedarikçi tanımlanmadı.</Note>
          ) : (
            <Stack gap="sm">
              {suppliers.map((s) => (
                <RowCard
                  key={s.id}
                  title={s.name}
                  subtitle={`${SUPPLIER_TYPE_LABELS[s.supplierType]} · ${s.code}`}
                  meta={[s.contactName, s.phone, s.email].filter(Boolean).join(' · ') || undefined}
                  trailing={<StatusChip tone={s.isActive ? 'success' : 'neutral'}>{s.isActive ? 'Aktif' : 'Pasif'}</StatusChip>}
                >
                  {manage && (
                    <Stack gap="sm">
                      <Button
                        variant="secondary"
                        onClick={() => setDraft({ id: s.id, code: s.code, name: s.name, supplierType: s.supplierType, contactName: s.contactName ?? '', phone: s.phone ?? '', email: s.email ?? '', notes: s.notes ?? '' })}
                      >
                        Düzenle
                      </Button>
                      <Button variant="secondary" onClick={() => setToggle(s)}>
                        {s.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                      </Button>
                    </Stack>
                  )}
                </RowCard>
              ))}
            </Stack>
          )
        }
      </DataBoundary>

      <ReasonSheet
        open={draft !== null}
        title={draft?.id ? 'Tedarikçiyi düzenle' : 'Yeni tedarikçi'}
        confirmLabel="Kaydet"
        loading={saving}
        ready={!!draft && draft.name.trim().length > 0 && (draft.id !== null || draft.code.trim().length >= 2)}
        onConfirm={(reason) => void save(reason)}
        onCancel={() => setDraft(null)}
      >
        {draft && (
          <Stack gap="sm">
            <Input label="Kod (büyük harf/rakam, değiştirilemez)" value={draft.code} maxLength={32} disabled={draft.id !== null} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
            <Input label="Ad" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Select
              label="Tür"
              value={draft.supplierType}
              onChange={(e) => setDraft({ ...draft, supplierType: e.target.value as SupplierType })}
              options={[
                { value: 'COMPANY', label: SUPPLIER_TYPE_LABELS.COMPANY },
                { value: 'CENTRAL_WAREHOUSE', label: SUPPLIER_TYPE_LABELS.CENTRAL_WAREHOUSE },
              ]}
            />
            <Input label="İlgili kişi (opsiyonel)" value={draft.contactName} maxLength={80} onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} />
            <Input label="Telefon (opsiyonel)" value={draft.phone} maxLength={30} inputMode="tel" onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            <Input label="E-posta (opsiyonel)" value={draft.email} maxLength={120} inputMode="email" onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            <Input label="Not (opsiyonel)" value={draft.notes} maxLength={500} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </Stack>
        )}
      </ReasonSheet>

      <ReasonSheet
        open={toggle !== null}
        title={toggle?.isActive ? 'Tedarikçiyi pasifleştir' : 'Tedarikçiyi aktifleştir'}
        confirmLabel={toggle?.isActive ? 'Pasifleştir' : 'Aktifleştir'}
        tone={toggle?.isActive ? 'danger' : 'primary'}
        loading={saving}
        onConfirm={(reason) => void confirmToggle(reason)}
        onCancel={() => setToggle(null)}
      >
        <p>{toggle?.name}: pasif tedarikçiye yeni sipariş verilemez ve yeni ürün atanamaz; geçmiş siparişler etkilenmez.</p>
      </ReasonSheet>
    </Stack>
  )
}
