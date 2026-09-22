# Local Supabase doğrulaması — 22 Eylül 2026

## Sonuç: LOCAL PASS

Repo `v4-2027`, temel commit `5a3922e02a5e0798f78c115a70d46f9e93269acc`. Çalışma dosyaları commit edilmedi. Production/hosted Supabase, main, eski stash ve Vercel ortamları değiştirilmedi. Deploy, commit veya push yapılmadı.

Docker Desktop 4.91.0 / Engine 29.8.0, Supabase CLI 2.117.0 ve local Postgres 17.6 ile gerçek local stack kullanıldı. `supabase db reset --local --no-seed` üzerinden 001–014 temiz veritabanına uygulandı. Repoda seed.sql bulunmadığı için seed atlandı; testler kendi sentetik fixture verilerini oluşturdu. Kesintiden kalan 012'deki iki SQL blok ayırıcı sözdizimi hatası giderildi ve reset baştan başarıyla tekrarlandı.

| Kontrol | Sonuç |
|---|---|
| Fresh migrations 001–014 | PASS |
| inventory_security.test.sql: gerçek postgres/anon/authenticated rolleri | PASS, transaction rollback |
| timezone_regression.test.sql: 4 session timezone, gün/yıl/leap-day ve kesin sınır | PASS, transaction rollback |
| timezone_rpc.test.sql: gerçek create_sales_report çağrıları | 32/32 PASS |
| local_inventory_api.mjs: gerçek Auth parola oturumları + JWT + PostgREST | 135/135 PASS |
| Uygulama unit/demo/UI integration suite | 163 test / 21 dosya PASS |
| Typecheck, lint, build | PASS |
| Local security advisors, warn/error seviyesi | No issues found |
| Tarayıcı | Kasiyer stok düzeltme/geri alma, yönetici sayım iptali ve denetim görünümü PASS; denetim ekranı 360px görsel kontrol PASS |

API testleri owner, manager, branch_manager, cashier, employee, viewer ve anonim erişimi sınar. Kullanıcılar local Auth admin API ile oluşturuldu ve gerçek parola girişinden JWT alındı; SQL role taklidi bunun yerine kullanılmadı. Kendi/diğer şube erişimi, ham yazma engelleri, maliyet gizliliği, zorunlu gerekçe, satış hareketini doğrudan tersleyememe, atanmadığı vardiyayı aşamama ve denetim geçmişinin değiştirilememesi doğrulandı. Owner'ın gördüğü stok snapshotları 16→20, 20→16 ve 16→14 olarak sayısal doğrulandı.

## Onaylanan yetki kararı

Metehan'ın açık seçimi: kasiyer kendi şubesinde stok düzeltme, satış dışı hareketi geri alma ve sayım iptali yapabilir; işletme sahibi denetler. Bu karar, 21 Eylül raporundaki yalnız manager/owner doğrudan işlem yapsın önerisinin yerini alır.

- Cashier için inventory.adjust eklendi; mevcut şube üyeliği kontrolleri aynen uygulanır. Birden fazla yetkili şube üyeliği varsa kapsam bu üyeliklerdir.
- Branch_manager mevcut adjust/reverse/count-void kapsamını korur.
- Cashier maliyet okuma/yazma, ürün yönetimi, mal kabul veya atanmadığı vardiyayı aşma yetkisi kazanmadı. Genel employee rolü değişmedi.
- Gerekçe zorunlu; işlem yapan kişi auth.uid(), zaman sunucu zamanı. Düzeltme ve ters kayıtta önce/sonra stok, sayım iptalinde önce/sonra durum tutulur.
- İç denetim yazıcısının doğrudan istemci çağrısı kapatıldı. Viewer gibi rapor rollerinin inventory audit üzerinden maliyet okuma yolu kapatıldı; diğer rapor denetim erişimi korundu.
- Yönetim → Stok denetimi, owner/manager için seçili şubenin son 100 düzeltme/geri alma/sayım iptalini gösterir: kullanıcı, İstanbul zamanı, gerekçe ve önce/sonra. Tüm geçmiş veritabanında korunur; bu ekranda sayfalama/uzun dönem filtreleme henüz yoktur.

## Saat dilimi bulgusu ve düzeltme

011'de timestamp değerinin timestamptz değişkenine örtük dönüşümü session TimeZone'a bağlıydı. 014 aynı fonksiyonu tekrar tanımladığı için hata orada da vardı; yalnız 011'i düzeltmek yeterli değildi. Her iki prepared dosyada cutoff artık açıkça `AT TIME ZONE 'Europe/Istanbul'` ile hesaplanıyor. Ön yüzde cihaz yerel saatine bağlı Date hesabı da İstanbul iş saati hesabıyla değiştirildi.

Örnek: 17:30 İstanbul sınırı 14:30 UTC olmalı; eski UTC session hesabı sınırı 20:30 İstanbul'a kaydırıyordu. İleri saat dilimleri erken kapanmaya neden olabiliyordu. Bu, hazırlanan kodda doğrulanmış bir kusurdur; eski production şikâyetlerinin tek nedeninin bu olduğu iddia edilmiyor.

Gerçek RPC testleri UTC, Europe/Istanbul, America/New_York ve Asia/Tokyo altında vardiya günü/ertesi gün, geç/uygun giriş, kasiyer ve yönetici istisnası kombinasyonlarını sınadı. Kesin cutoff anında izin ve hemen sonrasında ret aritmetik testte doğrulandı. SQL ayrıcalıklı kullanıcı istisnası ve ön yüzdeki mevcut isBackdated iş kuralı değiştirilmedi.

## Sınırlar ve açık konular

- Sayım iptali stoğu veya daha önce o sayıma bağlı düzeltmeleri geri almaz. İptal penceresi ve denetim ekranı bunu açıkça bildirir.
- Kasiyer işlemleri için miktar/süre limiti, ikinci onay veya negatif stok engeli eklenmedi. Mevcut append-only/audit modeli ile sonradan denetim uygulanıyor.
- Build geçiyor; yaklaşık 632 kB JS paket boyutu uyarısı var.
- Local Vector yardımcı log toplayıcısı Docker log bağlantısında Connection refused nedeniyle yeniden başlıyor. DB/Auth/PostgREST ve test sonuçları bundan etkilenmedi; local log toplama ayrıca ele alınmalı. Güvenlik ayarları gevşetilmedi.
- Hosted/staging doğrulaması ve production yayınlama yapılmadı. Demo tarayıcı verisi sentetiktir ve tam sayfa yenilemede sıfırlanır; gerçek API fixture verileri local veritabanında bir sonraki fresh reset'e kadar kalır.

## Tekrar çalıştırma

Yalnız disposable local stack üzerinde, repository kökünden:

1. `supabase db reset --local --no-seed`
2. `supabase/tests/inventory_security.test.sql`, `timezone_regression.test.sql`, `timezone_rpc.test.sql` dosyalarını local DB'ye psql `ON_ERROR_STOP=1` ile uygula; üçü de rollback yapar.
3. `node supabase/tests/local_inventory_api.mjs` — CLI/Docker PATH üzerinde değilse `SUPABASE_CLI` ve `DOCKER_CLI` tam yollarını ayarla. Script yalnız `http://127.0.0.1:54321` kabul eder; anahtarları yazdırmaz. Öncesinde fresh reset gerekir.
4. app altında typecheck, lint, test, build.

Sonraki adım: hazırlanan değişiklikleri inceleme. Commit/push veya hosted uygulama için yeni talimat beklenir.

## Güncelleme — aynı gün, daha sonra: kasiyer yetkisi geri alındı

Kullanıcının açık onayı üzerine, yukarıda anlatılan kasiyer `inventory.adjust` yetkisi geri alındı ve `reverse_inventory_movement` yalnızca owner/manager ile sınırlandırıldı (branch_manager kendi şubesinde adjust ve sayım iptali yapabilir, artık hareketi geri alamaz). Detay ve gerekçe: `DECISIONS.md` "cashier grant rolled back; final inventory authorization scope".

Fresh `supabase db reset --local --no-seed` sonrası tekrar çalıştırıldı:

| Kontrol | Sonuç |
|---|---|
| Fresh migrations 001–014 | PASS |
| `inventory_security.test.sql` (yeni E2 bölümü dahil: kasiyer ve branch_manager için gerçek kendi şube fixture'larıyla) | PASS, transaction rollback |
| `timezone_regression.test.sql` | PASS, transaction rollback |
| `timezone_rpc.test.sql` | 32/32 PASS |
| `local_inventory_api.mjs` (adjust/reverse/void akışı tamamen yeniden yazıldı) | 137/137 PASS |
| Uygulama unit/demo/UI integration suite | 165 test / 21 dosya PASS |
| Typecheck, lint, build | PASS |

Commit/push yok; production/hosted Supabase değiştirilmedi.
