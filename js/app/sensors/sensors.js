import { state } from '../state.js';
import { t } from '../core/i18n.js';
import { handleOrientation } from './orientation.js';
import { getGPSWatchOptions, handleGPSError, updateGPS } from './gps.js';

export { reverseGeocodeFromWeb } from './geocoding.js';
export {
  fetchWeatherData,
  getWeatherDescription,
  maybeUpdateCustomLocationFromWebFactory,
  shouldAutoUpdateCustomLocation,
  updateWeatherDisplay
} from './weather.js';

let orientationHandler = null;
let orientationAbsHandler = null;

export function stopSensors() {
  if (state.gpsWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(state.gpsWatchId);
    state.gpsWatchId = null;
  }

  if (state.orientationListenerActive) {
    if (orientationHandler) {
      window.removeEventListener('deviceorientation', orientationHandler);
      window.removeEventListener('deviceorientation', orientationHandler, true);
    }
    if (orientationAbsHandler) {
      window.removeEventListener('deviceorientationabsolute', orientationAbsHandler, true);
    }
    orientationHandler = null;
    orientationAbsHandler = null;
    state.orientationListenerActive = false;
  }
}

function attachOrientationListener(dom) {
  // iOS path: requestPermission gates DeviceOrientationEvent — we already
  // hold permission by the time startSensors runs, so attach normally.
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    orientationHandler = (e) => handleOrientation(e, dom);
    window.addEventListener('deviceorientation', orientationHandler);
    state.orientationListenerActive = true;
    return;
  }

  // Android Chrome exposes an absolute (true-north) variant — prefer it when present.
  if ('ondeviceorientationabsolute' in window) {
    orientationAbsHandler = (e) => handleOrientation(e, dom);
    window.addEventListener('deviceorientationabsolute', orientationAbsHandler, true);
  } else {
    orientationHandler = (e) => handleOrientation(e, dom);
    window.addEventListener('deviceorientation', orientationHandler, true);
  }
  state.orientationListenerActive = true;
}

export function startSensors(dom, { showStatus, maybeUpdateCustomLocationFromWeb } = {}) {
  stopSensors();

  attachOrientationListener(dom);

  if (!navigator.geolocation) {
    showStatus?.(t('gpsNotSupported'), 3000);
    if (dom?.gpsCoordsEl) dom.gpsCoordsEl.textContent = 'GPS Not Supported';
    return;
  }

  state.gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => updateGPS(pos, dom, { maybeUpdateCustomLocationFromWeb }),
    (err) => handleGPSError(err, dom, { showStatus }),
    getGPSWatchOptions()
  );
}

export async function requestPreciseLocation(dom, { showStatus, maybeUpdateCustomLocationFromWeb } = {}) {
  if (!navigator.geolocation) {
    showStatus?.(t('gpsNotSupported'), 3000);
    return false;
  }

  state.featureState.gpsPrecisionMode = true;

  const preciseFix = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 25_000
    });
  }).catch((err) => {
    handleGPSError(err, dom, { showStatus });
    return null;
  });

  if (!preciseFix) return false;

  updateGPS(preciseFix, dom, { maybeUpdateCustomLocationFromWeb });
  startSensors(dom, { showStatus, maybeUpdateCustomLocationFromWeb });
  return true;
}
