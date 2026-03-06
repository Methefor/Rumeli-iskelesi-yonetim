const CACHE_NAME = 'rumeli-v3';

// Statik sayfalar önbelleğe alınır (JS/CSS Vite tarafından hash'li üretilir, dinamik olarak cache'lenir)
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/admin-dashboard.html',
    '/cashier-dashboard.html',
    '/entry.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// Install — statik varlıkları önbelleğe al
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
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
                if (!response || response.status !== 200 || response.type !== 'basic') {
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