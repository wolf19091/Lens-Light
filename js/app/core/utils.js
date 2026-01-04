export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    if (!opened && showStatus) showStatus('⚠️ Popup blocked. Tap and hold to save.', 3500);
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

export async function shareBlob(blob, filename, { t } = {}) {
  if (!navigator.share) return false;

  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
  if (navigator.canShare && !navigator.canShare({ files: [file] })) return false;

  try {
    await navigator.share({ files: [file], title: t ? t('shareTitle') : 'Survey Photo', text: t ? t('shareText') : '' });
    return true;
  } catch (e) {
    if (e?.name !== 'AbortError') console.warn('shareBlob failed', e);
    return false;
  }
}
