import { state } from '../state.js';
import { hasGpsCoordinates } from '../core/utils.js';
import { dbGetPhoto } from '../storage/photoDb.js';
import { getGalleryPhotos, getActiveProjectName } from '../gallery/render.js';

/**
 * Map view of geotagged photos.
 *
 * Plots the current gallery scope (all photos, or the open project's photos)
 * on an OpenStreetMap base layer, connected chronologically by a dashed
 * walk-path line. Leaflet is lazy-loaded from the CDN on first open — the
 * service worker caches both the library and the map tiles, so previously
 * visited areas keep working offline.
 */

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_JS = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.min.js`;
const LEAFLET_CSS = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.min.css`;
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const TILE_MAX_ZOOM = 19;
const FIT_BOUNDS_PADDING = 40;
const SINGLE_PHOTO_ZOOM = 17;
// Leaflet needs invalidateSize() once the sheet's 350ms slide-in finishes,
// otherwise it sizes the map against the half-open container.
const SHEET_TRANSITION_MS = 380;

const TR = (en, ar) => (state.currentLang === 'ar' ? ar : en);

let leafletPromise = null;
let map = null;
let markerLayer = null;
let popupUrls = [];

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    const fail = (what) => {
      leafletPromise = null;
      reject(new Error(`Failed to load ${what}`));
    };

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    // CORS mode (instead of no-cors) so the SW sees a non-opaque response it
    // can safely cache for offline use.
    link.crossOrigin = 'anonymous';
    link.onerror = () => fail('Leaflet CSS');
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => (window.L ? resolve(window.L) : fail('Leaflet (global missing)'));
    script.onerror = () => fail('Leaflet JS');
    document.head.appendChild(script);
  });

  return leafletPromise;
}

function revokePopupUrls() {
  for (const url of popupUrls) {
    try { URL.revokeObjectURL(url); } catch {}
  }
  popupUrls = [];
}

function buildPopupContent(photo, dom, { showStatus }) {
  const wrap = document.createElement('div');
  wrap.className = 'map-popup';

  const img = document.createElement('img');
  img.alt = 'Survey photo';
  img.className = 'map-popup-img';
  // Reuse the gallery's object URL when the thumbnail is already loaded;
  // otherwise pull the blob once and revoke on map close.
  if (state.photoObjectUrls.has(photo.id)) {
    img.src = state.photoObjectUrls.get(photo.id);
  } else {
    dbGetPhoto(photo.id).then((record) => {
      if (!record?.blob) return;
      const url = URL.createObjectURL(record.blob);
      popupUrls.push(url);
      img.src = url;
    }).catch(() => {});
  }

  const caption = document.createElement('div');
  caption.className = 'map-popup-caption';
  const when = new Date(photo.timestamp);
  caption.textContent = photo.projectName
    ? `${photo.projectName} — ${when.toLocaleString()}`
    : when.toLocaleString();

  const coords = document.createElement('div');
  coords.className = 'map-popup-coords';
  coords.textContent = `${Number(photo.lat).toFixed(6)}, ${Number(photo.lon).toFixed(6)}`;

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'action-btn map-popup-open';
  openBtn.textContent = TR('🖼️ Open Photo', '🖼️ افتح الصورة');
  openBtn.addEventListener('click', async () => {
    const { openPhotoViewer } = await import('../gallery/viewer.js');
    openPhotoViewer(photo.id, dom, { showStatus });
  });

  wrap.appendChild(img);
  wrap.appendChild(caption);
  wrap.appendChild(coords);
  wrap.appendChild(openBtn);
  return wrap;
}

function plotPhotos(L, photos, dom, env) {
  if (markerLayer) {
    markerLayer.remove();
    markerLayer = null;
  }
  markerLayer = L.layerGroup().addTo(map);

  const chronological = photos.slice().sort((a, b) => a.id - b.id);
  const points = [];

  for (const photo of chronological) {
    const latLng = [Number(photo.lat), Number(photo.lon)];
    points.push(latLng);

    const marker = L.circleMarker(latLng, {
      radius: 9,
      color: '#ffffff',
      weight: 2,
      fillColor: '#0066cc',
      fillOpacity: 0.9
    });
    marker.bindPopup(() => buildPopupContent(photo, dom, env), { minWidth: 180 });
    marker.addTo(markerLayer);
  }

  // Dashed walk path connecting captures in shooting order.
  if (points.length > 1) {
    L.polyline(points, {
      color: '#0066cc',
      weight: 2,
      opacity: 0.55,
      dashArray: '6 6'
    }).addTo(markerLayer);
  }

  if (points.length === 1) map.setView(points[0], SINGLE_PHOTO_ZOOM);
  else map.fitBounds(L.latLngBounds(points), { padding: [FIT_BOUNDS_PADDING, FIT_BOUNDS_PADDING] });
}

function ensureMap(L, dom) {
  if (map) return;
  map = L.map(dom.mapContainer, { zoomControl: true });
  L.tileLayer(TILE_URL, {
    maxZoom: TILE_MAX_ZOOM,
    attribution: TILE_ATTRIBUTION
  }).addTo(map);
}

function closeMapView(dom) {
  dom.mapModal?.classList.remove('open');
  dom.mapModal?.setAttribute('aria-hidden', 'true');
  map?.closePopup();
  revokePopupUrls();
}

async function openMapView(dom, env) {
  const { showStatus } = env;
  const photos = getGalleryPhotos().filter((photo) => hasGpsCoordinates(photo.lat, photo.lon));

  if (photos.length === 0) {
    showStatus?.(TR('⚠️ No geotagged photos to show on the map', '⚠️ لا توجد صور بإحداثيات لعرضها على الخريطة'), 3000);
    return;
  }

  if (dom.mapPhotoCountEl) dom.mapPhotoCountEl.textContent = String(photos.length);
  if (dom.mapTitleText) {
    const activeProject = getActiveProjectName();
    dom.mapTitleText.textContent = activeProject
      ? `🗺️ ${activeProject}`
      : TR('🗺️ Photo Map', '🗺️ خريطة الصور');
  }

  dom.mapModal?.classList.add('open');
  dom.mapModal?.setAttribute('aria-hidden', 'false');

  let L;
  try {
    L = await loadLeaflet();
  } catch (err) {
    console.error('Leaflet load failed:', err);
    closeMapView(dom);
    showStatus?.(TR('❌ Map library unavailable — check your connection', '❌ مكتبة الخريطة غير متاحة — تحقق من الاتصال'), 3500);
    return;
  }

  ensureMap(L, dom);
  plotPhotos(L, photos, dom, env);
  setTimeout(() => {
    map?.invalidateSize();
    // Re-fit after the container reaches its real size.
    if (photos.length > 1) {
      map?.fitBounds(
        L.latLngBounds(photos.map((p) => [Number(p.lat), Number(p.lon)])),
        { padding: [FIT_BOUNDS_PADDING, FIT_BOUNDS_PADDING] }
      );
    }
  }, SHEET_TRANSITION_MS);
}

export function initMapView(dom, env = {}) {
  if (!dom?.mapViewBtn || !dom?.mapModal || !dom?.mapContainer) {
    console.warn('Map view elements missing');
    return;
  }

  dom.mapViewBtn.addEventListener('click', () => {
    openMapView(dom, env).catch((err) => {
      console.error('openMapView failed:', err);
      env.showStatus?.('❌ ' + (err?.message || 'Map failed'), 3000);
    });
  });

  dom.closeMapBtn?.addEventListener('click', () => closeMapView(dom));
}
