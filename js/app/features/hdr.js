import { state } from '../state.js';
import { saveSettings } from '../core/settings.js';
import { isDebugModeEnabled, sleep } from '../core/utils.js';

/**
 * HDR (High Dynamic Range) capture: takes 3 bracketed exposures and merges
 * them with luminance-aware blending + Reinhard tone mapping.
 */

const EXPOSURE_STOPS = [-1.5, 0, 1.5];
const FIRST_FRAME_SETTLE_MS = 400;
const SUBSEQUENT_FRAME_SETTLE_MS = 250;
const SHADOW_LIFT_THRESHOLD = 60;
const HIGHLIGHT_RECOVER_THRESHOLD = 195;
const TONE_MAP_GAIN = 1.1;

const lerp = (a, b, t) => a + (b - a) * t;

function applyToneMapping(r, g, b) {
  // Simple Reinhard tone mapping with a small post-gain.
  const L = 0.299 * r + 0.587 * g + 0.114 * b;
  const Lnew = L / (1 + L / 255);
  const scale = Lnew / (L || 1);
  return {
    r: Math.min(255, Math.max(0, r * scale * TONE_MAP_GAIN)),
    g: Math.min(255, Math.max(0, g * scale * TONE_MAP_GAIN)),
    b: Math.min(255, Math.max(0, b * scale * TONE_MAP_GAIN))
  };
}

function mergeHDRImages(images) {
  const [underexposed, normal, overexposed] = images;
  const merged = new ImageData(normal.width, normal.height);
  const underData = underexposed.data;
  const normalData = normal.data;
  const overData = overexposed.data;
  const mergedData = merged.data;

  for (let i = 0; i < mergedData.length; i += 4) {
    const normalR = normalData[i];
    const normalG = normalData[i + 1];
    const normalB = normalData[i + 2];
    const normalLuminance = 0.299 * normalR + 0.587 * normalG + 0.114 * normalB;

    let r, g, b;
    if (normalLuminance < SHADOW_LIFT_THRESHOLD) {
      // Shadow zone — pull detail in from the overexposed frame.
      const weight = normalLuminance / SHADOW_LIFT_THRESHOLD;
      r = lerp(overData[i], normalData[i], weight);
      g = lerp(overData[i + 1], normalData[i + 1], weight);
      b = lerp(overData[i + 2], normalData[i + 2], weight);
    } else if (normalLuminance > HIGHLIGHT_RECOVER_THRESHOLD) {
      // Highlight zone — recover from the underexposed frame.
      const weight = (normalLuminance - HIGHLIGHT_RECOVER_THRESHOLD) / SHADOW_LIFT_THRESHOLD;
      r = lerp(normalData[i], underData[i], weight);
      g = lerp(normalData[i + 1], underData[i + 1], weight);
      b = lerp(normalData[i + 2], underData[i + 2], weight);
    } else {
      r = normalR; g = normalG; b = normalB;
    }

    const toneMapped = applyToneMapping(r, g, b);
    mergedData[i] = toneMapped.r;
    mergedData[i + 1] = toneMapped.g;
    mergedData[i + 2] = toneMapped.b;
    mergedData[i + 3] = 255;
  }

  return merged;
}

function drawVideoFrame(ctx, video, canvas, crop) {
  // When the caller provides the preview crop (object-fit: cover + zoom),
  // sample exactly that region so HDR output matches a normal capture's
  // framing instead of stretching the full sensor frame into the canvas.
  if (crop) {
    ctx.drawImage(
      video,
      crop.sx, crop.sy, crop.zoomedWidth, crop.zoomedHeight,
      0, 0, canvas.width, canvas.height
    );
  } else {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
}

async function captureExposureFrame(track, video, ctx, canvas, exposure, isFirst, crop) {
  await track.applyConstraints({ advanced: [{ exposureCompensation: exposure }] });
  await sleep(isFirst ? FIRST_FRAME_SETTLE_MS : SUBSEQUENT_FRAME_SETTLE_MS);
  drawVideoFrame(ctx, video, canvas, crop);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Captures a 3-exposure bracket into `canvas` (which must already be sized
 * by the caller) and leaves the merged HDR image on it.
 * Returns the canvas on success, null on failure — the caller keeps or
 * redraws the canvas based on that.
 */
export async function captureHDR(video, canvas, showStatus, crop = null) {
  if (!state.videoStream) {
    console.warn('No video stream available for HDR');
    return null;
  }

  const ctx = canvas.getContext('2d');
  const track = state.videoStream.getVideoTracks()[0];
  if (!track) {
    console.warn('No video track available');
    return null;
  }

  const capabilities = track.getCapabilities();
  if (!capabilities.exposureCompensation) {
    console.warn('❌ HDR not supported - no exposure control on this device');
    showStatus?.('⚠️ HDR not supported on this camera', 3000);
    return null;
  }

  if (!canvas.width || !canvas.height) {
    console.warn('❌ HDR canvas has no dimensions — caller must size it first');
    return null;
  }

  showStatus?.('✨ Capturing HDR (3 exposures)...', 2000);
  if (isDebugModeEnabled()) console.log('✨ Starting HDR capture...');

  const originalSettings = track.getSettings();
  const originalExposure = originalSettings.exposureCompensation || 0;

  // Clamp the bracket to the device's supported range so applyConstraints
  // doesn't reject on cameras with a narrower compensation window.
  const range = capabilities.exposureCompensation;
  const clampStop = (stop) => Math.min(
    Number.isFinite(range.max) ? range.max : stop,
    Math.max(Number.isFinite(range.min) ? range.min : stop, stop)
  );

  try {
    const images = [];
    for (let i = 0; i < EXPOSURE_STOPS.length; i++) {
      const stop = clampStop(EXPOSURE_STOPS[i]);
      if (isDebugModeEnabled()) {
        console.log(`  Capturing exposure ${i + 1}/${EXPOSURE_STOPS.length} (${stop > 0 ? '+' : ''}${stop} EV)`);
      }
      images.push(await captureExposureFrame(track, video, ctx, canvas, stop, i === 0, crop));
    }

    if (isDebugModeEnabled()) console.log('  Merging HDR images...');
    ctx.putImageData(mergeHDRImages(images), 0, 0);

    await track.applyConstraints({ advanced: [{ exposureCompensation: originalExposure }] });

    if (isDebugModeEnabled()) console.log('✅ HDR capture complete');
    showStatus?.('✅ HDR photo captured', 2000);
    // The merged image lives on the canvas — return it as the success token.
    // (Previously this returned canvas.toDataURL(), a multi-MB string the
    // caller never used.)
    return canvas;
  } catch (err) {
    console.error('HDR capture failed:', err);
    try {
      await track.applyConstraints({ advanced: [{ exposureCompensation: originalExposure }] });
    } catch {
      // Ignore — best-effort restore.
    }
    showStatus?.('❌ HDR capture failed', 2000);
    return null;
  }
}

export function isHDRSupported() {
  try {
    if (!state.videoStream) return false;
    const track = state.videoStream.getVideoTracks()[0];
    if (!track) return false;
    return Boolean(track.getCapabilities().exposureCompensation);
  } catch {
    return false;
  }
}

function disableHdrButton(hdrBtn) {
  hdrBtn.disabled = true;
  hdrBtn.style.opacity = '0.5';
  hdrBtn.title = 'HDR not supported on this camera';
}

export async function initHDRToggle(_dom) {
  const hdrBtn = document.getElementById('hdr-btn');
  const hdrToggle = document.getElementById('toggle-hdr');

  if (!hdrBtn) {
    console.warn('HDR button not found');
    return;
  }

  // Only hard-disable if we already have an active stream and can prove the
  // device does not support exposure compensation. At startup the camera may
  // not be initialized yet, so don't disable prematurely.
  const hasStream = Boolean(state.videoStream?.getVideoTracks?.()?.length);
  const supported = hasStream ? isHDRSupported() : true;

  if (!supported) {
    disableHdrButton(hdrBtn);
    if (isDebugModeEnabled()) console.log('ℹ️ HDR mode not supported on this device');
    return;
  }

  // settings.js restores hdrMode onto featureState before this runs.
  const initialEnabled = Boolean(state.featureState.hdrMode);
  hdrBtn.classList.toggle('active', initialEnabled);
  hdrBtn.setAttribute('aria-pressed', String(initialEnabled));
  if (hdrToggle) hdrToggle.checked = initialEnabled;

  hdrBtn.addEventListener('click', () => {
    // Late capability check for flows where the camera stream starts after
    // initHDRToggle() was called.
    if (state.videoStream && !isHDRSupported()) {
      disableHdrButton(hdrBtn);
      return;
    }

    const enabled = !state.featureState.hdrMode;
    state.featureState.hdrMode = enabled;
    hdrBtn.classList.toggle('active', enabled);
    hdrBtn.setAttribute('aria-pressed', String(enabled));
    if (hdrToggle) hdrToggle.checked = enabled;

    saveSettings();
    if (isDebugModeEnabled()) console.log('✨ HDR mode:', enabled ? 'enabled' : 'disabled');
  });

  if (isDebugModeEnabled()) console.log('✅ HDR feature initialized');
}
