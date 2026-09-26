import { Unauthorized } from '../../../components/navigation/Unauthorized'
import {
  Card,
  DataBoundary,
  Note,
  PageHeader,
  RowCard,
  Stack,
  StatusChip,
} from '../../../components/ui'
import { TRUST_TONE, type Trust } from '../../../domain/dataQuality'
import { highestRank } from '../../../domain/management'
import { useAsync } from '../../../hooks/useAsync'
import { useAuth } from '../../../hooks/useAuth'
import { getDataQuality } from '../../../services/data'

function TrustChip({ trust }: { trust: Trust }) {
  return <StatusChip tone={TRUST_TONE[trust.level]}>{trust.label}</StatusChip>
}

/**
 * Where the configured operating data came from and what is still missing.
 * Read-only: values are loaded by the operator with the local loader
 * (operating-data/), never typed in here, and nothing unapproved is shown as
 * business truth. Owner/manager only (the provenance table is RLS-gated too).
 */
export function DataQualityPage() {
  const { user, roles } = useAuth()
  const allowed = highestRank(roles) >= 3
  const data = useAsync(allowed && user ? `data-quality:${user.id}` : null, () => getDataQuality())

  if (!allowed) {
    return <Unauthorized message="Veri kalitesi özetini yalnızca işletme sahibi ve yönetici görüntüleyebilir." />
  }

  return (
    <Stack>
      <PageHeader
        title="Veri kalitesi"
        subtitle="Yapılandırmanın kaynağı ve eksikleri"
        back={{ to: '/app/manager/management', label: 'Yönetim' }}
      />
      <Note>
        Bu ekran yalnızca gösterir. Veriler yerel yükleyici ile yüklenir; onaylanmamış, eski
        uygulamadan görülmüş veya test amaçlı değerler işletme verisi gibi gösterilmez.
      </Note>
      <DataBoundary state={data} rows={4}>
        {(report) => (
          <Stack>
            <Card>
              <Stack gap="sm">
                <div>
                  <StatusChip tone="success">Doğrulanmış {report.totals.trusted}</StatusChip>{' '}
                  <StatusChip tone="warning">Onay bekleyen {report.totals.pending}</StatusChip>{' '}
                  <StatusChip tone="info">Test verisi {report.totals.test}</StatusChip>{' '}
                  <StatusChip tone="danger">Bilinmeyen {report.totals.unknown}</StatusChip>
                </div>
              </Stack>
            </Card>

            <section aria-labelledby="dq-issues">
              <h2 id="dq-issues">Eksikler ve uyarılar</h2>
              {report.issues.length === 0 ? (
                <Note>Eksik veya uyarı yok.</Note>
              ) : (
                <Stack gap="sm">
                  {report.issues.map((issue, i) => (
                    <Note key={`${i}-${issue.message}`}>
                      {issue.severity === 'error' ? 'Hata: ' : ''}
                      {issue.message}
                    </Note>
                  ))}
                </Stack>
              )}
            </section>

            {report.branches.map((b) => (
              <section key={b.key} aria-label={b.name}>
                <RowCard
                  title={b.name}
                  subtitle={`${b.shiftCount} vardiya · ${b.registerCount} kasa · ${b.categoryCount} kategori · ${b.activeItems} aktif / ${b.inactiveItems} pasif ürün`}
                  trailing={<TrustChip trust={b.trust} />}
                >
                  <Stack gap="sm">
                    {b.thresholds && (
                      <p>
                        Mutabakat eşiği: uyarı %{b.thresholds.warning} · hata %{b.thresholds.error}{' '}
                        <TrustChip trust={b.thresholds.trust} />
                      </p>
                    )}
                    {b.shifts.map((s) => (
                      <p key={s.key}>
                        {s.name} {s.start}–{s.end} (rapor son saati {s.cutoff}
                        {s.isActive ? '' : ', pasif'}) <TrustChip trust={s.trust} />
                      </p>
                    ))}
                    {b.items.map((it) => (
                      <p key={it.code}>
                        {it.code} · {it.name} · {it.unit}
                        {it.allowsDecimal ? ' · ondalıklı' : ' · tam sayı'}
                        {it.categoryKey ? ` · ${it.categoryKey}` : ' · kategori yok'}
                        {it.isActive ? '' : ' · pasif'} <TrustChip trust={it.trust} />
                      </p>
                    ))}
                  </Stack>
                </RowCard>
              </section>
            ))}
          </Stack>
        )}
      </DataBoundary>
    </Stack>
  )
}
