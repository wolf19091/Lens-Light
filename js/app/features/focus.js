import { state } from '../state.js';
import { isDebugModeEnabled } from '../core/utils.js';

/**
 * Tap-to-Focus. Maps a click on the live preview into a normalised
 * (x, y) ∈ [0,1] focus point and applies it via the best-available
 * MediaTrack constraint: pointsOfInterest → manual focusDistance →
 * single-shot autofocus.
 */

const FOCUS_RING_LIFETIME_MS = 1000;
const CENTER = 0.5;
const NORMALIZED_DIST_DENOMINATOR = 0.7;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function calculateFocusDistance(x, y, capabilities) {
  // Map distance-from-center into a focus distance: center → far, edges → near.
  const distFromCenter = Math.sqrt(Math.pow(x - CENTER, 2) + Math.pow(y - CENTER, 2));
  const min = capabilities.focusDistance?.min || 0;
  const max = capabilities.focusDistance?.max || 1;
  const normalizedDist = Math.min(distFromCenter / NORMALIZED_DIST_DENOMINATOR, 1);
  return max - normalizedDist * (max - min);
}

async function applyFocusPoint(x, y) {
  try {
    const track = state.videoStream.getVideoTracks()[0];
    if (!track) return;
    const capabilities = track.getCapabilities();
    const supportedModes = capabilities.focusMode || [];

    if (supportedModes.includes('continuous')) {
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous', pointsOfInterest: [{ x, y }] }]
        });
        if (isDebugModeEnabled()) console.log(`✅ Focus applied at (${x.toFixed(2)}, ${y.toFixed(2)})`);
        return;
      } catch {
        // pointsOfInterest unsupported — fall through to manual mode.
      }
    }

    if (supportedModes.includes('manual')) {
      const focusDistance = calculateFocusDistance(x, y, capabilities);
      await track.applyConstraints({
        advanced: [{ focusMode: 'manual', focusDistance }]
      });
      if (isDebugModeEnabled()) console.log(`✅ Manual focus applied: ${focusDistance.toFixed(3)}`);
      return;
    }

    if (supportedModes.includes('single-shot')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
      if (isDebugModeEnabled()) console.log('✅ Single-shot autofocus triggered');
    }
  } catch (err) {
    console.warn('❌ Focus adjustment failed:', err.message);
  }
}

function flashFocusRing(focusRing, clientX, clientY) {
  if (!focusRing) return;
  focusRing.style.left = `${clientX}px`;
  focusRing.style.top = `${clientY}px`;
  focusRing.classList.add('active');
  setTimeout(() => focusRing.classList.remove('active'), FOCUS_RING_LIFETIME_MS);
}

export function initTapToFocus(dom, videoElement) {
  if (!videoElement) {
    console.warn('Video element not available for tap-to-focus');
    return;
  }

  let focusEnabled = state.settings.focusAssist !== false;
  const focusRing = dom.focusRing || document.getElementById('focus-ring');
  const focusBtn = dom.focusBtn || document.getElementById('focus-btn');

  if (!focusBtn || !focusRing) {
    console.warn('Focus UI elements not found');
    return;
  }

  focusBtn.addEventListener('click', () => {
    focusEnabled = !focusEnabled;
    focusBtn.classList.toggle('active', focusEnabled);
    focusBtn.setAttribute('aria-pressed', focusEnabled);
    if (!focusEnabled) focusRing.classList.remove('active');
    if (isDebugModeEnabled()) console.log('🎯 Tap-to-focus:', focusEnabled ? 'enabled' : 'disabled');
  });

  const cameraView = videoElement.parentElement || document.getElementById('camera-view');
  cameraView.addEventListener('click', async (e) => {
    if (!focusEnabled || !state.videoStream || e.target !== videoElement) return;

    const rect = videoElement.getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);

    flashFocusRing(focusRing, e.clientX, e.clientY);
    await applyFocusPoint(x, y);
  });
}

export function getFocusCapabilities() {
  try {
    if (!state.videoStream) return null;
    const track = state.videoStream.getVideoTracks()[0];
    if (!track) return null;

    const capabilities = track.getCapabilities();
    const settings = track.getSettings();
    return {
      supported: Boolean(capabilities.focusMode),
      modes: capabilities.focusMode || [],
      currentMode: settings.focusMode,
      focusDistance: {
        min: capabilities.focusDistance?.min,
        max: capabilities.focusDistance?.max,
        current: settings.focusDistance
      }
    };
  } catch (err) {
    console.warn('Could not get focus capabilities:', err);
    return null;
  }
}
