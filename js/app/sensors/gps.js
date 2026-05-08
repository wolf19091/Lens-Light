import { state } from '../state.js';
import { isDebugModeEnabled, createShortAddress } from '../core/utils.js';

const GPS_SIGNAL_WEAK_DELAY_MS = 60_000;
const ACCURACY_GOOD_M = 10;
const ACCURACY_MEDIUM_M = 30;

export function getGPSWatchOptions() {
  if (state.featureState.gpsPrecisionMode) {
    return { enableHighAccuracy: true, maximumAge: 0, timeout: 25_000 };
  }
  return {
    enableHighAccuracy: true,
    maximumAge: state.settings.batteryMode ? 5000 : 0,
    timeout: 15_000
  };
}

function classifyAccuracy(accuracyMeters) {
  if (accuracyMeters < ACCURACY_GOOD_M) return { cls: 'accuracy-good', label: 'Excellent' };
  if (accuracyMeters < ACCURACY_MEDIUM_M) return { cls: 'accuracy-medium', label: 'Good' };
  return { cls: 'accuracy-poor', label: 'Poor' };
}

function updateAccuracyDisplay(accuracyMeters, dom) {
  if (!dom?.gpsAccuracyEl) return;
  const { cls, label } = classifyAccuracy(accuracyMeters);
  dom.gpsAccuracyEl.className = `data-line small-text ${cls}`;
  dom.gpsAccuracyEl.textContent = `Accuracy: ${Math.round(accuracyMeters)}m (${label})`;
}

function formatAltitudeLocal(altMeters) {
  const isImperial = state.settings.units === 'imperial';
  if (!altMeters || !Number.isFinite(altMeters)) return isImperial ? '-- ft' : '-- m';
  return isImperial ? `${Math.round(altMeters * 3.28084)} ft` : `${Math.round(altMeters)} m`;
}

function getEnglishLocationLabel(value) {
  const label = String(value || '').trim();
  if (!label) return 'Unknown';
  // Reject Arabic codepoints and mojibake from latin-1 decoding of UTF-8.
  if (/[؀-ۿ]|[ØÙ]/.test(label)) return 'Unknown';
  return label;
}

function logGpsDebug(position) {
  if (!isDebugModeEnabled()) return;
  console.log('📍 GPS update:', {
    lat: state.currentLat.toFixed(6),
    lon: state.currentLon.toFixed(6),
    accuracy: Math.round(state.currentAccuracy) + 'm',
    altitude: Math.round(state.currentAlt) + 'm',
    heading: position.coords.heading ?? 'N/A',
    speed: position.coords.speed ?? 'N/A',
    timestamp: new Date(position.timestamp).toISOString()
  });
}

export function updateGPS(position, dom, { maybeUpdateCustomLocationFromWeb } = {}) {
  state.gpsLastUpdateTime = Date.now();
  state.gpsHasEverWorked = true;

  state.currentLat = position.coords.latitude;
  state.currentLon = position.coords.longitude;
  state.currentAlt = position.coords.altitude || 0;
  state.currentAccuracy = position.coords.accuracy || 0;
  state.currentShortAddress = createShortAddress(state.currentLat, state.currentLon);

  logGpsDebug(position);

  if (dom?.gpsCoordsEl) {
    const shortSuffix = state.currentShortAddress ? ` | Short: ${state.currentShortAddress}` : '';
    dom.gpsCoordsEl.textContent = `${state.currentLat.toFixed(6)}, ${state.currentLon.toFixed(6)}${shortSuffix}`;
  }
  if (dom?.altitudeEl) dom.altitudeEl.textContent = `Alt: ${formatAltitudeLocal(state.currentAlt)}`;
  if (dom?.locationNameEl) {
    const location = getEnglishLocationLabel(state.settings.customLocation);
    const shortPart = state.currentShortAddress ? ` | Short: ${state.currentShortAddress}` : '';
    dom.locationNameEl.textContent = `Location: ${location}${shortPart}`;
  }

  updateAccuracyDisplay(state.currentAccuracy, dom);
  maybeUpdateCustomLocationFromWeb?.(state.currentLat, state.currentLon);
}

const GPS_ERROR_HANDLERS = {
  1: (error, dom) => {
    console.error('GPS permission denied by user');
    if (dom?.gpsCoordsEl) dom.gpsCoordsEl.textContent = 'Permission Denied';
    return { message: 'GPS Error: Permission denied', duration: 5000, surface: true };
  },
  2: (error, dom) => {
    console.warn('GPS position unavailable');
    if (!state.gpsHasEverWorked && dom?.gpsCoordsEl) dom.gpsCoordsEl.textContent = 'GPS Unavailable';
    return { message: 'GPS Error: Position unavailable - check device settings', duration: 3000, surface: true };
  },
  3: (error, dom) => {
    console.warn('GPS timeout - weak signal');
    if (!state.gpsHasEverWorked && Date.now() - state.gpsLastUpdateTime > GPS_SIGNAL_WEAK_DELAY_MS && dom?.gpsCoordsEl) {
      dom.gpsCoordsEl.textContent = 'GPS Signal Weak';
    }
    return { message: 'GPS Error: Timeout - trying again...', duration: 3000, surface: state.gpsHasEverWorked === false };
  }
};

export function handleGPSError(error, dom, { showStatus } = {}) {
  const code = Number(error?.code);
  const handler = GPS_ERROR_HANDLERS[code];

  if (handler) {
    const { message, duration, surface } = handler(error, dom);
    if (surface) showStatus?.('❌ ' + message, duration);
    return;
  }

  console.error('GPS error:', error);
  showStatus?.('❌ GPS Error: Unknown error (' + (code || 'n/a') + ')', 3000);
}

export { getEnglishLocationLabel };
