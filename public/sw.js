// ==============================================================================
// FlexiPOS Service Worker - Stale-While-Revalidate (Cache-First + Background Update)
// ==============================================================================
const CACHE_NAME = 'flexipos-cache-v7';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/js/dexie.min.js',
  '/js/dexie-cloud-addon.min.js',
  '/js/qr-code-styling.js',
  '/js/pdf-lib.min.js',
  '/js/app.js',
  '/js/db.js',
  '/js/checkoutService.js',
  '/js/debtService.js',
  '/js/supplierService.js',
  '/js/analyticsService.js',
  '/js/backupService.js',
  '/js/pos.js',
  '/js/qr-generator.js',
  '/js/file-browser.js',
  '/js/printing.js'
];

// INSTALL: Resilient pre-caching that won't abort on single 404s
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS_TO_CACHE) {
        try {
          const res = await fetch(asset);
          if (res.ok) {
            await cache.put(asset, res);
          } else {
            console.warn(`[SW] Skipped caching (${res.status}): ${asset}`);
          }
        } catch (err) {
          console.warn(`[SW] Network error caching asset: ${asset}`, err.message);
        }
      }
    })
  );
  self.skipWaiting();
});

// ACTIVATE: Clean up outdated cache generations
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// FETCH: Stale-While-Revalidate for static assets; bypass for dynamic API & transfer/pay routes
self.addEventListener('fetch', (event) => {
  // Ignore non-GET requests and non-http(s) schemes (e.g. chrome-extension://)
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;

  const url = event.request.url;

  // Real-time API endpoints and dynamic mobile gateways bypass cache completely
  if (url.includes('/api/') || url.includes('/transfer') || url.includes('/pay')) {
    return;
  }

  // Stale-While-Revalidate strategy for static UI assets
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);

      // Trigger background network fetch to revalidate and update cache
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch((err) => {
          // Network failed, rely on cache if available
          return cachedResponse;
        });

      // Serve from cache immediately if available, else await network response
      return cachedResponse || fetchPromise;
    })
  );
});