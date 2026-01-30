# 🏖️ Rumeli İskelesi Yönetim Sistemi

Modern, hızlı ve kullanıcı dostu web tabanlı yönetim sistemi.

## 🎯 Özellikler

### ✅ Veri Girişi
- Hızlı form (Tab navigation)
- Otomatik hesaplamalar
- Gerçek zamanlı validasyon
- Offline çalışma

### 📊 Dashboard
- Canlı grafikler (Chart.js)
- Günlük/Haftalık/Aylık analiz
- Kategori performansı
- Kasa dağılımı

### 📱 PWA (Progressive Web App)
- Ana ekrana eklenebilir
- Offline çalışma
- Hızlı yükleme
- Push notifications

### 🔄 Senkronizasyon
- Google Sheets API entegrasyonu
- Otomatik veri senkronizasyonu
- LocalStorage backup
- Background sync

---

## 🚀 Kurulum

### 1. GitHub Repository Oluştur

```bash
# GitHub'da yeni repo oluştur: rumeli-iskelesi-yonetim
git init
git add .
git commit -m "İlk commit - Rumeli İskelesi Yönetim Sistemi"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADIN/rumeli-iskelesi-yonetim.git
git push -u origin main
```

### 2. Google Sheets API Key Al

#### Adım 1: Google Cloud Console

1. https://console.cloud.google.com adresine git
2. Yeni proje oluştur: "Rumeli İskelesi"
3. **API'ler ve Hizmetler → Kitaplık** → "Google Sheets API" ara
4. **Etkinleştir**

#### Adım 2: API Anahtarı Oluştur

1. **API'ler ve Hizmetler → Kimlik Bilgileri**
2. **+ Kimlik Bilgisi Oluştur → API Anahtarı**
3. Anahtarı kopyala
4. **Anahtarı Kısıtla:**
   - Uygulama kısıtlamaları: HTTP yönlendiricileri
   - Kabul edilen yönlendirme URI'leri: 
     - `https://KULLANICI_ADIN.github.io/*`
     - `http://localhost:*` (geliştirme için)
   - API kısıtlamaları: Google Sheets API

#### Adım 3: Sheets ID Al

1. Google Sheets'i aç: "Rumeli İskelesi - Master Yönetim Sistemi"
2. URL'den ID'yi kopyala:
   ```
   https://docs.google.com/spreadsheets/d/[BU_KISIM_ID]/edit
   ```

#### Adım 4: sheets-api.js'i Güncelle

```javascript
const SHEETS_CONFIG = {
    apiKey: 'AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', // Senin API Key
    spreadsheetId: '1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // Senin Sheets ID
    range: 'Form Yanıtları!A:P',
    // ...
};
```

### 3. GitHub Pages Aktif Et

1. GitHub repo'da → **Settings**
2. **Pages** (sol menü)
3. **Source:** main branch
4. **Folder:** / (root)
5. **Save**

5-10 dakika sonra:
```
https://KULLANICI_ADIN.github.io/rumeli-iskelesi-yonetim/
```

---

## 📱 Kullanım

### Günlük Veri Girişi

1. Ana sayfayı aç: https://KULLANICI_ADIN.github.io/rumeli-iskelesi-yonetim/
2. Z raporlarından rakamları gir
3. Kategori satışlarını gir
4. **Verileri Kaydet** butonuna bas
5. ✅ Veriler Google Sheets'e kaydedildi!

### Dashboard Görüntüleme

1. Dashboard'a git veya "Dashboard" butonuna tıkla
2. Canlı grafikleri gör
3. Analizleri incele
4. Excel export (yakında)

### Mobil Kullanım

**Ana Ekrana Ekle (iOS):**
1. Safari'de siteyi aç
2. Paylaş butonu → Ana Ekrana Ekle
3. Artık uygulama gibi!

**Ana Ekrana Ekle (Android):**
1. Chrome'da siteyi aç
2. ⋮ Menü → Ana ekrana ekle
3. Artık uygulama gibi!

---

## 🎨 Özelleştirme

### Hedef Değerlerini Değiştir

`index.html` dosyasında:

```javascript
dailyTarget: [0, 6].includes(new Date().getDay()) ? 44000 : 25000
// Hafta sonu: 44000₺, Hafta içi: 25000₺
```

### Renkleri Değiştir

`index.html` ve `dashboard.html` içinde Tailwind class'ları:

```html
<!-- Mavi → Yeşil -->
class="bg-blue-600" → class="bg-green-600"
```

### Kategori Ekle/Çıkar

1. `index.html` → Formda kategori ekle
2. `sheets-api.js` → Row array'ine ekle
3. `dashboard.html` → Grafiklere ekle

---

## 🔧 Geliştirme

### Lokal Test

```bash
# Python ile basit server
python -m http.server 8000

# veya Node.js ile
npx serve
```

Tarayıcıda aç: http://localhost:8000

### Debugging

Chrome DevTools:
- **Console:** Hata mesajları
- **Application → Service Workers:** PWA durumu
- **Application → Local Storage:** Offline veri
- **Network:** API istekleri

---

## 🐛 Sorun Giderme

### API Anahtarı Çalışmıyor

1. API Key doğru kopyalandı mı?
2. Google Sheets API etkin mi?
3. API Key kısıtlamaları doğru mu?
4. Sheets "Public" mı? (Ayarlar → Paylaş → Bağlantıyı bilen herkes görüntüleyebilir)

### Veriler Kaydedilmiyor

1. İnternet bağlantısı var mı?
2. Console'da hata var mı? (F12 → Console)
3. LocalStorage'da veri var mı? (F12 → Application → Local Storage)
4. Service Worker aktif mi? (F12 → Application → Service Workers)

### Grafikler Görünmüyor

1. Chart.js yüklendi mi? (F12 → Network)
2. Data var mı? (Console'da `data` yazıp Enter)
3. Canvas element var mı? (Inspect element)

---

## 📊 Veri Formatı

### Google Sheets Sütunları

```
A: Zaman Damgası
B: Tarih
C: Rumeli İskelesi Z1 (₺)
D: Rumeli İskelesi Z2 (₺)
E: Balık Ekmek Z (₺)
F: Dondurma Z (₺)
G: Sıcak İçecekler (adet)
H: Gıda (adet)
I: Kahve (adet)
J: Soğuk İçecekler (adet)
K: Tatlı (adet)
L: Meyve Suyu (adet)
M: Notlar
```

---

## 🚀 Gelecek Özellikler

- [ ] Excel export
- [ ] PDF rapor
- [ ] Email otomasyonu (Apps Script)
- [ ] Kullanıcı yönetimi
- [ ] Dark mode
- [ ] Çoklu dil desteği
- [ ] AI-powered insights
- [ ] Tahmin modelleri

---

## 📞 Destek

Sorun yaşıyorsan:
1. Bu README'yi oku
2. Issues bölümünde ara
3. Yeni issue aç

---

## 📝 Lisans

MIT License - İstediğin gibi kullan!

---

## 🙏 Teşekkürler

- Tailwind CSS
- Alpine.js
- Chart.js
- Feather Icons
- Google Sheets API

---

**Yapımcı:** Devoloper  
**Tarih:** Ocak 2026  
**Versiyon:** 1.0.0

🏖️ **Rumeli İskelesi'ne başarılar!** 🚀
