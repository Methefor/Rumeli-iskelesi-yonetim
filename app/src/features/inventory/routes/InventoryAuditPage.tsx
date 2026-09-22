import { useAuth } from '../../../hooks/useAuth'
import { useAsync } from '../../../hooks/useAsync'
import { Unauthorized } from '../../../components/navigation/Unauthorized'
import {
  DataBoundary,
  EmptyState,
  Note,
  PageHeader,
  RowCard,
  Stack,
} from '../../../components/ui'
import { listInventoryAudit, listInventoryItems } from '../../../services/data'
import { formatDateTime } from '../../../utils/dates'
import { formatQuantity } from '../../../utils/format'
import { useInventoryContext } from '../hooks'

const labels: Record<string, string> = {
  inventory_adjustment: 'Stok düzeltme',
  inventory_movement_reversal: 'Hareketi geri alma',
  inventory_count_void: 'Sayım iptali',
}
function value(snapshot: Record<string, unknown> | null): string {
  if (typeof snapshot?.theoretical_quantity === 'number')
    return formatQuantity(snapshot.theoretical_quantity)
  if (snapshot?.status === 'submitted') return 'Gönderilmiş'
  if (snapshot?.status === 'voided') return 'İptal edilmiş'
  return 'Kayıt yok'
}
export function InventoryAuditPage() {
  const { roles } = useAuth()
  const allowed = roles.includes('owner') || roles.includes('manager')
  const { branchId, branchName } = useInventoryContext()
  const data = useAsync(
    allowed && branchId ? `inventory-audit:${branchId}` : null,
    async () => {
      const [entries, items] = await Promise.all([
        listInventoryAudit(branchId!),
        listInventoryItems(branchId!),
      ])
      return { entries, items }
    },
  )
  if (!allowed)
    return (
      <Unauthorized message="Denetim kayıtlarını yalnızca işletme sahibi ve yönetici görüntüleyebilir." />
    )
  return (
    <Stack>
      <PageHeader
        title="Stok denetimi"
        subtitle={branchName || undefined}
        back={{ to: '/app/manager/management', label: 'Yönetim' }}
      />
      <Note>
        Seçili şubenin son 100 işlemi. Saatler İstanbul saatidir. Sayım iptali stok
        miktarını veya bağlantılı düzeltmeleri geri almaz.
      </Note>
      <DataBoundary state={data}>
        {({ entries, items }) =>
          entries.length ? (
            <Stack>
              {entries.map((entry) => {
                const itemId =
                  entry.after?.inventory_item_id ?? entry.before?.inventory_item_id
                const item = items.find((i) => i.id === itemId)
                return (
                  <RowCard
                    key={entry.id}
                    title={labels[entry.action] ?? entry.action}
                    subtitle={`${branchName} · ${entry.actorName} · ${formatDateTime(entry.at)}`}
                  >
                    <Stack gap="sm">
                      {item && (
                        <p>
                          {item.name} ({item.unit})
                        </p>
                      )}
                      <p>Gerekçe: {entry.reason || 'Kayıt yok'}</p>
                      <p>
                        Önce: {value(entry.before)} → Sonra: {value(entry.after)}
                      </p>
                      <details>
                        <summary>Kayıt bilgileri</summary>
                        <p style={{ overflowWrap: 'anywhere' }}>
                          İşlem: {entry.entityId}
                          <br />
                          Kullanıcı: {entry.actorId}
                        </p>
                      </details>
                    </Stack>
                  </RowCard>
                )
              })}
            </Stack>
          ) : (
            <EmptyState
              title="Denetim kaydı yok"
              description="Bu şubede yapılan düzeltme, geri alma ve sayım iptalleri burada görünür."
            />
          )
        }
      </DataBoundary>
    </Stack>
  )
}
