import { useState } from 'react'
import {
  Button,
  Card,
  DataBoundary,
  Input,
  Note,
  PageHeader,
  Select,
  Stack,
} from '../../../components/ui'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import {
  canEditShiftSettings,
  canEditThresholds,
  canUseManagementCenter,
} from '../../../domain/management'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../hooks/useToast'
import {
  getReconciliationThresholds,
  listBranches,
  listShiftSettings,
  setReconciliationThresholds,
  updateShiftSettings,
  type ShiftSettings,
} from '../../../services/data'
import { ReasonSheet } from '../ReasonSheet'

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Settings the schema actually supports: shift definitions (name, submission
 * cutoff, active) and per-branch reconciliation thresholds. There is no
 * separate "lateness tolerance" column: lateness is decided by the shift
 * cutoff shown here. Every change asks for a reason and is audited.
 */
export function SettingsPage() {
  const { user, roles, branchIds } = useAuth()
  const { showToast } = useToast()
  const allowed = canUseManagementCenter(roles)
  const [branchId, setBranchId] = useState('')
  const branches = useAsync(allowed && user ? `mgmt-settings-branches:${user.id}` : null, () =>
    listBranches(),
  )
  const actor = user ? { id: user.id, roles, branchIds } : null
  const editable = (branches.data ?? []).filter((b) => actor && canEditShiftSettings(actor, b.id))
  const selected = branchId || editable[0]?.id || ''
  const data = useAsync(selected ? `mgmt-settings:${selected}` : null, async () => ({
    shifts: await listShiftSettings(selected),
    thresholds: await getReconciliationThresholds(selected),
  }))
  const [edit, setEdit] = useState<ShiftSettings | null>(null)
  const [thr, setThr] = useState<{ warning: string; error: string } | null>(null)
  const [saving, setSaving] = useState(false)

  if (!allowed) return <Unauthorized message="Ayarlar için yetkiniz yok." />

  async function saveShift(reason: string) {
    if (!edit) return
    setSaving(true)
    const result = await updateShiftSettings({ ...edit, reason })
    setSaving(false)
    if (result.error) return showToast(result.error, 'danger')
    showToast('Vardiya ayarı kaydedildi', 'success')
    setEdit(null)
    data.reload()
  }

  async function saveThresholds(reason: string) {
    if (!thr) return
    setSaving(true)
    const result = await setReconciliationThresholds({
      branchId: selected,
      warningPercentage: Number(thr.warning),
      errorPercentage: Number(thr.error),
      reason,
    })
    setSaving(false)
    if (result.error) return showToast(result.error, 'danger')
    showToast('Eşikler kaydedildi', 'success')
    setThr(null)
    data.reload()
  }

  return (
    <Stack>
      <PageHeader
        title="Ayarlar"
        subtitle="Vardiya ve mutabakat ayarları"
        back={{ to: '/app/manager/management', label: 'Yönetim' }}
      />
      <Select
        label="Şube"
        value={selected}
        onChange={(e) => setBranchId(e.target.value)}
        options={editable.map((b) => ({ value: b.id, label: b.name }))}
      />
      <DataBoundary state={data} rows={3}>
        {({ shifts, thresholds }) => (
          <Stack>
            <h2>Vardiyalar</h2>
            {shifts.map((s) => (
              <Card key={s.id}>
                <Stack gap="sm">
                  <strong>{s.name}{s.isActive ? '' : ' (pasif)'}</strong>
                  <p>
                    {pad(s.startHour)}:{pad(s.startMinute)}–{pad(s.endHour)}:{pad(s.endMinute)} · Rapor
                    son saati {pad(s.cutoffHour)}:{pad(s.cutoffMinute)}
                    {s.cutoffDayOffset === 1 ? ' (ertesi gün)' : ''}
                  </p>
                  <Button variant="secondary" onClick={() => setEdit({ ...s })}>
                    Düzenle
                  </Button>
                </Stack>
              </Card>
            ))}
            {thresholds && (
              <>
                <h2>Mutabakat eşikleri</h2>
                <Card>
                  <Stack gap="sm">
                    <p>
                      Uyarı %{thresholds.warningPercentage} · Hata %{thresholds.errorPercentage}
                    </p>
                    {canEditThresholds(roles) ? (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setThr({
                            warning: String(thresholds.warningPercentage),
                            error: String(thresholds.errorPercentage),
                          })
                        }
                      >
                        Eşikleri Düzenle
                      </Button>
                    ) : (
                      <Note>Eşikleri yalnızca yönetici veya sahip değiştirebilir.</Note>
                    )}
                  </Stack>
                </Card>
              </>
            )}
          </Stack>
        )}
      </DataBoundary>

      <ReasonSheet
        open={edit !== null}
        title="Vardiya ayarını düzenle"
        confirmLabel="Kaydet"
        loading={saving}
        ready={!!edit && edit.name.trim().length > 0}
        onConfirm={(reason) => void saveShift(reason)}
        onCancel={() => setEdit(null)}
      >
        {edit && (
          <Stack gap="sm">
            <Input
              label="Ad"
              value={edit.name}
              maxLength={60}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
            <Input
              label="Rapor son saati (saat)"
              type="number"
              inputMode="numeric"
              min={0}
              max={23}
              value={String(edit.cutoffHour)}
              onChange={(e) => setEdit({ ...edit, cutoffHour: Number(e.target.value) })}
            />
            <Input
              label="Rapor son saati (dakika)"
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              value={String(edit.cutoffMinute)}
              onChange={(e) => setEdit({ ...edit, cutoffMinute: Number(e.target.value) })}
            />
            <Select
              label="Son saat hangi gün?"
              value={String(edit.cutoffDayOffset)}
              onChange={(e) => setEdit({ ...edit, cutoffDayOffset: Number(e.target.value) })}
              options={[
                { value: '0', label: 'Aynı gün' },
                { value: '1', label: 'Ertesi gün' },
              ]}
            />
            <Select
              label="Durum"
              value={edit.isActive ? '1' : '0'}
              onChange={(e) => setEdit({ ...edit, isActive: e.target.value === '1' })}
              options={[
                { value: '1', label: 'Aktif' },
                { value: '0', label: 'Pasif' },
              ]}
            />
          </Stack>
        )}
      </ReasonSheet>

      <ReasonSheet
        open={thr !== null}
        title="Mutabakat eşikleri"
        confirmLabel="Kaydet"
        loading={saving}
        ready={
          !!thr &&
          thr.warning !== '' &&
          thr.error !== '' &&
          Number(thr.warning) >= 0 &&
          Number(thr.error) >= Number(thr.warning) &&
          Number(thr.error) <= 100
        }
        onConfirm={(reason) => void saveThresholds(reason)}
        onCancel={() => setThr(null)}
      >
        {thr && (
          <Stack gap="sm">
            <Input
              label="Uyarı eşiği (%)"
              type="number"
              inputMode="decimal"
              value={thr.warning}
              onChange={(e) => setThr({ ...thr, warning: e.target.value })}
            />
            <Input
              label="Hata eşiği (%)"
              type="number"
              inputMode="decimal"
              value={thr.error}
              onChange={(e) => setThr({ ...thr, error: e.target.value })}
            />
            <Note>Uyarı eşiği, hata eşiğinden büyük olamaz.</Note>
          </Stack>
        )}
      </ReasonSheet>
    </Stack>
  )
}
