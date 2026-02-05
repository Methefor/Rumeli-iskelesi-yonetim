# RUMELI İSKELESİ YÖNETİM SİSTEMİ - PROJE YAPISI

```
rumeli-iskelesi-yonetim/
│
├── index.html                 # Ana sayfa (Veri Giriş)
├── dashboard.html             # Dashboard & Grafikler
├── raporlar.html             # Raporlar sayfası
├── manifest.json             # PWA manifest
├── sw.js                     # Service Worker (Offline)
│
├── css/
│   ├── main.css              # Ana stil dosyası
│   └── tailwind.config.js    # Tailwind ayarları
│
├── js/
│   ├── app.js                # Ana uygulama mantığı
│   ├── sheets-api.js         # Google Sheets API
│   ├── charts.js             # Grafik yönetimi
│   ├── calculations.js       # Hesaplamalar
│   └── storage.js            # LocalStorage yönetimi
│
├── assets/
│   ├── icons/                # PWA ikonları
│   └── images/               # Görseller
│
└── README.md                 # Dokümantasyon
```

## TEKNOLOJİ STACK

### Frontend:
- **HTML5**: Semantic markup
- **Tailwind CSS 3.4**: Utility-first CSS framework
- **Alpine.js**: Minimal JavaScript framework
- **Chart.js 4.0**: Grafikler
- **Feather Icons**: İkonlar

### Backend/API:
- **Google Sheets API v4**: Veri depolama
- **Google Apps Script**: Otomatik işlemler

### PWA:
- **Service Worker**: Offline support
- **Web App Manifest**: Ana ekrana eklenebilir
- **LocalStorage**: Geçici veri saklama

### Hosting:
- **GitHub Pages**: Ücretsiz hosting
- **Custom Domain**: (opsiyonel)

## ÖZELLİKLER

### 1. Veri Giriş Ekranı
- Hızlı form (Tab navigation)
- Otomatik tarih/gün
- Gerçek zamanlı validasyon
- Keyboard shortcuts
- Otomatik hesaplama

### 2. Dashboard
- Bugünkü özet kartları
- Son 7 gün ciro trendi (Çizgi)
- Kasa performansı (Pasta)
- Kategori satışları (Bar)
- Hafta içi vs Hafta sonu (Combo)

### 3. Raporlar
- Günlük rapor
- Haftalık özet
- Aylık analiz
- Excel export
- PDF export

### 4. PWA Özellikleri
- Offline çalışma
- Ana ekrana eklenebilir
- Push notifications (opsiyonel)
- Background sync

### 5. Güvenlik
- API key encryption
- HTTPS zorunlu
- CORS politikaları
- Rate limiting

## RENK PALETİ

```css
:root {
  /* Primary */
  --primary-50: #eff6ff;
  --primary-500: #3b82f6;
  --primary-600: #2563eb;
  --primary-900: #1e3a8a;
  
  /* Success */
  --success-500: #10b981;
  
  /* Warning */
  --warning-500: #f59e0b;
  
  /* Danger */
  --danger-500: #ef4444;
  
  /* Neutral */
  --gray-50: #f9fafb;
  --gray-800: #1f2937;
  --gray-900: #111827;
}
```

## TİPOGRAFİ

- **Font Family**: Inter (Google Fonts)
- **Başlıklar**: 700 (Bold)
- **Gövde**: 400 (Regular)
- **Rakamlar**: 600 (Semibold) - Tabular nums

## RESPONSIVE BREAKPOINTS

- **Mobile**: < 640px
- **Tablet**: 640px - 1024px
- **Desktop**: > 1024px

## BROWSER DESTEĞI

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## PERFORMANS HEDEFLERİ

- Lighthouse Score: 95+
- First Contentful Paint: < 1s
- Time to Interactive: < 2s
- Bundle size: < 100KB (gzipped)
