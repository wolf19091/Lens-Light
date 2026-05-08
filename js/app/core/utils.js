export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Whether the device's primary input is a touchscreen (used to skip focus moves). */
export function isTouchPrimaryInput() {
  return Boolean(
    window.matchMedia?.('(pointer: coarse)')?.matches ||
    window.matchMedia?.('(hover: none)')?.matches ||
    navigator.maxTouchPoints > 0
  );
}

export const isDebugModeEnabled = () => {
  try { return localStorage.getItem('debug_mode') === 'true'; }
  catch { return false; }
};

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function sanitizeInput(value) {
  const s = String(value ?? '').trim().slice(0, 500);
  // Escape HTML entities so the value is safe even if it is later inserted into innerHTML.
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function downloadBlob(blob, filename, { showStatus } = {}) {
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const url = URL.createObjectURL(blob);

  if (isIOS) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened && showStatus) showStatus('Popup blocked. Tap and hold to save.', 3500);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const a = document.createElement('a');
  a.download = filename;
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const PHOTOS_CHANGED_EVENT = 'lenslight:photos-changed';

export function notifyPhotosChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PHOTOS_CHANGED_EVENT));
}

export function createGoogleMapsUrl(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

export function createShortAddress(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';

  const source = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  let hash = 2166136261;

  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  let letterValue = hash % 456976; // 26^4
  let letters = '';
  for (let i = 0; i < 4; i += 1) {
    letters = String.fromCharCode(65 + (letterValue % 26)) + letters;
    letterValue = Math.floor(letterValue / 26);
  }

  const numberHash = (Math.imul(hash ^ 0x9e3779b9, 2654435761) >>> 0);
  const digits = String(numberHash % 10000).padStart(4, '0');
  return `${letters} ${digits}`;
}

export function createGoogleMapsLink(lat, lon, locationName = '') {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';

  const mapsUrl = createGoogleMapsUrl(lat, lon);
  const shortAddress = createShortAddress(lat, lon);
  const cleanLocation = String(locationName || '').trim();
  const lines = [];

  if (cleanLocation) lines.push(`Location: ${cleanLocation}`);
  if (shortAddress) lines.push(`Short address: ${shortAddress}`);
  lines.push(`Coordinates: ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
  lines.push(`Map: ${mapsUrl}`);

  return lines.join('\n');
}

export function buildPhotoShareData(photoMeta, { t } = {}) {
  const baseText = t ? t('shareText') : 'Photo from Lens Light.';
  const lat = Number(photoMeta?.lat);
  const lon = Number(photoMeta?.lon);
  const locationName = String(
    photoMeta?.location ||
    photoMeta?.customLocation ||
    photoMeta?.projectName ||
    ''
  ).trim();
  const locationBlock = createGoogleMapsLink(lat, lon, locationName);
  const url = createGoogleMapsUrl(lat, lon);

  return {
    text: locationBlock ? `${baseText}\n\n${locationBlock}` : baseText,
    url
  };
}

export async function shareBlob(blob, filename, { t, photoMeta } = {}) {
  if (!navigator.share) return false;

  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
  const { text, url } = buildPhotoShareData(photoMeta, { t });

  if (navigator.canShare && !navigator.canShare({ files: [file] })) return false;

  try {
    await navigator.share({
      files: [file],
      title: t ? t('shareTitle') : 'Survey Photo',
      text,
      url
    });
    return true;
  } catch (e) {
    if (e?.name !== 'AbortError') console.warn('shareBlob failed', e);
    return false;
  }
}
