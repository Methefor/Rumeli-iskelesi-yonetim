import { useState } from 'react'
import { Button, DataBoundary, Input, Note, PageHeader, RowCard, Stack, StatusChip } from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import { canManageWasteReasons, type WasteReasonRow } from '../../../domain/inventory/control'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../hooks/useToast'
import { listWasteReasons, setWasteReasonActive, upsertWasteReason } from '../../../services/data'
import { ReasonSheet } from '../ReasonSheet'

interface Draft {
  id: string | null
  code: string
  name: string
  description: string
  sortOrder: string
}

const emptyDraft: Draft = { id: null, code: '', name: '', description: '', sortOrder: '100' }

/**
 * Fire reason catalogue. Reasons are deactivated, never deleted, and the code of an existing reason cannot
 * change, so historical fire entries always keep a valid reason. Every change asks for a reason and is audited.
 */
export function WasteReasonsPage() {
  const { roles } = useAuth()
  const { showToast } = useToast()
  const allowed = canManageWasteReasons(roles)
  const state = useAsync(allowed ? 'waste-reasons' : null, () => listWasteReasons())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [toggle, setToggle] = useState<WasteReasonRow | null>(null)
  const [saving, setSaving] = useState(false)

  if (!allowed) return <Unauthorized message="Fire nedenlerini yönetme yetkiniz yok." />

  async function save(reason: string) {
    if (!draft) return
    setSaving(true)
    const result = await upsertWasteReason({
      id: draft.id,
      code: draft.code,
      name: draft.name,
      description: draft.description.trim() || null,
      sortOrder: Number(draft.sortOrder) || 100,
      reason,
    })
    setSaving(false)
    if (result.error) return showToast(result.error, 'danger')
    showToast('Fire nedeni kaydedildi', 'success')
    setDraft(null)
    state.reload()
  }

  async function confirmToggle(reason: string) {
    if (!toggle) return
    setSaving(true)
    const result = await setWasteReasonActive(toggle.id, !toggle.isActive, reason)
    setSaving(false)
    if (result.error) return showToast(result.error, 'danger')
    showToast(toggle.isActive ? 'Fire nedeni pasifleştirildi' : 'Fire nedeni aktifleştirildi', 'success')
    setToggle(null)
    state.reload()
  }

  return (
    <Stack>
      <PageHeader title="Fire nedenleri" subtitle="Fire kaydında seçilebilen nedenler" back={{ to: '/app/manager/management', label: 'Yönetim' }} />
      <Note>
        Nedenler silinmez, yalnızca pasifleştirilir; eski fire kayıtları değişmeden kalır. Kod sonradan değiştirilemez. Listedeki
        başlangıç nedenleri geçmiş kayıtlardan gelir ve nihai bir katalog değildir.
      </Note>
      <Button onClick={() => setDraft({ ...emptyDraft })}>Yeni neden ekle</Button>
      <DataBoundary state={state} rows={4}>
        {(reasons) => (
          <Stack gap="sm">
            {reasons.map((r) => (
              <RowCard
                key={r.id}
                title={r.name}
                subtitle={r.description ?? undefined}
                meta={`Kod: ${r.code} · Sıra: ${r.sortOrder}`}
                trailing={<StatusChip tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Aktif' : 'Pasif'}</StatusChip>}
              >
                <Stack gap="sm">
                  <Button
                    variant="secondary"
                    onClick={() => setDraft({ id: r.id, code: r.code, name: r.name, description: r.description ?? '', sortOrder: String(r.sortOrder) })}
                  >
                    Düzenle
                  </Button>
                  <Button variant="secondary" onClick={() => setToggle(r)}>
                    {r.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                  </Button>
                </Stack>
              </RowCard>
            ))}
          </Stack>
        )}
      </DataBoundary>

      <ReasonSheet
        open={draft !== null}
        title={draft?.id ? 'Fire nedenini düzenle' : 'Yeni fire nedeni'}
        confirmLabel="Kaydet"
        loading={saving}
        ready={!!draft && draft.name.trim().length > 0 && (draft.id !== null || draft.code.trim().length >= 2)}
        onConfirm={(reason) => void save(reason)}
        onCancel={() => setDraft(null)}
      >
        {draft && (
          <Stack gap="sm">
            <Input
              label="Kod (küçük harf, rakam, alt çizgi)"
              value={draft.code}
              maxLength={40}
              disabled={draft.id !== null}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            />
            <Input label="Ad" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input label="Açıklama (opsiyonel)" value={draft.description} maxLength={200} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <Input label="Sıra" type="number" inputMode="numeric" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} />
          </Stack>
        )}
      </ReasonSheet>

      <ReasonSheet
        open={toggle !== null}
        title={toggle?.isActive ? 'Fire nedenini pasifleştir' : 'Fire nedenini aktifleştir'}
        confirmLabel={toggle?.isActive ? 'Pasifleştir' : 'Aktifleştir'}
        tone={toggle?.isActive ? 'danger' : 'primary'}
        loading={saving}
        onConfirm={(reason) => void confirmToggle(reason)}
        onCancel={() => setToggle(null)}
      >
        <p>{toggle?.name}: pasif nedenler yeni fire kaydında seçilemez; geçmiş kayıtlar etkilenmez.</p>
      </ReasonSheet>
    </Stack>
  )
}
