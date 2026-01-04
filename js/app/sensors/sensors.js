import { state } from '../state.js';
import { t } from '../core/i18n.js';
import { saveSettings } from '../core/settings.js';

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

export function startSensors(dom, { showStatus, maybeUpdateCustomLocationFromWeb } = {}) {
  stopSensors();

  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    orientationHandler = (e) => handleOrientation(e, dom);
    window.addEventListener('deviceorientation', orientationHandler);
    state.orientationListenerActive = true;
  } else {
    if ('ondeviceorientationabsolute' in window) {
      orientationAbsHandler = (e) => handleOrientation(e, dom);
      window.addEventListener('deviceorientationabsolute', orientationAbsHandler, true);
    } else {
      orientationHandler = (e) => handleOrientation(e, dom);
      window.addEventListener('deviceorientation', orientationHandler, true);
    }
    state.orientationListenerActive = true;
  }

  if (!navigator.geolocation) {
    showStatus?.(t('gpsNotSupported'), 3000);
    if (dom?.gpsCoordsEl) dom.gpsCoordsEl.textContent = 'GPS Not Supported';
    return;
  }

  state.gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => updateGPS(pos, dom, { maybeUpdateCustomLocationFromWeb }),
    (err) => handleGPSError(err, dom, { showStatus }),
    {
      enableHighAccuracy: true,
      maximumAge: state.settings.batteryMode ? 5000 : 0,
      timeout: 15000
    }
  );
}

function getCardinalDirection(heading) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(heading / 45) % 8;
  return directions[index];
}

function handleOrientation(event, dom) {
  let heading = null;

  if (event.webkitCompassHeading) {
    heading = event.webkitCompassHeading;
  } else if (event.alpha !== null && event.alpha !== undefined) {
    heading = 360 - event.alpha;
  }

  if (heading === null) return;
  if (heading < 0) heading += 360;
  if (heading >= 360) heading -= 360;

  let diff = heading - state.smoothedHeading;
  while (diff < -180) diff += 360;
  while (diff > 180) diff -= 360;
  state.smoothedHeading += diff * 0.15;
  if (state.smoothedHeading < 0) state.smoothedHeading += 360;
  if (state.smoothedHeading >= 360) state.smoothedHeading -= 360;

  state.currentHeading = state.smoothedHeading;

  const now = performance.now();
  if (!handleOrientation.lastUpdate || now - handleOrientation.lastUpdate > 100) {
    handleOrientation.lastUpdate = now;

    if (dom?.compassArrow) dom.compassArrow.style.transform = `rotate(${-state.currentHeading}deg)`;
    if (dom?.headingTextEl) {
      dom.headingTextEl.textContent = `Heading: ${Math.round(state.currentHeading)}° ${getCardinalDirection(state.currentHeading)}`;
    }
  }

  if (state.featureState.levelEnabled && event.gamma !== null && event.gamma !== undefined) {
    if (handleOrientation.lastLevelUpdate && now - handleOrientation.lastLevelUpdate <= 50) return;
    handleOrientation.lastLevelUpdate = now;

    const gamma = event.gamma;
    const levelLine = dom?.levelIndicator?.querySelector('.level-line');
    if (!levelLine) return;

    levelLine.style.transform = `rotate(${gamma}deg)`;
    if (Math.abs(gamma) < 1) {
      dom?.levelIndicator?.classList.add('level');
      if (navigator.vibrate && !dom.levelIndicator?.dataset.wasLevel) {
        try {
          navigator.vibrate(10);
        } catch {}
        dom.levelIndicator.dataset.wasLevel = 'true';
      }
    } else {
      dom?.levelIndicator?.classList.remove('level');
      if (dom?.levelIndicator?.dataset) delete dom.levelIndicator.dataset.wasLevel;
    }
  }
}

function updateAccuracyDisplay(accuracyMeters, dom) {
  if (!dom?.gpsAccuracyEl) return;

  let cls = 'accuracy-poor';
  let label = state.currentLang === 'ar' ? 'ضعيف' : 'Poor';

  if (accuracyMeters < 10) {
    cls = 'accuracy-good';
    label = state.currentLang === 'ar' ? 'ممتاز' : 'Excellent';
  } else if (accuracyMeters < 30) {
    cls = 'accuracy-medium';
    label = state.currentLang === 'ar' ? 'جيد' : 'Good';
  }

  dom.gpsAccuracyEl.className = `data-line small-text ${cls}`;
  dom.gpsAccuracyEl.textContent = `Accuracy: ${Math.round(accuracyMeters)}m (${label})`;
}

function formatAltitudeLocal(altMeters) {
  if (!altMeters || !Number.isFinite(altMeters)) return state.settings.units === 'imperial' ? '-- ft' : '-- m';
  if (state.settings.units === 'imperial') return `${Math.round(altMeters * 3.28084)} ft`;
  return `${Math.round(altMeters)} m`;
}

function updateGPS(position, dom, { maybeUpdateCustomLocationFromWeb } = {}) {
  state.gpsLastUpdateTime = Date.now();
  state.gpsHasEverWorked = true;

  state.currentLat = position.coords.latitude;
  state.currentLon = position.coords.longitude;
  state.currentAlt = position.coords.altitude || 0;
  state.currentAccuracy = position.coords.accuracy || 0;

  if (dom?.gpsCoordsEl) dom.gpsCoordsEl.textContent = `${state.currentLat.toFixed(6)}, ${state.currentLon.toFixed(6)}`;
  if (dom?.altitudeEl) dom.altitudeEl.textContent = `Alt: ${formatAltitudeLocal(state.currentAlt)}`;

  updateAccuracyDisplay(state.currentAccuracy, dom);

  maybeUpdateCustomLocationFromWeb?.(state.currentLat, state.currentLon);
}

function handleGPSError(error, dom, { showStatus } = {}) {
  const code = Number(error?.code);
  let message = 'GPS Error: ';
  let duration = 3000;

  switch (code) {
    case 1:
      message += 'Permission denied';
      duration = 5000;
      console.error('GPS permission denied by user');
      if (dom?.gpsCoordsEl) dom.gpsCoordsEl.textContent = 'Permission Denied';
      break;
    case 2:
      message += 'Position unavailable - check device settings';
      console.warn('GPS position unavailable');
      if (!state.gpsHasEverWorked && dom?.gpsCoordsEl) dom.gpsCoordsEl.textContent = 'GPS Unavailable';
      break;
    case 3:
      message += 'Timeout - trying again...';
      console.warn('GPS timeout - weak signal');
      if (!state.gpsHasEverWorked && Date.now() - state.gpsLastUpdateTime > 60000 && dom?.gpsCoordsEl) {
        dom.gpsCoordsEl.textContent = 'GPS Signal Weak';
      }
      break;
    default:
      message += `Unknown error (${code || 'n/a'})`;
      console.error('GPS error:', error);
  }

  if (code !== 3 || !state.gpsHasEverWorked) showStatus?.('❌ ' + message, duration);
}

export function shouldAutoUpdateCustomLocation(dom) {
  const currentValue = (dom?.customLocationInput?.value ?? state.settings.customLocation) || '';
  const trimmed = String(currentValue).trim();
  if (state.locationUserEdited && trimmed) return false;
  return !trimmed || trimmed === 'Riyadh Province';
}

export async function reverseGeocodeFromWeb(lat, lon) {
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = state.geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < state.CACHE_EXPIRY) return cached.label;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=12&addressdetails=1&accept-language=${encodeURIComponent(state.currentLang)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'LensLightApp/1.0' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`Reverse geocode failed: ${res.status}`);

    const data = await res.json();
    const addr = data?.address;
    const parts = [];
    const city = addr?.city || addr?.town || addr?.village || addr?.suburb;
    const region = addr?.state || addr?.region || addr?.county;
    const country = addr?.country;

    if (city) parts.push(city);
    if (region && region !== city) parts.push(region);
    if (country && country !== region) parts.push(country);

    const label = parts.filter(Boolean).join(', ') || data?.display_name || '';
    state.geocodeCache.set(cacheKey, { label, timestamp: Date.now() });
    if (state.geocodeCache.size > 50) state.geocodeCache.delete(state.geocodeCache.keys().next().value);

    return label;
  } catch (e) {
    if (e?.name !== 'AbortError') console.warn('reverseGeocodeFromWeb failed', e);
    return '';
  }
}

export function getWeatherDescription(code) {
  const weatherCodes = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm'
  };
  return weatherCodes[code] || 'Unknown';
}

function getWindDirection(deg) {
  if (deg === null || deg === undefined) return '';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(deg / 45) % 8];
}

export function updateWeatherDisplay(dom) {
  if (!dom?.weatherInfoEl) return;
  if (state.weatherData.temp === null || state.weatherData.temp === undefined) {
    dom.weatherInfoEl.style.display = 'none';
    return;
  }

  const tempUnit = state.settings.units === 'imperial' ? '°F' : '°C';
  const speedUnit = state.settings.units === 'imperial' ? 'mph' : 'm/s';

  dom.weatherInfoEl.innerHTML = '';

  const top = document.createElement('div');
  top.className = 'data-line large-text';
  top.textContent = `${Math.round(state.weatherData.temp)}${tempUnit}`;
  dom.weatherInfoEl.appendChild(top);

  if (state.weatherData.description) {
    const desc = document.createElement('div');
    desc.className = 'data-line small-text';
    desc.textContent = state.weatherData.description;
    dom.weatherInfoEl.appendChild(desc);
  }

  if (state.weatherData.windSpeed !== null) {
    const wind = document.createElement('div');
    wind.className = 'data-line small-text';
    wind.textContent = `💨 ${state.weatherData.windSpeed.toFixed(1)} ${speedUnit} ${getWindDirection(state.weatherData.windDirection)}`;
    dom.weatherInfoEl.appendChild(wind);
  }

  if (state.weatherData.humidity !== null) {
    const hum = document.createElement('div');
    hum.className = 'data-line small-text';
    hum.textContent = `💧 ${state.weatherData.humidity}%`;
    dom.weatherInfoEl.appendChild(hum);
  }
  dom.weatherInfoEl.style.display = 'block';
}

export async function fetchWeatherData(lat, lon, dom) {
  const now = Date.now();
  if (now - state.lastWeatherFetch < 600000) return;
  if (!navigator.onLine || !lat || !lon) return;

  try {
    const tempUnit = state.settings.units === 'imperial' ? 'fahrenheit' : 'celsius';
    const windUnit = state.settings.units === 'imperial' ? 'mph' : 'ms';

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return;
    const data = await res.json();
    const cur = data?.current;
    if (!cur) return;

    state.weatherData.temp = cur.temperature_2m ?? null;
    state.weatherData.feelsLike = cur.apparent_temperature ?? null;
    state.weatherData.description = getWeatherDescription(cur.weather_code);
    state.weatherData.windSpeed = cur.wind_speed_10m ?? null;
    state.weatherData.windDirection = cur.wind_direction_10m ?? null;
    state.weatherData.humidity = cur.relative_humidity_2m ?? null;
    state.weatherData.pressure = cur.surface_pressure ?? null;
    state.weatherData.lastUpdate = now;

    state.lastWeatherFetch = now;
    updateWeatherDisplay(dom);
  } catch (e) {
    if (e?.name !== 'AbortError') console.warn('fetchWeatherData failed', e);
  }
}

export function maybeUpdateCustomLocationFromWebFactory(dom) {
  return function maybeUpdateCustomLocationFromWeb(lat, lon) {
    try {
      if (!navigator.onLine) return;
      if (!shouldAutoUpdateCustomLocation(dom)) return;

      const now = Date.now();
      if (now - state.lastReverseGeocodeAt < 60_000) return;

      const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
      if (key === state.lastReverseGeocodeKey && now - state.lastReverseGeocodeAt < 300_000) return;

      state.lastReverseGeocodeAt = now;
      state.lastReverseGeocodeKey = key;

      if (dom?.locationNameEl) {
        dom.locationNameEl.textContent = state.currentLang === 'ar' ? 'الموقع: 📍 جارٍ جلب الموقع...' : 'Location: 📍 Fetching location...';
      }

      fetchWeatherData(lat, lon, dom);

      reverseGeocodeFromWeb(lat, lon)
        .then((label) => {
          const cleaned = String(label || '').trim();
          if (!cleaned) {
            if (dom?.locationNameEl) {
              dom.locationNameEl.textContent = state.currentLang === 'ar'
                ? `الموقع: ${state.settings.customLocation || ''}`
                : `Location: ${state.settings.customLocation || ''}`;
            }
            return;
          }

          if (dom?.customLocationInput && !state.locationUserEdited) dom.customLocationInput.value = cleaned;
          state.settings.customLocation = cleaned;
          saveSettings();

          if (dom?.locationNameEl) dom.locationNameEl.textContent = state.currentLang === 'ar' ? `الموقع: ${cleaned}` : `Location: ${cleaned}`;
        })
        .catch(() => {
          if (dom?.locationNameEl) {
            dom.locationNameEl.textContent = state.currentLang === 'ar'
              ? `الموقع: ${state.settings.customLocation || ''}`
              : `Location: ${state.settings.customLocation || ''}`;
          }
        });
    } catch (e) {
      console.warn('maybeUpdateCustomLocationFromWeb failed', e);
    }
  };
}
