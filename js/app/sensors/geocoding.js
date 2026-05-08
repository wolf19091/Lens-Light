import { state } from '../state.js';
import { isDebugModeEnabled } from '../core/utils.js';
import { getEnglishLocationLabel } from './gps.js';

const GEOCODE_TIMEOUT_MS = 10_000;
const GEOCODE_CACHE_LIMIT = 50;
const BIGDATACLOUD_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';

function getCacheKey(lat, lon) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function readCache(cacheKey) {
  const cached = state.geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < state.CACHE_EXPIRY) return cached.label;
  return undefined;
}

function writeCache(cacheKey, label) {
  state.geocodeCache.set(cacheKey, { label, timestamp: Date.now() });
  if (state.geocodeCache.size > GEOCODE_CACHE_LIMIT) {
    state.geocodeCache.delete(state.geocodeCache.keys().next().value);
  }
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function joinAddressParts({ city, region, country }) {
  const parts = [];
  if (city) parts.push(city);
  if (region && region !== city && !String(city).includes(region)) parts.push(region);
  if (country && parts.length < 2) parts.push(country);

  const rawLabel = parts.filter(Boolean).join(', ');
  if (!rawLabel) return '';
  const englishLabel = getEnglishLocationLabel(rawLabel);
  return englishLabel === 'Unknown' ? '' : englishLabel;
}

async function reverseGeocodeWithBigDataCloud(lat, lon) {
  const url = `${BIGDATACLOUD_URL}?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
  const res = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } });

  if (!res.ok) {
    if (res.status === 429) {
      console.warn('⚠️ Geocoding rate limited');
      return '';
    }
    throw new Error(`Reverse geocode failed: ${res.status}`);
  }

  const data = await res.json();
  if (isDebugModeEnabled()) console.log('🗺️ Geocoding result (BDC):', data);

  return joinAddressParts({
    city: data.city || data.locality,
    region: data.principalSubdivision,
    country: data.countryName
  });
}

async function reverseGeocodeWithNominatim(lat, lon) {
  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1&accept-language=en`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { Accept: 'application/json', 'Accept-Language': 'en' }
  });

  if (!res.ok) throw new Error(`Nominatim reverse geocode failed: ${res.status}`);
  const data = await res.json();
  const addr = data?.address || {};

  return joinAddressParts({
    city: addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || '',
    region: addr.state || addr.county || addr.region || '',
    country: addr.country || ''
  });
}

/**
 * Reverse-geocodes (lat, lon) into a short city/region/country label. Tries
 * BigDataCloud (no API key, designed for client-side use) first, then
 * Nominatim (OSM) as a structural fallback. Cached by 3-decimal grid cell.
 */
export async function reverseGeocodeFromWeb(lat, lon) {
  const cacheKey = getCacheKey(lat, lon);
  const cached = readCache(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const label = await reverseGeocodeWithBigDataCloud(lat, lon);
    writeCache(cacheKey, label);
    return label;
  } catch (e) {
    if (e?.name !== 'AbortError') console.warn('reverseGeocodeFromWeb failed, trying fallback', e);
    try {
      const fallbackLabel = await reverseGeocodeWithNominatim(lat, lon);
      if (fallbackLabel) writeCache(cacheKey, fallbackLabel);
      return fallbackLabel;
    } catch (fallbackError) {
      if (fallbackError?.name !== 'AbortError') console.warn('reverseGeocode fallback failed', fallbackError);
      return '';
    }
  }
}
