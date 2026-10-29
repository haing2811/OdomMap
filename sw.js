const CACHE_NAME = 'odommap-v8';
const FIELD_IMAGE_CACHE = 'odommap-field-images';

// Critical assets: all must cache, or the whole install fails (intentional -
// a missing critical file means the offline shell is incomplete).
const CRITICAL_URLS = [
    './',
    './index.html',
    './OdomMap.html',
    './manifest.json',
    './css/app.css',
    './js/app.js',
    './js/config.js',
    './js/math.js',
    './js/storage.js',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
];

// Non-critical assets: cached individually with a catch so one 404 cannot
// fail the whole install. Failures are logged with console.warn.
const NON_CRITICAL_URLS = [
    './assets/fonts/geist/geist-latin-wght-normal.woff2',
    './assets/fonts/geist/geist-latin-wght-italic.woff2',
    './assets/fonts/geist-mono/geist-mono-latin-wght-normal.woff2',
    './assets/fonts/geist-mono/geist-mono-latin-wght-italic.woff2',
];

// Install - precache the shell. Critical files use addAll (all-or-nothing);
// non-critical fonts are added best-effort with per-URL error logging.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(CRITICAL_URLS).then(() => {
                return Promise.all(NON_CRITICAL_URLS.map((url) =>
                    cache.add(url).catch((err) => {
                        console.warn('[OdomMap SW] install: failed to cache', url, err);
                    })
                ));
            }).then(() => self.skipWaiting());
        })
    );
});

// Activate - clean up old caches and take control of uncontrolled clients.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(cacheNames.map((cacheName) => {
                if (cacheName !== CACHE_NAME && cacheName !== FIELD_IMAGE_CACHE) {
                    return caches.delete(cacheName);
                }
            }));
        }).then(() => self.clients.claim())
    );
})

// Fetch: HTML/navigations = network-first with cache fallback (fresh after a deploy).
// CSS/JS = stale-while-revalidate (serve cache, update in background).
// Everything else (fonts, icons, field images) = cache-first.
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const destination = event.request.destination;
    const isHtml = event.request.mode === 'navigate' || destination === 'document' || url.pathname.endsWith('.html');

    if (isHtml) {
        event.respondWith(
            fetch(event.request).then((response) => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // CSS / JS: stale-while-revalidate so a deploy is picked up on the next load.
    const isStyleOrScript = destination === 'style' || destination === 'script' ||
        url.pathname.endsWith('.css') || url.pathname.endsWith('.js');
    if (isStyleOrScript) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                const fetched = fetch(event.request).then((response) => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                });
                return cached || fetched;
            })
        );
        return;
    }

    // Cache-first for fonts, icons and field images.
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                // Cache field images in a separate cache so they persist offline.
                if (url.pathname.startsWith('/GameField/') || url.pathname.includes('/GameField/')) {
                    const clone = response.clone();
                    caches.open(FIELD_IMAGE_CACHE).then((cache) => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});
