// Service workers can be loaded as classic scripts in some browsers/cached registrations.
// Keep these constants local to avoid ESM import parsing failures.
// NOTE: keep APP_VERSION in sync with js/version.js (single source of truth at build time).
const APP_VERSION = '7.2.0';
const CACHE_PREFIX = 'lenslight';
const CACHE_NAME = `${CACHE_PREFIX}-v${APP_VERSION}`;

console.log(`🔧 Service Worker v${APP_VERSION} initializing...`);

// Keep this list limited to files that actually exist in the deployed folder.
// index.html is cached as an offline shell, but fetch still uses network-first
// so online updates remain fresh.
const ASSETS = [
  './index.html',
  './manifest.json',
  './logo-max-ar-inv.svg',
  './css/style.css',
  './js/version.js',
  './js/main.js',
  './js/vendor/jsQR.min.js',
  './js/app/state.js',
  './js/app/dom.js',
  './js/app/core/utils.js',
  './js/app/core/status.js',
  './js/app/core/i18n.js',
  './js/app/core/settings.js',
  './js/app/storage/photoDb.js',
  './js/app/gallery/gallery.js',
  './js/app/gallery/render.js',
  './js/app/gallery/viewer.js',
  './js/app/gallery/bulk-actions.js',
  './js/app/camera/camera.js',
  './js/app/camera/capture.js',
  './js/app/camera/audio.js',
  './js/app/camera/overlays/canvas-utils.js',
  './js/app/camera/overlays/format.js',
  './js/app/camera/overlays/report.js',
  './js/app/camera/overlays/compass.js',
  './js/app/sensors/sensors.js',
  './js/app/sensors/orientation.js',
  './js/app/sensors/gps.js',
  './js/app/sensors/geocoding.js',
  './js/app/sensors/weather.js',
  './js/app/pwa/pwa.js',
  './js/app/ui/viewport.js',
  './js/app/ui/features.js',
  './js/app/ui/wakelock.js',
  './js/app/wiring/diagnostics.js',
  './js/app/wiring/projects.js',
  './js/app/wiring/permissions.js',
  './js/app/wiring/menus.js',
  './js/app/wiring/capture-wiring.js',
  './js/app/wiring/gallery-wiring.js',
  './js/app/wiring/lifecycle.js',
  './js/app/features/comparison.js',
  './js/app/features/focus.js',
  './js/app/features/hdr.js',
  './js/app/features/metadata.js',
  './js/app/features/metadata/format.js',
  './js/app/features/metadata/source.js',
  './js/app/features/metadata/prep-state.js',
  './js/app/features/metadata/pdf-export.js',
  './js/app/features/metadata/excel-export.js',
  './js/app/features/metadata/xlsx-builder.js',
  './js/app/features/metadata/logo.js',
  './js/app/features/qrscanner.js',
  './js/app/features/whitebalance.js'
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
            // Only remove Lens Light caches from previous versions.
            // Leave unrelated same-origin caches untouched.
            if (cache.startsWith(`${CACHE_PREFIX}-`) && cache !== CACHE_NAME) {
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
  
  // HTML navigation stays network-first for fresh updates, but we keep an
  // offline shell in cache so reload works after a successful online load.
  const isHtml = url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('.html');
  
  if (isHtml) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (
            response &&
            response.status === 200 &&
            event.request.method === 'GET' &&
            (url.protocol === 'http:' || url.protocol === 'https:') &&
            url.origin === self.location.origin
          ) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('./index.html', responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline fallback: serve cached navigation first, then app shell.
          return caches.match(event.request).then((cachedNavigation) => {
            if (cachedNavigation) return cachedNavigation;

            return caches.match('./index.html').then((cachedShell) => {
              return cachedShell || new Response('<h1>Offline</h1><p>Please check your connection.</p>', {
                headers: { 'Content-Type': 'text/html' }
              });
            });
          });
        })
    );
    return;
  }
  
  // jsQR is vendored locally now, but jspdf and exceljs are still lazy-loaded
  // from cdn.jsdelivr.net on demand for the export feature. Cache them on the
  // first successful fetch so subsequent offline exports keep working.
  const isCDN = url.origin === 'https://cdn.jsdelivr.net';

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
      }).catch(() => caches.match(event.request))
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
