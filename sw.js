// Import version for cache naming
import { CACHE_NAME, APP_VERSION } from './js/version.js';

console.log(`🔧 Service Worker v${APP_VERSION} initializing...`);

// Keep this list limited to files that actually exist in the deployed folder.
// NOTE: index.html is intentionally EXCLUDED - it's served network-first without caching
const ASSETS = [
  './manifest.json',
  './sec-lens-logo.png',
  './css/style.css',
  './js/version.js',
  './js/main.js',
  './js/script.js',
  './js/app/state.js',
  './js/app/dom.js',
  './js/app/core/utils.js',
  './js/app/core/status.js',
  './js/app/core/i18n.js',
  './js/app/core/settings.js',
  './js/app/storage/photoDb.js',
  './js/app/gallery/gallery.js',
  './js/app/camera/camera.js',
  './js/app/sensors/sensors.js',
  './js/app/pwa/pwa.js',
  './js/app/ui/viewport.js',
  './js/app/ui/features.js',
  './js/app/ui/wakelock.js'
];

// Install: Cache core assets immediately
self.addEventListener('install', (event) => {
  // Force this service worker to become the active one, bypassing the "waiting" state
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // cache.addAll() fails the whole install if any single request fails.
      // Cache assets one-by-one so missing files don't break the SW.
      await Promise.allSettled(ASSETS.map((url) => cache.add(url)));
    })
  );
});

// Activate: Clean up old caches and take control of clients
self.addEventListener('activate', (event) => {
  console.log(`🔧 Service Worker v${APP_VERSION} activating...`);
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              console.log('🗑️ Deleting old cache:', cache);
              return caches.delete(cache);
            }
          })
        );
      }),
      // Take control of all pages immediately
      self.clients.claim()
    ]).then(() => {
      console.log(`✅ Service Worker v${APP_VERSION} activated`);
      
      // Force reload all controlled clients to use new version
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          console.log('🔄 Reloading client:', client.url);
          client.postMessage({ type: 'SW_UPDATED', version: APP_VERSION });
        });
      });
    })
  );
});

// Fetch: Network First, then Cache (Stale-While-Revalidate logic for offline support)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // CRITICAL: Never cache index.html to prevent stale version lock-in
  // Always serve fresh HTML so updates work properly
  const isHtml = url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('.html');
  
  if (isHtml) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Offline fallback: serve a minimal HTML shell if we have it cached
          // This ensures the app works offline but updates properly when online
          return caches.match('./index.html').then(cached => {
            return cached || new Response('<h1>Offline</h1><p>Please check your connection.</p>', {
              headers: { 'Content-Type': 'text/html' }
            });
          });
        })
    );
    return;
  }
  
  // Cache CDN libraries (unpkg.com for jsQR) for offline use
  const isCDN = url.origin.includes('unpkg.com') || url.origin.includes('cdn.jsdelivr.net');
  
  if (isCDN) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        });
      }).catch(() => {
        // Offline: return cached version if available
        return caches.match(event.request);
      })
    );
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If the response is valid, clone it and update the cache
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Only cache same-origin, GET, HTTP(S) requests.
        // This avoids Cache.put() errors for unsupported schemes (e.g. chrome-extension://)
        // and prevents caching third-party resources.
        if (
          event.request.method !== 'GET' ||
          (url.protocol !== 'http:' && url.protocol !== 'https:') ||
          url.origin !== self.location.origin
        ) {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // If network fails (offline), try to serve from cache
        return caches.match(event.request);
      })
  );
});
