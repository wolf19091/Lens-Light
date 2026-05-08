import { state } from '../state.js';
import { clamp } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { cssForFilter, ensureVideoReady } from './capture.js';

export { checkStorageQuota, enhancedCapture, performCapture, startTimerCapture } from './capture.js';
export { formatAltitude } from './overlays/format.js';

const PREFERRED_MOBILE_RESOLUTION = { width: 4032, height: 3024 };
const PREFERRED_DESKTOP_RESOLUTION = { width: 2560, height: 1440 };
const RESOLUTION_UPGRADE_AREA_RATIO = 0.9;
const HIGH_RES_FALLBACK_LONG_EDGE = 3840;
const HIGH_RES_FALLBACK_SHORT_EDGE = 2160;

const isDebugMode = () => localStorage.getItem('debug_mode') === 'true';

function getPreferredVideoConstraints() {
  const isLikelyMobile = /iPhone|iPad|Android/i.test(navigator.userAgent || '');
  const target = isLikelyMobile ? PREFERRED_MOBILE_RESOLUTION : PREFERRED_DESKTOP_RESOLUTION;
  return {
    width: { ideal: target.width },
    height: { ideal: target.height },
    aspectRatio: { ideal: 4 / 3 },
    frameRate: { ideal: 30, max: 60 }
  };
}

async function tryUpgradeTrackResolution(track) {
  if (!track?.applyConstraints) return false;

  let capabilities = {};
  let settings = {};
  try {
    capabilities = track.getCapabilities?.() || {};
    settings = track.getSettings?.() || {};
  } catch {
    return false;
  }

  const maxWidth = capabilities.width?.max;
  const maxHeight = capabilities.height?.max;
  if (!maxWidth || !maxHeight) return false;

  const supportsFourThree = Number.isFinite(capabilities.aspectRatio?.min) &&
    Number.isFinite(capabilities.aspectRatio?.max) &&
    capabilities.aspectRatio.min <= 4 / 3 &&
    capabilities.aspectRatio.max >= 4 / 3;

  const targetWidth = supportsFourThree
    ? Math.min(maxWidth, Math.round(maxHeight * (4 / 3)), PREFERRED_MOBILE_RESOLUTION.width)
    : Math.min(maxWidth, HIGH_RES_FALLBACK_LONG_EDGE);
  const targetHeight = supportsFourThree
    ? Math.min(maxHeight, Math.round(targetWidth * (3 / 4)))
    : Math.min(maxHeight, HIGH_RES_FALLBACK_SHORT_EDGE);

  const currentArea = (settings.width || 0) * (settings.height || 0);
  if (currentArea >= targetWidth * targetHeight * RESOLUTION_UPGRADE_AREA_RATIO) return false;

  const nextConstraints = {
    width: { ideal: targetWidth },
    height: { ideal: targetHeight },
    frameRate: { ideal: 30, max: 60 }
  };
  if (supportsFourThree) nextConstraints.aspectRatio = { ideal: 4 / 3 };

  try {
    await track.applyConstraints(nextConstraints);
    return true;
  } catch (err) {
    console.warn('High-resolution constraint upgrade skipped:', err);
    return false;
  }
}

/**
 * Tries getUserMedia with progressively looser constraints (exact → ideal →
 * bare `video: true`) so a hostile environment still yields *some* stream.
 */
async function acquireMediaStream(facingMode, baseConstraints) {
  const attempts = [
    { tag: 'exact',    constraints: { video: { ...baseConstraints, facingMode: { exact: facingMode } } } },
    { tag: 'ideal',    constraints: { video: { ...baseConstraints, facingMode: { ideal: facingMode } } } },
    { tag: 'fallback', constraints: { video: true } }
  ];

  let lastError;
  for (const { tag, constraints } of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return { stream, constraintUsed: tag };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function stopExistingStream() {
  if (!state.videoStream) return;
  try {
    state.videoStream.getTracks().forEach((track) => track.stop());
  } catch {
    // ignore
  }
  state.videoStream = null;
}

function reportInitFailure(error, dom, showStatus) {
  if (['NotFoundError', 'NotAllowedError', 'SecurityError'].includes(error?.name)) {
    console.warn('initCamera failed', error);
  } else {
    console.error('initCamera failed', error);
  }
  if (dom?.shutterBtn) dom.shutterBtn.classList.add('disabled');

  if (error?.name === 'NotFoundError') {
    showStatus?.('❌ No camera device found', 5000);
    return;
  }
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    showStatus?.('❌ Camera permission denied', 5000);
    return;
  }
  showStatus?.('❌ Camera error: ' + (error?.message || 'Unknown'), 4000);
}

export async function initCamera(dom, { showStatus } = {}) {
  const requestId = ++state.initCameraRequestId;

  if (dom?.shutterBtn) dom.shutterBtn.classList.add('disabled');

  if (isDebugMode()) {
    console.log('📷 initCamera START:', {
      requestId,
      facingMode: state.settings.cameraFacingMode,
      hasExistingStream: Boolean(state.videoStream)
    });
  }

  try {
    stopExistingStream();

    if (!navigator.mediaDevices?.getUserMedia) {
      showStatus?.('❌ Camera not supported', 4000);
      return false;
    }

    const facingMode = state.settings.cameraFacingMode || 'environment';
    const { stream, constraintUsed } = await acquireMediaStream(facingMode, getPreferredVideoConstraints());

    // A newer initCamera() call superseded us — discard this stream.
    if (requestId !== state.initCameraRequestId) {
      try { stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
      return false;
    }

    state.videoStream = stream;
    if (dom?.video) dom.video.srcObject = state.videoStream;

    const track = stream?.getVideoTracks?.()?.[0];
    const upgradedResolution = await tryUpgradeTrackResolution(track);
    localStorage.setItem('camera_granted', 'true');

    const ready = await ensureVideoReady(dom?.video);

    if (isDebugMode()) {
      const settings = track?.getSettings?.() || {};
      console.log('📷 Camera initialized:', {
        constraintUsed,
        upgradedResolution,
        ready,
        videoWidth: dom?.video?.videoWidth,
        videoHeight: dom?.video?.videoHeight,
        trackSettings: {
          width: settings.width,
          height: settings.height,
          facingMode: settings.facingMode,
          aspectRatio: settings.aspectRatio
        }
      });
    }

    if (dom?.shutterBtn) dom.shutterBtn.classList.toggle('disabled', !ready);
    showStatus?.(ready ? t('cameraReady') : '⚠️ ' + t('videoNotReady'), ready ? 2000 : 3000);

    applyPreviewEffects(dom);
    return ready;
  } catch (error) {
    reportInitFailure(error, dom, showStatus);
    return false;
  }
}

export function applyZoom(dom) {
  if (state.videoStream) {
    const track = state.videoStream.getVideoTracks?.()[0];
    if (track) {
      let caps = {};
      try { caps = track.getCapabilities?.() || {}; } catch {}

      if (caps.zoom?.max) {
        const z = Math.min(state.zoomLevel, caps.zoom.max);
        track.applyConstraints({ advanced: [{ zoom: z }] }).catch(() => {
          if (dom?.video) dom.video.style.transform = `scale(${state.zoomLevel})`;
        });
        return;
      }
    }
  }

  if (dom?.video) dom.video.style.transform = `scale(${state.zoomLevel})`;
}

export function applyPreviewEffects(dom) {
  const brightness = 1 + state.featureState.exposureValue * 0.18;
  const filterFx = cssForFilter(state.featureState.currentFilter);
  const parts = [];
  if (filterFx) parts.push(filterFx);
  parts.push(`brightness(${brightness})`);
  if (dom?.video) dom.video.style.filter = parts.join(' ');
}

export async function toggleTorch(dom, { showStatus } = {}) {
  if (!state.videoStream) return;

  try {
    const track = state.videoStream.getVideoTracks()[0];
    const caps = track.getCapabilities?.() || {};
    if (!caps.torch) {
      showStatus?.('🔦 Flashlight not supported', 2000);
      return;
    }

    state.featureState.flashlightOn = !state.featureState.flashlightOn;
    await track.applyConstraints({ advanced: [{ torch: state.featureState.flashlightOn }] });
    dom?.flashlightBtn?.classList.toggle('active', state.featureState.flashlightOn);
    showStatus?.(state.featureState.flashlightOn ? '🔦 Flashlight ON' : '🔦 Flashlight OFF', 1500);
  } catch (e) {
    console.warn('flashlight failed', e);
    showStatus?.('🔦 Flashlight unavailable', 2000);
  }
}

export async function applyExposureToTrackOrPreview(dom) {
  if (!state.videoStream) {
    applyPreviewEffects(dom);
    return;
  }

  try {
    const track = state.videoStream.getVideoTracks()[0];
    const caps = track.getCapabilities?.() || {};
    if (caps.exposureCompensation) {
      const min = caps.exposureCompensation.min ?? -2;
      const max = caps.exposureCompensation.max ?? 2;
      const v = clamp(state.featureState.exposureValue, min, max);
      await track.applyConstraints({ advanced: [{ exposureCompensation: v }] });
    } else {
      applyPreviewEffects(dom);
    }
  } catch {
    applyPreviewEffects(dom);
  }
}
