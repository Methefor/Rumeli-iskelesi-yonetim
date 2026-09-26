import { Unauthorized } from '../../../components/navigation/Unauthorized'
import {
  DataBoundary,
  EmptyState,
  Note,
  PageHeader,
  RowCard,
  Stack,
} from '../../../components/ui'
import { highestRank } from '../../../domain/management'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { listManagementAudit } from '../../../services/data'
import { formatDateTime } from '../../../utils/dates'
import { AUDIT_LABELS, summarizeAudit } from '../labels'

/** Critical management actions: who, when (Istanbul), why, and before/after. Owner/manager only. */
export function ManagementAuditPage() {
  const { user, roles } = useAuth()
  const allowed = highestRank(roles) >= 3
  const data = useAsync(allowed && user ? `mgmt-audit:${user.id}` : null, () =>
    listManagementAudit(100),
  )

  if (!allowed) {
    return <Unauthorized message="Denetim kayıtlarını yalnızca işletme sahibi ve yönetici görüntüleyebilir." />
  }

  return (
    <Stack>
      <PageHeader
        title="Yönetim denetimi"
        subtitle="Kullanıcı, rol, şube ve ayar işlemleri"
        back={{ to: '/app/manager/management', label: 'Yönetim' }}
      />
      <Note>Son 100 işlem. Saatler İstanbul saatidir. PIN değerleri hiçbir zaman kaydedilmez.</Note>
      <DataBoundary state={data} rows={4}>
        {(entries) =>
          entries.length === 0 ? (
            <EmptyState
              icon="🧾"
              title="Denetim kaydı yok"
              description="Yönetim işlemleri burada görünür."
            />
          ) : (
            <Stack gap="sm">
              {entries.map((e) => (
                <RowCard
                  key={e.id}
                  title={AUDIT_LABELS[e.action] ?? e.action}
                  subtitle={`${e.actorName} · ${formatDateTime(e.at)}`}
                  meta={[e.targetName, summarizeAudit(e.action, e.before, e.after)]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  <p>Gerekçe: {e.reason || 'Kayıt yok'}</p>
                </RowCard>
              ))}
            </Stack>
          )
        }
      </DataBoundary>
    </Stack>
  )
}
