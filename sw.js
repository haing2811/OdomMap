const CACHE_NAME = 'odommap-v6';
const urlsToCache = [
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
	'./assets/fonts/geist/geist-latin-wght-normal.woff2',
	'./assets/fonts/geist/geist-latin-wght-italic.woff2',
	'./assets/fonts/geist-mono/geist-mono-latin-wght-normal.woff2',
	'./assets/fonts/geist-mono/geist-mono-latin-wght-italic.woff2'
];

// Field images are large and loaded on demand; cache them at runtime (cache-first).
const FIELD_IMAGE_CACHE = 'odommap-field-images';

// Install
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)).then(() => self.skipWaiting())
	);
});

// Activate - clean up old caches
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
});

// Fetch: network-first for HTML, cache-first for assets, cache-first for field images.
self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	const isHtml = event.request.destination === '' || url.pathname.endsWith('.html');

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

	// Cache-first for everything else (css, js, fonts, icons, images)
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
