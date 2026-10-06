import { useState } from 'react'
import { Button, DataBoundary, Input, Note, PageHeader, RowCard, Stack, StatusChip } from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import { canManageBranchLocation, canReviewControl, validateCoordinates, type BranchLocation } from '../../../domain/inventory/control'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../hooks/useToast'
import { listBranchLocations, updateBranchLocation } from '../../../services/data'
import { ReasonSheet } from '../ReasonSheet'

interface Draft {
  branchId: string
  name: string
  latitude: string
  longitude: string
  timezone: string
  address: string
  locationLabel: string
}

const toNumber = (v: string): number | null => (v.trim() === '' ? null : Number(v.replace(',', '.')))

/**
 * Branch location fields (optional coordinates, time zone, address). Nothing is guessed: coordinates stay empty until
 * a manager types real values. There is no map, geocoding or weather lookup here.
 */
export function BranchLocationPage() {
  const { roles } = useAuth()
  const { showToast } = useToast()
  const canView = canReviewControl(roles)
  const canEdit = canManageBranchLocation(roles)
  const state = useAsync(canView ? 'branch-locations' : null, () => listBranchLocations())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  if (!canView) return <Unauthorized message="Şube konumu için yetkiniz yok." />

  const lat = draft ? toNumber(draft.latitude) : null
  const lon = draft ? toNumber(draft.longitude) : null
  const coordinateError = draft ? validateCoordinates(Number.isNaN(lat) ? Number.NaN : lat, Number.isNaN(lon) ? Number.NaN : lon) : null

  async function save(reason: string) {
    if (!draft) return
    setSaving(true)
    const result = await updateBranchLocation({
      branchId: draft.branchId,
      latitude: lat,
      longitude: lon,
      timezone: draft.timezone.trim(),
      address: draft.address.trim() || null,
      locationLabel: draft.locationLabel.trim() || null,
      reason,
    })
    setSaving(false)
    if (result.error) return showToast(result.error, 'danger')
    showToast('Şube konumu kaydedildi', 'success')
    setDraft(null)
    state.reload()
  }

  const edit = (b: BranchLocation) =>
    setDraft({
      branchId: b.id,
      name: b.name,
      latitude: b.latitude === null ? '' : String(b.latitude),
      longitude: b.longitude === null ? '' : String(b.longitude),
      timezone: b.timezone,
      address: b.address ?? '',
      locationLabel: b.locationLabel ?? '',
    })

  return (
    <Stack>
      <PageHeader title="Şube konumu" subtitle="Koordinat, saat dilimi ve adres" back={{ to: '/app/manager/management', label: 'Yönetim' }} />
      <Note>Koordinatlar isteğe bağlıdır ve tahmin edilmez; gerçek değerler girilene kadar boş kalır.</Note>
      <DataBoundary state={state} rows={3}>
        {(branches) => (
          <Stack gap="sm">
            {branches.map((b) => (
              <RowCard
                key={b.id}
                title={b.name}
                subtitle={b.hasCoordinates ? `${b.latitude}, ${b.longitude}` : 'Koordinat girilmedi'}
                meta={[b.timezone, b.locationLabel, b.address].filter(Boolean).join(' · ')}
                trailing={<StatusChip tone={b.hasCoordinates ? 'success' : 'neutral'}>{b.hasCoordinates ? 'Konum var' : 'Konum yok'}</StatusChip>}
              >
                {canEdit && (
                  <Button variant="secondary" onClick={() => edit(b)}>
                    Düzenle
                  </Button>
                )}
              </RowCard>
            ))}
          </Stack>
        )}
      </DataBoundary>

      <ReasonSheet
        open={draft !== null}
        title={draft ? `${draft.name}: konum` : 'Konum'}
        confirmLabel="Kaydet"
        loading={saving}
        ready={coordinateError === null}
        onConfirm={(reason) => void save(reason)}
        onCancel={() => setDraft(null)}
      >
        {draft && (
          <Stack gap="sm">
            <Input label="Enlem (-90 ile 90)" inputMode="decimal" value={draft.latitude} onChange={(e) => setDraft({ ...draft, latitude: e.target.value })} />
            <Input label="Boylam (-180 ile 180)" inputMode="decimal" value={draft.longitude} onChange={(e) => setDraft({ ...draft, longitude: e.target.value })} />
            {coordinateError && <Note>{coordinateError}</Note>}
            <Input label="Saat dilimi (IANA)" value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} />
            <Input label="Konum etiketi" value={draft.locationLabel} maxLength={80} onChange={(e) => setDraft({ ...draft, locationLabel: e.target.value })} />
            <Input label="Adres" value={draft.address} maxLength={300} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
          </Stack>
        )}
      </ReasonSheet>
    </Stack>
  )
}
