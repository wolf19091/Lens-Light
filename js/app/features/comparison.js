import { state } from '../state.js';
import { showStatus } from '../core/status.js';
import { isDebugModeEnabled } from '../core/utils.js';
import { dbGetPhoto } from '../storage/photoDb.js';

/**
 * Side-by-side comparison of two gallery photos.
 *
 * Activated when the user has exactly two photos selected in the gallery.
 * Each side supports double-click and pinch-to-zoom (cap 4×).
 */

const ZOOM_MAX = 4;
const ZOOM_RESET_THRESHOLD = 1.1;
const TR_AR_ONLY = (en, ar) => state.currentLang === 'ar' ? ar : en;

function getDistance(touch1, touch2) {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function updatePhotoLabel(containerId, photo) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const label = container.querySelector('.photo-label');
  if (!label) return;

  // photoDb stores GPS/heading directly on the record (not under a `metadata` key).
  const date = new Date(photo.timestamp);
  label.textContent = photo.projectName || date.toLocaleDateString();

  const hasGps = Number.isFinite(photo.lat) && Number.isFinite(photo.lon);
  const tooltip = [
    `Date: ${date.toLocaleString()}`,
    hasGps ? `GPS: ${photo.lat.toFixed(6)}, ${photo.lon.toFixed(6)}` : null,
    Number.isFinite(photo.alt) ? `Altitude: ${Math.round(photo.alt)}m` : null,
    Number.isFinite(photo.heading) ? `Heading: ${Math.round(photo.heading)}°` : null
  ].filter(Boolean).join('\n');
  label.title = tooltip;
}

function enableImageZoom(img) {
  let scale = 1;
  let initialDistance = 0;

  img.style.cursor = 'zoom-in';
  img.style.transition = 'transform 0.3s ease';

  img.addEventListener('dblclick', (e) => {
    e.preventDefault();
    if (scale === 1) {
      scale = 2;
      img.style.cursor = 'zoom-out';
      const rect = img.getBoundingClientRect();
      const pointX = ((e.clientX - rect.left) / rect.width) * 100;
      const pointY = ((e.clientY - rect.top) / rect.height) * 100;
      img.style.transformOrigin = `${pointX}% ${pointY}%`;
    } else {
      scale = 1;
      img.style.cursor = 'zoom-in';
      img.style.transformOrigin = 'center center';
    }
    img.style.transform = `scale(${scale})`;
  });

  img.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      initialDistance = getDistance(e.touches[0], e.touches[1]);
    }
  });

  img.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const currentDistance = getDistance(e.touches[0], e.touches[1]);
    const delta = currentDistance / initialDistance;
    scale = Math.max(1, Math.min(ZOOM_MAX, scale * delta));
    img.style.transform = `scale(${scale})`;
    initialDistance = currentDistance;
  });

  img.addEventListener('touchend', () => {
    if (scale < ZOOM_RESET_THRESHOLD) {
      scale = 1;
      img.style.transform = 'scale(1)';
      img.style.cursor = 'zoom-in';
    } else {
      img.style.cursor = 'zoom-out';
    }
  });
}

async function loadComparison({ comparisonMode, leftImg, rightImg }) {
  const selected = Array.from(document.querySelectorAll('.gallery-item.selected'));

  if (selected.length !== 2) {
    showStatus(TR_AR_ONLY(
      '⚠️ Please select exactly 2 photos to compare',
      '⚠️ اختر صورتين بالضبط للمقارنة'
    ), 2500);
    return;
  }

  const photoId1 = parseInt(selected[0].dataset.photoId);
  const photoId2 = parseInt(selected[1].dataset.photoId);

  try {
    const [photo1, photo2] = await Promise.all([dbGetPhoto(photoId1), dbGetPhoto(photoId2)]);
    if (!photo1 || !photo2) {
      showStatus(TR_AR_ONLY('❌ Error loading photos', '❌ تعذر تحميل الصور'), 2500);
      return;
    }

    const url1 = URL.createObjectURL(photo1.blob);
    const url2 = URL.createObjectURL(photo2.blob);
    leftImg.src = url1;
    rightImg.src = url2;

    updatePhotoLabel('comparison-left', photo1);
    updatePhotoLabel('comparison-right', photo2);

    comparisonMode.setAttribute('aria-hidden', 'false');
    if (isDebugModeEnabled()) console.log('🔍 Comparing photos:', photoId1, 'vs', photoId2);

    // Hold the URLs on the modal element so the close handler can revoke them.
    comparisonMode._photoUrls = [url1, url2];
  } catch (err) {
    console.error('Error loading photos for comparison:', err);
    showStatus(TR_AR_ONLY('❌ Failed to load photos', '❌ فشل تحميل الصور'), 3000);
  }
}

export function initPhotoComparison(_dom) {
  const comparisonMode = document.getElementById('comparison-mode');
  const compareBtn = document.getElementById('compare-photos-btn');
  const closeBtn = document.getElementById('close-comparison');
  const leftImg = document.querySelector('#comparison-left img');
  const rightImg = document.querySelector('#comparison-right img');

  if (!comparisonMode || !compareBtn || !closeBtn) {
    console.warn('Photo comparison UI elements not found');
    return;
  }

  compareBtn.addEventListener('click', () => loadComparison({ comparisonMode, leftImg, rightImg }));

  closeBtn.addEventListener('click', () => {
    comparisonMode.setAttribute('aria-hidden', 'true');
    if (comparisonMode._photoUrls) {
      comparisonMode._photoUrls.forEach((url) => URL.revokeObjectURL(url));
      comparisonMode._photoUrls = null;
    }
    leftImg.src = '';
    rightImg.src = '';
  });

  comparisonMode.addEventListener('click', (e) => {
    if (e.target === comparisonMode) closeBtn.click();
  });

  enableImageZoom(leftImg);
  enableImageZoom(rightImg);
}

export function updateComparisonButton() {
  const compareBtn = document.getElementById('compare-photos-btn');
  if (!compareBtn) return;

  const selectedCount = document.querySelectorAll('.gallery-item.selected').length;
  const enabled = selectedCount === 2;
  compareBtn.disabled = !enabled;
  compareBtn.style.opacity = enabled ? '1' : '0.5';
}
