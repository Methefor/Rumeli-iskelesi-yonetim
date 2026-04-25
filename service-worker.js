const CACHE_NAME = 'rumeli-v7';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/admin-dashboard.html',
    '/cashier-dashboard.html',
    '/entry.html',
    '/js/supabase-client.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// Install — statik varlıkları önbelleğe al ve hemen devreye gir
// skipWaiting: yeni SW eski SW'yi beklemeden hemen alır → eski bozuk önbellek anında temizlenir
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
    );
});

// Güncelleme mesajı (geriye dönük uyumluluk — artık install sırasında otomatik yapılıyor)
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Activate — eski önbellekleri temizle
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch — Network-first, önbellek yedek
self.addEventListener('fetch', (event) => {
    // Sadece GET isteklerini işle
    if (event.request.method !== 'GET') return;

    // Supabase API çağrılarını atla (her zaman network)
    if (event.request.url.includes('supabase.co')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 'basic' = aynı origin, 'cors' = CDN (supabase, chart.js vb.) — her ikisini önbellekle
                if (!response || response.status !== 200 ||
                    (response.type !== 'basic' && response.type !== 'cors')) {
                    return response;
                }
                // Başarılı yanıtı önbelleğe koy
                const toCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, toCache);
                });
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});