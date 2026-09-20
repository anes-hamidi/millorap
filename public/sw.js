// FlexiPOS Service Worker - Resilient Network-First Strategy
const CACHE_NAME = 'flexipos-cache-v6';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/js/dexie.min.js',
  '/js/qr-code-styling.js',
  '/js/pdf-lib.min.js',
  '/js/app.js',
  '/js/db.js',
  '/js/checkoutService.js',
  '/js/debtService.js',
  '/js/analyticsService.js',
  '/js/backupService.js',
  '/js/pos.js',
  '/js/qr-generator.js',
  '/js/file-browser.js',
  '/js/printing.js'
];

// INSTALL: Resilient caching that won't fail the whole SW on 404s
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Load assets individually to prevent one 404 from aborting installation
      for (const asset of ASSETS_TO_CACHE) {
        try {
          const res = await fetch(asset);
          if (res.ok) {
            await cache.put(asset, res);
          } else {
            console.warn(`[SW] Pre-cache skipped missing asset (${res.status}): ${asset}`);
          }
        } catch (err) {
          console.warn(`[SW] Network error caching asset: ${asset}`, err.message);
        }
      }
    })
  );
  self.skipWaiting();
});

// ACTIVATE: Clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// FETCH: Network-First with Fallback
self.addEventListener('fetch', (event) => {
  // Ignore non-GET requests (POST, PUT, DELETE)
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Let API endpoints and real-time routes bypass the cache
  if (url.includes('/api/') || url.includes('/transfer') || url.includes('/pay')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache valid 200 responses
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fall back to cache if offline
        return caches.match(event.request);
      })
  );
});