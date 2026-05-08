import { state } from '../state.js';
import { sleep, createShortAddress, notifyPhotosChanged } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { dbPutPhoto } from '../storage/photoDb.js';
import { playBeep, playCameraShutter } from './audio.js';
import { ensureLogoLoaded } from './overlays/canvas-utils.js';
import { drawReportOverlay, drawHeaderBand } from './overlays/report.js';
import { drawCompassBadgeOverlay } from './overlays/compass.js';

const PORTRAIT_MAX_DIMENSION = 3200;
const LANDSCAPE_MAX_DIMENSION = 2800;
const PORTRAIT_MAX_UPSCALE = 1.4;
const LANDSCAPE_MAX_UPSCALE = 1.25;
const SHARPEN_AMOUNT = 0.15;
const FLASH_DURATION_MS = 350;
const BURST_GAP_MS = 300;
const COUNTDOWN_TICK_MS = 1000;
const STORAGE_FULL_THRESHOLD_PCT = 95;
const STORAGE_LOW_THRESHOLD_PCT = 75;
const STORAGE_FULL_WARN_PCT = 90;
const DEFAULT_WHITE_BALANCE = 5500;
const MIN_JPEG_QUALITY = 0.92;

const FILTER_CSS = Object.freeze({
  bw: 'grayscale(1)',
  sepia: 'sepia(1)',
  vintage: 'sepia(0.6) contrast(1.1) saturate(0.9)',
  vivid: 'contrast(1.2) saturate(1.4)'
});

const isDebugMode = () => localStorage.getItem('debug_mode') === 'true';

export function cssForFilter(name) {
  return FILTER_CSS[name] || '';
}

export async function ensureVideoReady(video, timeoutMs = 2000) {
  if (!video) return false;
  if (video.videoWidth && video.videoHeight) {
    if (isDebugMode()) console.log('✅ Camera ready (immediate):', video.videoWidth, 'x', video.videoHeight);
    return true;
  }
  if (video.readyState >= 3) {
    if (isDebugMode()) console.log('✅ Camera ready (readyState):', video.readyState);
    return true;
  }

  try {
    // Some browsers require an explicit play() after setting srcObject.
    await video.play();
  } catch (err) {
    console.warn('Video play() failed (might be auto-playing):', err);
  }

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (ok) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timerId);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('playing', onReady);

      // Recover from spurious timeouts: poll one more time.
      let success = ok;
      if (!success && (video.readyState >= 3 || (video.videoWidth && video.videoHeight))) {
        success = true;
      }
      resolve(success);
    };

    const onReady = () => finish(Boolean((video.videoWidth && video.videoHeight) || video.readyState >= 3));
    const timerId = setTimeout(() => finish(false), timeoutMs);

    video.addEventListener('loadedmetadata', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('playing', onReady, { once: true });
  });
}

export async function checkStorageQuota({ showStatus } = {}) {
  try {
    if (!navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    if (quota <= 0) return null;

    const percentUsed = (usage / quota) * 100;
    if (percentUsed > STORAGE_FULL_WARN_PCT) showStatus?.('⚠️ ' + t('storageFull'), 4000);
    else if (percentUsed > STORAGE_LOW_THRESHOLD_PCT) showStatus?.('⚠️ ' + t('storageLow'), 3000);
    return { usage, quota, percentUsed };
  } catch (e) {
    console.warn('Storage estimate failed', e);
    return null;
  }
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Failed to create image blob')),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Convolution-based unsharp mask. Mutates `imageData` in place.
 * `amount` blends original (0) → sharpened (1).
 */
function sharpenImageData(imageData, amount = 0.2) {
  const data = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  const weights = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const side = Math.round(Math.sqrt(weights.length));
  const halfSide = Math.floor(side / 2);
  const output = new Uint8ClampedArray(data);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dstOff = (y * w + x) * 4;
      let r = 0, g = 0, b = 0;

      for (let cy = 0; cy < side; cy++) {
        for (let cx = 0; cx < side; cx++) {
          const scy = Math.min(h - 1, Math.max(0, y + cy - halfSide));
          const scx = Math.min(w - 1, Math.max(0, x + cx - halfSide));
          const srcOff = (scy * w + scx) * 4;
          const wt = weights[cy * side + cx];
          r += data[srcOff] * wt;
          g += data[srcOff + 1] * wt;
          b += data[srcOff + 2] * wt;
        }
      }

      output[dstOff] = data[dstOff] + (r - data[dstOff]) * amount;
      output[dstOff + 1] = data[dstOff + 1] + (g - data[dstOff + 1]) * amount;
      output[dstOff + 2] = data[dstOff + 2] + (b - data[dstOff + 2]) * amount;
    }
  }

  data.set(output);
}

/**
 * Computes the slice of the source video frame that matches what the user
 * sees on screen (object-fit: cover) and applies the current digital zoom.
 */
function computeSourceCrop(video) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const previewRect = video.getBoundingClientRect();
  const viewportWidth = previewRect.width || video.clientWidth || window.innerWidth;
  const viewportHeight = previewRect.height || video.clientHeight || window.innerHeight;
  const viewportRatio = viewportWidth / viewportHeight;
  const videoRatio = vw / vh;
  const zoom = state.zoomLevel || 1.0;

  let visibleWidth, visibleHeight, offsetX, offsetY;
  if (videoRatio > viewportRatio) {
    visibleHeight = vh;
    visibleWidth = vh * viewportRatio;
    offsetX = (vw - visibleWidth) / 2;
    offsetY = 0;
  } else {
    visibleWidth = vw;
    visibleHeight = vw / viewportRatio;
    offsetX = 0;
    offsetY = (vh - visibleHeight) / 2;
  }

  const zoomedWidth = visibleWidth / zoom;
  const zoomedHeight = visibleHeight / zoom;
  const sx = offsetX + (visibleWidth - zoomedWidth) / 2;
  const sy = offsetY + (visibleHeight - zoomedHeight) / 2;

  return { vw, vh, viewportWidth, viewportHeight, viewportRatio, videoRatio, zoom, sx, sy, zoomedWidth, zoomedHeight, visibleWidth, visibleHeight };
}

/**
 * Picks an export size that matches the cropped preview, capping upscaling so
 * portrait crops don't get smeared but high-end phones still get full detail.
 */
function computeOutputSize(zoomedWidth, zoomedHeight) {
  const isPortraitCapture = zoomedHeight >= zoomedWidth;
  const maxDimension = isPortraitCapture ? PORTRAIT_MAX_DIMENSION : LANDSCAPE_MAX_DIMENSION;
  const maxUpscale = isPortraitCapture ? PORTRAIT_MAX_UPSCALE : LANDSCAPE_MAX_UPSCALE;
  const sourceLongEdge = Math.max(zoomedWidth, zoomedHeight, 1);
  const targetLongEdge = sourceLongEdge >= maxDimension
    ? maxDimension
    : Math.min(maxDimension, Math.round(sourceLongEdge * maxUpscale));
  const exportScale = targetLongEdge / sourceLongEdge;

  return {
    exportScale,
    outputWidth: Math.max(1, Math.round(zoomedWidth * exportScale)),
    outputHeight: Math.max(1, Math.round(zoomedHeight * exportScale))
  };
}

function buildPreviewFilterChain() {
  const brightnessVal = 1 + state.featureState.exposureValue * 0.18;
  const filterCss = cssForFilter(state.featureState.currentFilter);
  const parts = [];

  parts.push(filterCss || 'contrast(1.02) saturate(1.05)');
  if (brightnessVal !== 1) parts.push(`brightness(${brightnessVal})`);
  return parts.join(' ');
}

function triggerShutterFlash(dom) {
  if (!dom?.flash) return;
  dom.flash.classList.add('active');
  setTimeout(() => dom.flash.classList.remove('active'), FLASH_DURATION_MS);
}

async function runHdrCaptureIfActive(dom, showStatus) {
  if (!state.featureState.hdrMode) return false;

  try {
    const { captureHDR } = await import('../features/hdr.js');
    playCameraShutter();
    triggerShutterFlash(dom);
    const result = await captureHDR(dom.video, dom.canvas, showStatus);
    if (!result) console.warn('HDR capture failed, using normal mode');
    return true; // HDR took ownership of shutter sfx; canvas is already populated.
  } catch (err) {
    console.error('HDR module error:', err);
    return false;
  }
}

async function applyEnhancementFilters(canvas, ctx) {
  if (state.whiteBalanceTemp && state.whiteBalanceTemp !== DEFAULT_WHITE_BALANCE) {
    try {
      const { applyWhiteBalanceToCanvas } = await import('../features/whitebalance.js');
      applyWhiteBalanceToCanvas(canvas, ctx, state.whiteBalanceTemp);
    } catch (err) {
      console.warn('White balance adjustment failed:', err);
    }
  }

  // Vivid filter already boosts micro-contrast; sharpening on top creates halos.
  if (state.featureState.currentFilter !== 'vivid') {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    sharpenImageData(imageData, SHARPEN_AMOUNT);
    ctx.putImageData(imageData, 0, 0);
  }
}

async function composeOverlays(ctx, canvas) {
  const { settings } = state;
  const wantsHeader = settings.watermark || settings.showData;
  const logoOk = wantsHeader ? await ensureLogoLoaded(800) : false;

  // Webpage-style masthead at the top.
  if (wantsHeader) drawHeaderBand(ctx, canvas, logoOk);

  // Bottom information card (location, coordinates, accuracy/altitude/weather).
  if (settings.showData) drawReportOverlay(ctx, canvas, logoOk);

  // Compass chip on the right, positioned just below the masthead.
  if (settings.showCompass) drawCompassBadgeOverlay(ctx, canvas);
}

async function persistCapturedPhoto(blob, { showStatus, onCaptured }) {
  const photo = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    lat: state.currentLat,
    lon: state.currentLon,
    alt: state.currentAlt,
    heading: state.currentHeading,
    shortAddress: state.currentShortAddress || createShortAddress(state.currentLat, state.currentLon),
    projectName: state.settings.projectName,
    location: state.settings.customLocation,
    comment: '',
    mime: blob.type || 'image/jpeg',
    filter: state.featureState.currentFilter
  };

  try {
    await dbPutPhoto({ ...photo, blob });
    state.photos.push(photo);
    state.lastCapturedPhotoId = photo.id;
    notifyPhotosChanged();
    onCaptured?.(photo);
    if (!state.featureState.burstMode) showStatus?.(t('photoCaptured'), 1500);
  } catch (err) {
    console.error('❌ Failed to save photo:', err);
    if (err.message?.includes('Storage full') || err.message?.includes('QuotaExceeded')) {
      showStatus?.('❌ Storage full! Delete old photos to continue.', 5000);
      throw new Error('Storage full - photo not saved');
    }
    showStatus?.('❌ Failed to save photo: ' + (err.message || 'Unknown error'), 4000);
    throw err;
  }
}

export async function enhancedCapture(dom, { showStatus, onCaptured } = {}) {
  if (!dom?.video || !state.videoStream) {
    throw new Error(t('videoNotReady'));
  }

  // iOS Safari sometimes reports 0×0 even when the stream is playing.
  if (!dom.video.videoWidth || !dom.video.videoHeight) {
    console.warn('⚠️ Video dimensions not ready, waiting...');
    const ready = await ensureVideoReady(dom.video, 3000);
    if (!ready || !dom.video.videoWidth || !dom.video.videoHeight) {
      throw new Error('Video dimensions unavailable. Try flipping camera or restart app.');
    }
  }
  if (!dom?.canvas) throw new Error('Canvas missing');

  // willReadFrequently keeps getImageData fast for sharpening/HDR/white-balance.
  const ctx = dom.canvas.getContext('2d', { alpha: false, willReadFrequently: true });

  const hdrHandled = await runHdrCaptureIfActive(dom, showStatus);
  if (!hdrHandled) {
    playCameraShutter();
    triggerShutterFlash(dom);
  }

  const crop = computeSourceCrop(dom.video);
  const { outputWidth, outputHeight, exportScale } = computeOutputSize(crop.zoomedWidth, crop.zoomedHeight);

  dom.canvas.width = outputWidth;
  dom.canvas.height = outputHeight;

  if (isDebugMode()) {
    console.log('📸 Capture:', {
      video: `${crop.vw}x${crop.vh} (${crop.videoRatio.toFixed(2)})`,
      viewport: `${crop.viewportWidth}x${crop.viewportHeight} (${crop.viewportRatio.toFixed(2)})`,
      visible: `${crop.visibleWidth.toFixed(0)}x${crop.visibleHeight.toFixed(0)}`,
      crop: `${crop.zoomedWidth.toFixed(0)}x${crop.zoomedHeight.toFixed(0)} at (${crop.sx.toFixed(0)},${crop.sy.toFixed(0)})`,
      output: `${outputWidth}x${outputHeight}`,
      exportScale: exportScale.toFixed(2),
      zoom: `${crop.zoom}x`
    });
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = exportScale < 1 ? 'high' : 'medium';
  ctx.filter = buildPreviewFilterChain();
  ctx.drawImage(
    dom.video,
    crop.sx, crop.sy, crop.zoomedWidth, crop.zoomedHeight,
    0, 0, outputWidth, outputHeight
  );
  ctx.filter = 'none';

  await applyEnhancementFilters(dom.canvas, ctx);
  await composeOverlays(ctx, dom.canvas);

  const jpegQuality = Math.max(MIN_JPEG_QUALITY, state.settings.imageQuality || 0.95);
  const blob = await canvasToJpegBlob(dom.canvas, jpegQuality);

  await persistCapturedPhoto(blob, { showStatus, onCaptured });
}

export async function performCapture(dom, { showStatus, onCaptured, onBurstUi } = {}) {
  if (isDebugMode()) console.log('📸 performCapture called');

  if (state.featureState.captureInProgress) {
    console.warn('Capture already in progress');
    return;
  }

  if (!state.videoStream) {
    console.error('❌ No video stream - camera not initialized');
    showStatus?.('❌ ' + t('videoNotReady'), 2500);
    return;
  }

  // Pre-flight quota check prevents losing the shot to a silent IndexedDB failure.
  try {
    const quota = await checkStorageQuota({ showStatus });
    if (quota && quota.percentUsed > STORAGE_FULL_THRESHOLD_PCT) {
      showStatus?.('❌ Storage full! Please delete photos to continue.', 5000);
      return;
    }
  } catch (e) {
    console.warn('Quota check failed, proceeding anyway:', e);
  }

  if (isDebugMode()) console.log('Starting capture...');

  try {
    state.featureState.captureInProgress = true;

    if (state.featureState.burstMode) {
      if (state.featureState.burstCount >= state.featureState.maxBurstPhotos) {
        state.featureState.burstMode = false;
        state.featureState.burstCount = 0;
        onBurstUi?.('done');
        showStatus?.('📸 ' + t('burstComplete'), 2000);
        return;
      }
      state.featureState.burstCount++;
      onBurstUi?.('count');
    }

    await enhancedCapture(dom, { showStatus, onCaptured });

    if (state.featureState.burstMode && state.featureState.burstCount < state.featureState.maxBurstPhotos) {
      await sleep(BURST_GAP_MS);
      state.featureState.captureInProgress = false;
      return performCapture(dom, { showStatus, onCaptured, onBurstUi });
    }

    if (state.featureState.burstMode) {
      state.featureState.burstMode = false;
      state.featureState.burstCount = 0;
      onBurstUi?.('done');
      showStatus?.('📸 ' + t('burstComplete'), 2000);
    }
  } catch (e) {
    console.error('performCapture failed', e);
    showStatus?.('❌ ' + (e?.message || t('captureFailed')), 3000);
  } finally {
    state.featureState.captureInProgress = false;
  }
}

export function startTimerCapture(dom, { showStatus, onCaptured, onBurstUi } = {}) {
  if (state.featureState.countdownIntervalId) {
    clearInterval(state.featureState.countdownIntervalId);
    state.featureState.countdownIntervalId = null;
    dom?.timerCountdown?.classList.remove('active');
  }

  let countdown = state.featureState.timerDelay;
  if (dom?.timerCountdown) {
    dom.timerCountdown.textContent = String(countdown);
    dom.timerCountdown.classList.add('active');
  }

  state.featureState.countdownIntervalId = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      if (dom?.timerCountdown) dom.timerCountdown.textContent = String(countdown);
      if (state.settings.cameraSound) playBeep(800, 0.08, 0.06);
      return;
    }

    clearInterval(state.featureState.countdownIntervalId);
    state.featureState.countdownIntervalId = null;
    dom?.timerCountdown?.classList.remove('active');
    performCapture(dom, { showStatus, onCaptured, onBurstUi });
  }, COUNTDOWN_TICK_MS);
}
