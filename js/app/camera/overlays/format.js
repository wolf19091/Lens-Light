import { state } from '../../state.js';

const RTL_MARK_REGEX = /[‎‏]/g;
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const ARABIC_LABELS = Object.freeze({
  badgeSubtitle: 'كاميرا مسح',
  defaultLabel: 'تقرير ميداني',
  gpsReady: 'الموقع متاح',
  gpsMissing: 'GPS غير متاح',
  fallbackTitle: 'التقاط ميداني',
  projectLabel: 'المشروع',
  coordsLabel: 'الإحداثيات',
  timeLabel: 'الوقت',
  noteLabel: 'ملاحظة',
  noteValue: 'تم التقاطه بواسطة Lens Light',
  mapLabel: 'خريطة GPS',
  noMap: 'لا يوجد إحداثيات',
  latLabel: 'خط العرض',
  longLabel: 'خط الطول',
  brandLabel: 'Lens Light',
  altitudeLabel: 'الارتفاع',
  headingLabel: 'الاتجاه',
  accuracyLabel: 'الدقة',
  weatherLabel: 'الطقس',
  filterLabel: 'المرشح'
});

const ENGLISH_LABELS = Object.freeze({
  badgeSubtitle: 'Survey Camera',
  defaultLabel: 'FIELD REPORT',
  gpsReady: 'GPS LOCKED',
  gpsMissing: 'GPS UNAVAILABLE',
  fallbackTitle: 'Survey Capture',
  projectLabel: 'Project',
  coordsLabel: 'Coordinates',
  timeLabel: 'Time',
  noteLabel: 'Note',
  noteValue: 'Captured with Lens Light',
  mapLabel: 'GPS MAP',
  noMap: 'No coordinates available',
  latLabel: 'Lat',
  longLabel: 'Long',
  brandLabel: 'Lens Light',
  altitudeLabel: 'Altitude',
  headingLabel: 'Heading',
  accuracyLabel: 'Accuracy',
  weatherLabel: 'Weather',
  filterLabel: 'Filter'
});

export function getCaptureText() {
  return state.currentLang === 'ar' ? ARABIC_LABELS : ENGLISH_LABELS;
}

const pad2 = (value) => String(value).padStart(2, '0');

export function getLocalOffsetLabel(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `GMT${sign}${pad2(hours)}:${pad2(minutes)}`;
}

const stripDirectionMarks = (value) => String(value || '').replace(RTL_MARK_REGEX, '').trim();

export function formatOverlayTimestamp(date = new Date()) {
  const isArabic = state.currentLang === 'ar';
  const locale = isArabic ? 'ar-SA-u-ca-gregory-nu-arab' : 'en-US';
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);

  const datePart = isArabic
    ? stripDirectionMarks(new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(date))
    : `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;

  const rawTime = stripDirectionMarks(new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date));
  const timePart = isArabic ? rawTime : rawTime.toUpperCase();

  return `${weekday}, ${datePart} ${timePart} ${getLocalOffsetLabel(date)}`;
}

export function getCardinalDirection(heading) {
  return CARDINALS[Math.round(heading / 45) % 8];
}

export function hasGpsFix() {
  return Number.isFinite(state.currentLat) &&
    Number.isFinite(state.currentLon) &&
    (state.currentLat !== 0 || state.currentLon !== 0);
}

export function formatHeadingValue() {
  if (!state.orientationListenerActive || !Number.isFinite(state.currentHeading)) return '--';
  const normalized = ((state.currentHeading % 360) + 360) % 360;
  return `${Math.round(normalized)}° ${getCardinalDirection(normalized)}`;
}

export function formatAccuracy(accuracyMeters) {
  const isImperial = state.settings.units === 'imperial';
  if (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0) {
    return isImperial ? '-- ft' : '-- m';
  }
  return isImperial
    ? `${Math.round(accuracyMeters * 3.28084)} ft`
    : `${Math.round(accuracyMeters)} m`;
}

export function formatAltitude(altMeters) {
  const isImperial = state.settings.units === 'imperial';
  if (!Number.isFinite(altMeters)) return isImperial ? '-- ft' : '-- m';
  return isImperial
    ? `${Math.round(altMeters * 3.28084)} ft`
    : `${Math.round(altMeters)} m`;
}
