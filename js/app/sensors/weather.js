import { state } from '../state.js';
import { saveSettings } from '../core/settings.js';
import { getEnglishLocationLabel } from './gps.js';
import { reverseGeocodeFromWeb } from './geocoding.js';

const WEATHER_REFRESH_MS = 600_000;
const WEATHER_FETCH_TIMEOUT_MS = 8000;
const GEOCODE_THROTTLE_MS = 60_000;
const GEOCODE_KEY_WINDOW_MS = 300_000;
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

const WEATHER_CODES = Object.freeze({
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
});

const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export const getWeatherDescription = (code) => WEATHER_CODES[code] || 'Unknown';

const getWindDirection = (deg) =>
  deg === null || deg === undefined ? '' : WIND_DIRECTIONS[Math.round(deg / 45) % 8];

function appendWeatherLine(parent, className, text) {
  const line = document.createElement('div');
  line.className = className;
  line.textContent = text;
  parent.appendChild(line);
}

export function updateWeatherDisplay(dom) {
  if (!dom?.weatherInfoEl) return;
  if (state.weatherData.temp === null || state.weatherData.temp === undefined) {
    dom.weatherInfoEl.style.display = 'none';
    return;
  }

  const isImperial = state.settings.units === 'imperial';
  const tempUnit = isImperial ? '°F' : '°C';
  const speedUnit = isImperial ? 'mph' : 'm/s';

  dom.weatherInfoEl.innerHTML = '';
  appendWeatherLine(dom.weatherInfoEl, 'data-line large-text', `${Math.round(state.weatherData.temp)}${tempUnit}`);

  if (state.weatherData.description) {
    appendWeatherLine(dom.weatherInfoEl, 'data-line small-text', state.weatherData.description);
  }
  if (state.weatherData.windSpeed !== null) {
    appendWeatherLine(
      dom.weatherInfoEl, 'data-line small-text',
      `💨 ${state.weatherData.windSpeed.toFixed(1)} ${speedUnit} ${getWindDirection(state.weatherData.windDirection)}`
    );
  }
  if (state.weatherData.humidity !== null) {
    appendWeatherLine(dom.weatherInfoEl, 'data-line small-text', `💧 ${state.weatherData.humidity}%`);
  }

  dom.weatherInfoEl.style.display = 'block';
}

export async function fetchWeatherData(lat, lon, dom) {
  const now = Date.now();
  if (now - state.lastWeatherFetch < WEATHER_REFRESH_MS) return;
  if (!navigator.onLine || !lat || !lon) return;

  try {
    const isImperial = state.settings.units === 'imperial';
    const tempUnit = isImperial ? 'fahrenheit' : 'celsius';
    const windUnit = isImperial ? 'mph' : 'ms';
    const url = `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEATHER_FETCH_TIMEOUT_MS);
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

export function shouldAutoUpdateCustomLocation(dom) {
  const currentValue = (dom?.customLocationInput?.value ?? state.settings.customLocation) || '';
  const trimmed = String(currentValue).trim();
  if (state.locationUserEdited && trimmed) return false;
  return !trimmed || trimmed === 'Riyadh Province';
}

function showLocationLoading(dom) {
  if (dom?.locationNameEl) dom.locationNameEl.textContent = 'Location: Fetching location...';
}

function showLocationFromSettings(dom) {
  if (!dom?.locationNameEl) return;
  const location = getEnglishLocationLabel(state.settings.customLocation);
  const shortPart = state.currentShortAddress ? ` | Short: ${state.currentShortAddress}` : '';
  dom.locationNameEl.textContent = `Location: ${location}${shortPart}`;
}

function applyResolvedLocation(dom, label) {
  if (dom?.customLocationInput && !state.locationUserEdited) dom.customLocationInput.value = label;
  state.settings.customLocation = label;
  saveSettings();
}

/**
 * Returns a function that, when called with (lat, lon), throttles geocoding
 * + weather refresh so the user's custom location label stays fresh without
 * spamming external APIs. Suppressed when:
 *   - device is offline, or
 *   - the user has manually edited the location input, or
 *   - the same 0.01° grid cell was queried in the last 5 minutes, or
 *   - any geocode ran in the last minute.
 */
export function maybeUpdateCustomLocationFromWebFactory(dom) {
  return function maybeUpdateCustomLocationFromWeb(lat, lon) {
    try {
      if (!navigator.onLine) return;
      if (!shouldAutoUpdateCustomLocation(dom)) return;

      const now = Date.now();
      if (now - state.lastReverseGeocodeAt < GEOCODE_THROTTLE_MS) return;

      const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
      if (key === state.lastReverseGeocodeKey && now - state.lastReverseGeocodeAt < GEOCODE_KEY_WINDOW_MS) return;

      state.lastReverseGeocodeAt = now;
      state.lastReverseGeocodeKey = key;

      showLocationLoading(dom);
      fetchWeatherData(lat, lon, dom);

      reverseGeocodeFromWeb(lat, lon)
        .then((label) => {
          const cleaned = String(label || '').trim();
          if (cleaned) applyResolvedLocation(dom, cleaned);
        })
        .catch(() => {
          // The finally block restores from settings — no extra handling needed.
        })
        .finally(() => showLocationFromSettings(dom));
    } catch (e) {
      console.warn('maybeUpdateCustomLocationFromWeb failed', e);
    }
  };
}
