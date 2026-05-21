import { state } from '../state.js';
import { isDebugModeEnabled } from '../core/utils.js';
import { getEnglishLocationLabel } from './gps.js';

const GEOCODE_TIMEOUT_MS = 10_000;
const GEOCODE_CACHE_LIMIT = 50;
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

// Max location components to include before the country (e.g. town, governorate, region).
const MAX_ADDRESS_PARTS = 3;

// Nominatim `address` keys from most specific to least, walked in order to
// build the label. Street-level keys (road, house_number, postcode, ...) are
// intentionally excluded.
const ADDRESS_FIELD_ORDER = [
  'neighbourhood', 'suburb', 'quarter', 'residential',
  'hamlet', 'isolated_dwelling', 'croft',
  'village', 'town', 'city',
  'municipality',
  'city_district', 'district', 'borough',
  'county',
  'state_district',
  'state', 'province', 'region'
];

/**
 * Builds a "Place, District, Region, Country" label from a Nominatim `address`
 * object. Drops empty/Arabic/mojibake values and skips any part already implied
 * by a kept one (e.g. "Riyadh" vs "Riyadh Region").
 */
function buildAddressLabel(addr) {
  const kept = [];
  for (const field of ADDRESS_FIELD_ORDER) {
    const value = getEnglishLocationLabel(addr[field]);
    if (value === 'Unknown') continue;
    if (kept.some(p => p.includes(value) || value.includes(p))) continue;
    kept.push(value);
    if (kept.length >= MAX_ADDRESS_PARTS) break;
  }

  const countryLabel = getEnglishLocationLabel(addr.country);
  if (countryLabel !== 'Unknown' && !kept.some(p => p.includes(countryLabel))) {
    kept.push(countryLabel);
  }

  return kept.join(', ');
}

async function reverseGeocodeWithNominatim(lat, lon) {
  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1&accept-language=en`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { Accept: 'application/json', 'Accept-Language': 'en' }
  });

  if (!res.ok) throw new Error(`Nominatim reverse geocode failed: ${res.status}`);
  const data = await res.json();
  if (isDebugModeEnabled()) console.log('🗺️ Geocoding result (Nominatim):', data);

  return buildAddressLabel(data?.address || {});
}

/**
 * Reverse-geocodes (lat, lon) into a short city/region/country label using
 * Nominatim (OSM). Cached by 3-decimal grid cell.
 */
export async function reverseGeocodeFromWeb(lat, lon) {
  const cacheKey = getCacheKey(lat, lon);
  const cached = readCache(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const label = await reverseGeocodeWithNominatim(lat, lon);
    writeCache(cacheKey, label);
    return label;
  } catch (e) {
    if (e?.name !== 'AbortError') console.warn('reverseGeocodeFromWeb failed', e);
    return '';
  }
}
