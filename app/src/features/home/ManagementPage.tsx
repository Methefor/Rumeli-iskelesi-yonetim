import { canInventory } from '../../domain/inventory'
import { LinkButton, PageHeader, RowCard, Stack, StatusChip } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import styles from './Home.module.css'

/**
 * Management hub: entry points to the administration screens that exist
 * today, and honest "coming soon" entries for the ones that do not — no
 * placeholder pages, no dead links.
 */
export function ManagementPage() {
  const { roles } = useAuth()
  const canCost = canInventory(roles, 'inventory.cost.read')
  const canItems = canInventory(roles, 'inventory.item.manage')

  return (
    <Stack>
      <PageHeader title="Yönetim" subtitle="Ürün, maliyet ve mutabakat yönetimi" />

      <section aria-labelledby="available">
        <h2 id="available" className={styles.sectionTitle}>
          Kullanılabilir
        </h2>
        <Stack gap="sm">
          {canItems && (
            <RowCard
              title="Ürün yönetimi"
              subtitle="Stok ürünlerini ekleyin, düzenleyin, pasifleştirin."
            >
              <LinkButton to="inventory/items" variant="secondary">
                Ürünler
              </LinkButton>
            </RowCard>
          )}
          {canCost && (
            <RowCard
              title="Maliyet ve brüt kâr"
              subtitle="Geçerlilik tarihli ürün maliyetleri (geçmiş silinmez) ve brüt kâr."
            >
              <Stack gap="sm">
                <LinkButton to="inventory/costs" variant="secondary">
                  Maliyet
                </LinkButton>
                <LinkButton to="inventory/profit" variant="secondary">
                  Brüt Kâr
                </LinkButton>
              </Stack>
            </RowCard>
          )}
          <RowCard
            title="Mutabakat kuyruğu"
            subtitle="Kasa ve kategori toplamı uyuşmayan raporlar."
          >
            <LinkButton to="reports/reconciliation" variant="secondary">
              Kuyruğu Aç
            </LinkButton>
          </RowCard>
          <RowCard
            title="Stok hareketleri ve düzeltme"
            subtitle="Defter kayıtları, gerekçeli düzeltme ve geri alma."
          >
            <LinkButton to="inventory/movements" variant="secondary">
              Hareketler
            </LinkButton>
          </RowCard>
        </Stack>
      </section>

      <section aria-labelledby="soon">
        <h2 id="soon" className={styles.sectionTitle}>
          Yakında
        </h2>
        <Stack gap="sm">
          {[
            ['Çalışanlar ve roller', 'Çalışan ekleme, rol ve şube atama, PIN sıfırlama.'],
            ['Şubeler', 'Şube bilgileri ve çalışma düzeni.'],
            ['Puanlama ve rozetler', 'Yapılandırılabilir performans kuralları.'],
            ['Ayarlar', 'Vardiya saatleri, gecikme toleransı, eşik değerleri.'],
          ].map(([title, subtitle]) => (
            <RowCard
              key={title}
              title={title}
              subtitle={subtitle}
              trailing={<StatusChip>Yakında</StatusChip>}
            />
          ))}
        </Stack>
      </section>
    </Stack>
  )
}
