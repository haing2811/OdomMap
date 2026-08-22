<<<<<<< HEAD
const CACHE_NAME = 'odommap-v1';
=======
const CACHE_NAME = 'odommap-v3';
>>>>>>> 776db71480c6f51bca0b9f98a2076e4a2fd8ba24
const urlsToCache = [
    './',
    './OdomMap.html',
    './manifest.json'
];

<<<<<<< HEAD
=======
// Install event - cache resources
>>>>>>> 776db71480c6f51bca0b9f98a2076e4a2fd8ba24
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
<<<<<<< HEAD
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) return response;
                return fetch(event.request);
            })
    );
});
=======
            .then(() => self.skipWaiting()) // Activate immediately
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete caches that don't match current version
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of all clients immediately
    );
});

// Fetch event - network first for HTML, cache first for assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Network-first strategy for HTML pages (always check for updates)
    if (event.request.destination === '' || url.pathname.endsWith('.html')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Cache the fresh response
                    if (response && response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Fall back to cache if network fails
                    return caches.match(event.request);
                })
        );
    } else {
        // Cache-first strategy for other assets
        event.respondWith(
            caches.match(event.request)
                .then((response) => {
                    if (response) return response;
                    return fetch(event.request);
                })
        );
    }
});
>>>>>>> 776db71480c6f51bca0b9f98a2076e4a2fd8ba24
