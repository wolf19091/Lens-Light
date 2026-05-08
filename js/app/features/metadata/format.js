import { state } from '../../state.js';

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDateTime(value) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  return new Intl.DateTimeFormat(state.currentLang === 'ar' ? 'ar-SA' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export const formatCoordinate = (value) =>
  Number.isFinite(value) ? value.toFixed(6) : '—';

export const formatHeading = (value) =>
  Number.isFinite(value) ? `${Math.round(value)}°` : '—';

/** Metric-only altitude formatter for export tables (camera.js has the imperial-aware variant). */
export const formatAltitude = (value) =>
  Number.isFinite(value) ? `${Math.round(value)} m` : '—';

export const normalizeText = (value, fallback = '—') => {
  const clean = String(value || '').trim();
  return clean || fallback;
};

export const getExportTimestamp = () =>
  new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

/** Detects the image extension encoded in a `data:image/...` URL. Defaults to `jpeg`. */
export function detectDataUrlExtension(value) {
  const match = /^data:image\/([a-zA-Z0-9+.-]+);/i.exec(String(value || ''));
  const extension = (match?.[1] || 'jpeg').toLowerCase();
  if (extension === 'jpg') return 'jpeg';
  if (extension === 'png') return 'png';
  return 'jpeg';
}

export const getPdfImageFormat = (value) =>
  detectDataUrlExtension(value) === 'png' ? 'PNG' : 'JPEG';
