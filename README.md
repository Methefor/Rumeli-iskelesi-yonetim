# Rumeli İskelesi Yönetim Sistemi

Bu proje, Rumeli İskelesi işletmesi için geliştirilmiş modern, mobil uyumlu bir günlük ciro ve veri yönetim panelidir. Google Sheets yerine **Supabase** veritabanı kullanılarak daha güvenli, hızlı ve detaylı analiz imkanı sunar.

## 🚀 Özellikler

*   **Mobil Uyumlu Tasarım:** Her cihazda kusursuz görünüm.
*   **Anlık Veri Girişi:** Günlük kasa, gıda, içecek ve diğer satış verilerinin hızlı girişi.
*   **Gelişmiş Dashboard:**
    *   **Kasa Şampiyonu:** En yüksek ciroyu yapan kasanın analizi.
    *   **Kategori Performansı:** En çok satan ürün gruplarının oransal dağılımı.
    *   **Haftalık & Aylık Analiz:** Günlük ve haftalık ciro karşılaştırmaları.
    *   **Hafta İçi vs Hafta Sonu:** Satış trendlerinin gün bazlı karşılaştırması.
    *   **Ciro Tahmini:** Mevcut performansa göre ay sonu tahminlemesi.
*   **Karanlık Mod:** Göz yormayan arayüz seçeneği.
*   **PWA Desteği:** Uygulama gibi çalışabilme özelliği.

## 🛠️ Kurulum & Kullanım

1.  Bu projeyi yerel bilgisayarınıza klonlayın.
2.  `index.html` sayfasını açarak günlük verileri girmeye başlayabilirsiniz.
3.  `dashboard.html` sayfası üzerinden detaylı analizleri ve grafikleri görüntüleyebilirsiniz.

## 🗄️ Veritabanı Yapısı (Supabase)

Proje verileri Supabase üzerinde `sales_records` tablosunda tutulmaktadır.

**Tablo Şeması:**
*   `date`: Tarih
*   `cashier_name`: Kasiyer Adı
*   `rumeliZ1`, `rumeliZ2`, `balikEkmek`, `dondurma`: Ciro Kalemleri
*   `gida`, `kahve`, `sicakIcecek` vb.: Adet bazlı satışlar

## 🎨 Teknolojiler

*   **Frontend:** HTML5, Alpine.js, Tailwind CSS
*   **Grafikler:** Chart.js
*   **Veritabanı:** Supabase (PostgreSQL)

## 📝 Notlar

*   Veri girişi sırasında internet bağlantısı gereklidir.
*   Veriler anlık olarak bulut veritabanına işlenir.
