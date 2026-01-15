// Shared app state (single source of truth)

export const state = {
  // i18n
  currentLang: 'en',

  // settings
  SETTINGS_KEY: 'surveycam_settings',
  settings: {
    projectName: '',
    customLocation: 'Riyadh Province',
    units: 'metric',
    language: 'en',
    showCompass: true,
    showData: true,
    imageQuality: 1.0,
    watermark: false,
    cameraSound: true,
    cameraFacingMode: 'environment',
    batteryMode: false,
    focusAssist: true,
    hdrMode: false,
    timestampFormat: 'iso'
  },

  // feature state
  featureState: {
    gridEnabled: true,
    levelEnabled: false,
    timerDelay: 0,
    flashlightOn: false,
    currentFilter: 'normal',
    exposureValue: 0,
    burstMode: false,
    burstCount: 0,
    maxBurstPhotos: 10,
    captureInProgress: false,
    countdownIntervalId: null,
    hdrMode: false
  },

  // NEW FEATURES STATE
  whiteBalanceTemp: 5500,
  whiteBalanceRGB: { r: 1, g: 1, b: 1 },
  lastQRCode: null,
  lastQRCodeTimestamp: null,

  // camera
  videoStream: null,
  initCameraRequestId: 0,
  zoomLevel: 1,

  // sensors
  currentLat: 0,
  currentLon: 0,
  currentAlt: 0,
  currentAccuracy: 0,
  currentHeading: 0,
  smoothedHeading: 0,
  gpsWatchId: null,
  orientationListenerActive: false,
  gpsLastUpdateTime: 0,
  gpsHasEverWorked: false,

  // geocode/weather
  locationUserEdited: false,
  lastReverseGeocodeAt: 0,
  lastReverseGeocodeKey: '',
  geocodeCache: new Map(),
  CACHE_EXPIRY: 3600000,

  weatherData: {
    temp: null,
    feelsLike: null,
    description: '',
    windSpeed: null,
    windDirection: null,
    humidity: null,
    pressure: null,
    lastUpdate: 0
  },
  lastWeatherFetch: 0,

  // gallery
  photos: [], // metadata only
  lastCapturedPhotoId: null,
  viewedPhotoId: null,
  viewedPhotoUrl: null,
  selectedPhotos: new Set(),
  isSelectMode: false,
  photoObjectUrls: new Map(),

  // wake lock
  wakeLock: null
};
