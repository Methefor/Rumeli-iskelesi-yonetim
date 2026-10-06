import { canInventory } from '../../domain/inventory'
import { canManageWasteReasons, canReviewControl } from '../../domain/inventory/control'
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
  const canControl = canReviewControl(roles)
  const canReasons = canManageWasteReasons(roles)

  return (
    <Stack>
      <PageHeader title="Yönetim" subtitle="Ürün, maliyet ve mutabakat yönetimi" />

      <section aria-labelledby="available">
        <h2 id="available" className={styles.sectionTitle}>
          Kullanılabilir
        </h2>
        <Stack gap="sm">
          <RowCard
            title="Çalışanlar"
            subtitle="Ara, oluştur, rol/şube ata, PIN sıfırla, aktif/pasif yap."
          >
            <LinkButton to="/app/manager/management/employees" variant="secondary">
              Çalışanları Yönet
            </LinkButton>
          </RowCard>
          <RowCard
            title="Ayarlar"
            subtitle="Vardiya rapor saatleri ve mutabakat eşikleri."
          >
            <LinkButton to="/app/manager/management/settings" variant="secondary">
              Ayarları Aç
            </LinkButton>
          </RowCard>
          {(roles.includes('owner') || roles.includes('manager')) && (
            <RowCard
              title="Yönetim denetimi"
              subtitle="Kullanıcı, rol, şube ve ayar değişiklikleri: kim, ne zaman, neden."
            >
              <LinkButton to="/app/manager/management/audit" variant="secondary">
                Denetimi Aç
              </LinkButton>
            </RowCard>
          )}
          {(roles.includes('owner') || roles.includes('manager')) && (
            <RowCard
              title="Veri kalitesi"
              subtitle="Yapılandırmanın kaynağı, onay durumu ve eksik eşlemeler."
            >
              <LinkButton to="/app/manager/management/data-quality" variant="secondary">
                Özeti Aç
              </LinkButton>
            </RowCard>
          )}
          {(roles.includes('owner') || roles.includes('manager')) && (
            <RowCard
              title="Stok denetimi"
              subtitle="Kim, ne zaman, hangi gerekçeyle değiştirdi? Önceki ve sonraki değerler."
            >
              <LinkButton to="/app/manager/inventory/audit" variant="secondary">
                Denetimi Aç
              </LinkButton>
            </RowCard>
          )}
          {canItems && (
            <RowCard
              title="Ürün yönetimi"
              subtitle="Stok ürünlerini ekleyin, düzenleyin, pasifleştirin."
            >
              <LinkButton to="/app/manager/inventory/items" variant="secondary">
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
                <LinkButton to="/app/manager/inventory/costs" variant="secondary">
                  Maliyet
                </LinkButton>
                <LinkButton to="/app/manager/inventory/profit" variant="secondary">
                  Brüt Kâr
                </LinkButton>
              </Stack>
            </RowCard>
          )}
          {canControl && (
            <RowCard
              title="Fire raporu"
              subtitle="Ürün, neden, çalışan ve vardiya bazında fire; maliyeti bilinmeyen kayıtlar açıkça işaretlenir."
            >
              <LinkButton to="/app/manager/management/waste-report" variant="secondary">
                Raporu Aç
              </LinkButton>
            </RowCard>
          )}
          {canControl && (
            <RowCard
              title="Kapanış sayımı"
              subtitle="Bugünkü sayım durumu, eksik/fazla toplamları ve fire ile açıklanan farklar."
            >
              <LinkButton to="/app/manager/management/count-review" variant="secondary">
                Sayım Özetini Aç
              </LinkButton>
            </RowCard>
          )}
          {canReasons && (
            <RowCard
              title="Fire nedenleri"
              subtitle="Fire kaydında seçilebilen nedenleri ekleyin, düzenleyin, pasifleştirin."
            >
              <LinkButton to="/app/manager/management/waste-reasons" variant="secondary">
                Nedenleri Yönet
              </LinkButton>
            </RowCard>
          )}
          <RowCard
            title="Mutabakat kuyruğu"
            subtitle="Kasa ve kategori toplamı uyuşmayan raporlar."
          >
            <LinkButton to="/app/manager/reports/reconciliation" variant="secondary">
              Kuyruğu Aç
            </LinkButton>
          </RowCard>
          <RowCard
            title="Stok hareketleri ve düzeltme"
            subtitle="Defter kayıtları, gerekçeli düzeltme ve geri alma."
          >
            <LinkButton to="/app/manager/inventory/movements" variant="secondary">
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
            ['Şubeler', 'Şube bilgileri ve çalışma düzeni.'],
            ['Puanlama ve rozetler', 'Yapılandırılabilir performans kuralları.'],
            ['Genel operasyon ayarları', 'Gecikme toleransı ve genel/şube operasyon parametreleri. Vardiya rapor saatleri ve mutabakat eşikleri yukarıdaki Ayarlar sayfasında.'],
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
