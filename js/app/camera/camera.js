import { state } from '../state.js';
import { sleep, clamp } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { dbPutPhoto } from '../storage/photoDb.js';

// Audio (shutter + countdown)
function playBeep(frequency = 800, durationSec = 0.1, gain = 0.08) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!playBeep.ctx) playBeep.ctx = new AudioCtx();
    const ac = playBeep.ctx;
    if (ac.state === 'suspended') ac.resume().catch(() => {});

    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.frequency.value = frequency;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + durationSec);
  } catch {
    // ignore
  }
}

function playCameraShutter() {
  if (!state.settings.cameraSound) return;
  playBeep(1200, 0.05, 0.12);
}

async function ensureVideoReady(video, timeoutMs = 2000) {
  if (!video) return false;
  if (video.videoWidth && video.videoHeight) {
     console.log('✅ Camera ready (immediate):', video.videoWidth, 'x', video.videoHeight);
     return true;
  }
  if (video.readyState >= 3) { // HAVE_FUTURE_DATA
     console.log('✅ Camera ready (readyState):', video.readyState);
     return true;
  }

  try {
    // Some browsers require an explicit play() after setting srcObject.
    await video.play();
  } catch (err) {
    console.warn('Video play() failed (might be auto-playing):', err);
  }

  return await new Promise((resolve) => {
    let resolved = false;
    const finish = (ok) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timerId);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('playing', onReady);

      // Final check: even if we timed out, is the video actually ready?
      if (!ok && (video.readyState >= 3 || (video.videoWidth && video.videoHeight))) {
        console.log('✅ Camera ready (recovered from timeout):', video.readyState, video.videoWidth, 'x', video.videoHeight);
        ok = true;
      }

      if (ok) console.log('✅ Camera ready (event/poll):', video.videoWidth, 'x', video.videoHeight);
      else console.warn('⚠️ Camera initialization timed out', video.readyState, video.error);
      resolve(ok);
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
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      if (quota > 0) {
        const percentUsed = (usage / quota) * 100;
        if (percentUsed > 90) showStatus?.('⚠️ ' + t('storageFull'), 4000);
        else if (percentUsed > 75) showStatus?.('⚠️ ' + t('storageLow'), 3000);
        return { usage, quota, percentUsed };
      }
    }
  } catch (e) {
    console.warn('Storage estimate failed', e);
  }
  return null;
}

export async function initCamera(dom, { showStatus } = {}) {
  const requestId = ++state.initCameraRequestId;

  if (dom?.shutterBtn) dom.shutterBtn.classList.add('disabled');
  
  if (localStorage.getItem('debug_mode') === 'true') {
    console.log('📷 initCamera START:', {
      requestId,
      facingMode: state.settings.cameraFacingMode,
      hasExistingStream: Boolean(state.videoStream)
    });
  }

  try {
    if (state.videoStream) {
      try {
        state.videoStream.getTracks().forEach((t) => t.stop());
      } catch {}
      state.videoStream = null;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showStatus?.('❌ Camera not supported', 4000);
      return false;
    }

    const preferredFacingMode = state.settings.cameraFacingMode || 'environment';
    const baseVideoConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 } };

    const constraintsExact = { video: { ...baseVideoConstraints, facingMode: { exact: preferredFacingMode } } };
    const constraintsIdeal = { video: { ...baseVideoConstraints, facingMode: { ideal: preferredFacingMode } } };

    let stream;
    let lastError;
    let constraintUsed = 'none';
    
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraintsExact);
      constraintUsed = 'exact';
    } catch (e1) {
      lastError = e1;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraintsIdeal);
        constraintUsed = 'ideal';
      } catch (e2) {
        lastError = e2;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          constraintUsed = 'fallback';
        } catch (e3) {
          lastError = e3;
          throw lastError;
        }
      }
    }

    if (requestId !== state.initCameraRequestId) {
      try {
        stream?.getTracks?.().forEach((t) => t.stop());
      } catch {}
      return false;
    }

    state.videoStream = stream;
    if (dom?.video) dom.video.srcObject = state.videoStream;
    localStorage.setItem('camera_granted', 'true');

    const ready = await ensureVideoReady(dom?.video);
    
    if (localStorage.getItem('debug_mode') === 'true') {
      const track = stream?.getVideoTracks?.()?.[0];
      const settings = track?.getSettings?.() || {};
      console.log('📷 Camera initialized:', {
        constraintUsed,
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
  } catch (e) {
    if (e?.name === 'NotFoundError' || e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
      console.warn('initCamera failed', e);
    } else {
      console.error('initCamera failed', e);
    }
    if (dom?.shutterBtn) dom.shutterBtn.classList.add('disabled');

    if (e?.name === 'NotFoundError') {
      showStatus?.('❌ No camera device found', 5000);
      return false;
    }

    if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
      showStatus?.('❌ Camera permission denied', 5000);
      return false;
    }

    showStatus?.('❌ Camera error: ' + (e?.message || 'Unknown'), 4000);
    return false;
  }
}

export function applyZoom(dom) {
  if (state.videoStream) {
    const track = state.videoStream.getVideoTracks?.()[0];
    if (track) {
      let caps = {};
      try {
        caps = track.getCapabilities?.() || {};
      } catch {}

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

function cssForFilter(name) {
  switch (name) {
    case 'bw':
      return 'grayscale(1)';
    case 'sepia':
      return 'sepia(1)';
    case 'vintage':
      return 'sepia(0.6) contrast(1.1) saturate(0.9)';
    case 'vivid':
      return 'contrast(1.2) saturate(1.4)';
    default:
      return '';
  }
}

export function applyPreviewEffects(dom) {
  const brightness = 1 + state.featureState.exposureValue * 0.18;
  const filterFx = cssForFilter(state.featureState.currentFilter);
  const parts = [];
  if (filterFx) parts.push(filterFx);
  parts.push(`brightness(${brightness})`);
  if (dom?.video) dom.video.style.filter = parts.join(' ');
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create image blob'));
      },
      'image/jpeg',
      quality
    );
  });
}

// Watermark logo
const logoImg = new Image();
let logoLoadPromise = null;
// camera.js lives at js/app/camera/camera.js
// The logo is at the app root: /sec-lens-logo.png
logoImg.src = new URL('../../../sec-lens-logo.png', import.meta.url).href;

function getLogoLoadPromise() {
  if (logoImg.naturalWidth > 0) return Promise.resolve(true);
  if (logoLoadPromise) return logoLoadPromise;

  logoLoadPromise = new Promise((resolve) => {
    const done = (ok) => resolve(Boolean(ok));
    logoImg.addEventListener('load', () => done(true), { once: true });
    logoImg.addEventListener('error', () => done(false), { once: true });
  });

  return logoLoadPromise;
}

async function ensureLogoLoaded(timeoutMs = 1000) {
  if (logoImg.naturalWidth > 0) return true;
  const ok = await Promise.race([getLogoLoadPromise(), sleep(timeoutMs).then(() => false)]);
  if (!ok || logoImg.naturalWidth <= 0) return false;

  try {
    if (typeof logoImg.decode === 'function') {
      await Promise.race([logoImg.decode(), sleep(500)]);
    }
  } catch {
    // ignore
  }

  return logoImg.naturalWidth > 0;
}

function addWatermarkToCanvas(ctx, width, height) {
  const fontSize = Math.max(14, width * 0.015);
  const padding = fontSize * 1.5;
  const logoSize = Math.max(40, width * 0.055); // Smaller logo for cleaner look

  if (logoImg.naturalWidth > 0) {
    ctx.save();
    // Subtle shadow for logo depth
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.drawImage(logoImg, padding, padding, logoSize, logoSize);
    ctx.restore();

    // Brand text with matching shadow
    ctx.save();
    ctx.font = `700 ${fontSize * 1.15}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
    ctx.fillText('LENS LIGHT', padding + logoSize + fontSize * 0.8, padding + logoSize / 2 + fontSize * 0.35);
    ctx.restore();
  }
}

function applyFilterToImageData(imageData, filter) {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (filter === 'bw') {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      data[i] = data[i + 1] = data[i + 2] = gray;
    } else if (filter === 'sepia') {
      data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
      data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
      data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
    } else if (filter === 'vintage') {
      data[i] = Math.min(255, r * 1.1);
      data[i + 1] = Math.min(255, g * 1.05);
      data[i + 2] = Math.min(255, b * 0.9);
    } else if (filter === 'vivid') {
      data[i] = Math.min(255, r * 1.2);
      data[i + 1] = Math.min(255, g * 1.2);
      data[i + 2] = Math.min(255, b * 1.2);
    }

    const brightness = 1 + state.featureState.exposureValue * 0.18;
    data[i] = Math.min(255, data[i] * brightness);
    data[i + 1] = Math.min(255, data[i + 1] * brightness);
    data[i + 2] = Math.min(255, data[i + 2] * brightness);
  }
}

function sharpenImageData(imageData, amount = 0.2) {
  const data = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  const weights = [0, -1, 0, -1, 5, -1, 0, -1, 0]; // Sharpening kernel
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

      // Blend original with sharpened based on amount
      output[dstOff] = data[dstOff] + (r - data[dstOff]) * amount;
      output[dstOff + 1] = data[dstOff + 1] + (g - data[dstOff + 1]) * amount;
      output[dstOff + 2] = data[dstOff + 2] + (b - data[dstOff + 2]) * amount;
    }
  }

  data.set(output);
}

export function formatAltitude(altMeters) {
  if (!altMeters || !Number.isFinite(altMeters)) return state.settings.units === 'imperial' ? '-- ft' : '-- m';
  if (state.settings.units === 'imperial') return `${Math.round(altMeters * 3.28084)} ft`;
  return `${Math.round(altMeters)} m`;
}

function drawDataOverlay(ctx, canvas) {
  // Scale font size appropriately for output resolution
  const fontSize = Math.max(Math.min(canvas.width / 48, 26), 15);
  const padding = fontSize * 1.5;
  const lineHeight = fontSize * 1.6;

  const panelWidth = Math.min(canvas.width * 0.52, canvas.width - padding * 2);
  const panelHeight = lineHeight * 7.2;
  const x = canvas.width - panelWidth - padding * 0.8;
  const y = canvas.height - panelHeight - padding * 0.8;

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2.5;

  const r = 14;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + panelWidth - r, y);
  ctx.quadraticCurveTo(x + panelWidth, y, x + panelWidth, y + r);
  ctx.lineTo(x + panelWidth, y + panelHeight - r);
  ctx.quadraticCurveTo(x + panelWidth, y + panelHeight, x + panelWidth - r, y + panelHeight);
  ctx.lineTo(x + r, y + panelHeight);
  ctx.quadraticCurveTo(x, y + panelHeight, x, y + panelHeight - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Enable high-quality text rendering
  ctx.textBaseline = 'top';
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,1.0)';
  ctx.textAlign = 'left';
  
  // No shadow - crisp text on dark background
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const now = new Date();
  let yy = y + padding * 0.9;
  const project = state.settings.projectName ? `Project: ${state.settings.projectName}` : '';

  const lines = [
    project,
    `Time: ${now.toLocaleString(state.currentLang === 'ar' ? 'ar' : 'en-GB', { hour12: false })}`,
    state.currentLat && state.currentLon ? `GPS: ${state.currentLat.toFixed(6)}, ${state.currentLon.toFixed(6)}` : 'GPS: --',
    `Alt: ${formatAltitude(state.currentAlt)}`,
    `Heading: ${Math.round(state.currentHeading)}°`,
    state.settings.customLocation ? `Loc: ${state.settings.customLocation}` : ''
  ].filter(Boolean);

  for (const line of lines) {
    ctx.fillText(line, x + padding, yy);
    yy += lineHeight;
  }

  // Clear shadow to prevent affecting other drawings
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.restore();
}

function drawCompassOverlay(ctx, canvas) {
  const size = Math.min(canvas.width, canvas.height) / 8;
  const cx = size * 1.8;
  const cy = size * 1.8;
  const r = size * 0.65;

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.translate(cx, cy);
  ctx.rotate((state.currentHeading * Math.PI) / 180);

  ctx.beginPath();
  ctx.moveTo(0, -r * 0.75);
  ctx.lineTo(-r * 0.12, 0);
  ctx.lineTo(r * 0.12, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
  ctx.fill();

  ctx.restore();
}

export async function enhancedCapture(dom, { showStatus, onCaptured } = {}) {
  if (!dom?.video || !state.videoStream) {
    throw new Error(t('videoNotReady'));
  }
  
  // CRITICAL FIX: Ensure video dimensions are available before capture
  // iOS Safari sometimes reports 0x0 even when video is playing
  if (!dom.video.videoWidth || !dom.video.videoHeight) {
    console.warn('⚠️ Video dimensions not ready, waiting...');
    const ready = await ensureVideoReady(dom.video, 3000);
    if (!ready || !dom.video.videoWidth || !dom.video.videoHeight) {
      throw new Error('Video dimensions unavailable. Try flipping camera or restart app.');
    }
  }
  
  if (!dom?.canvas) {
    throw new Error('Canvas missing');
  }

  // PERFORMANCE FIX: Add willReadFrequently for faster getImageData operations
  // Used in sharpening, white balance, and HDR processing
  const ctx = dom.canvas.getContext('2d', { alpha: false, willReadFrequently: true });

  // Check if HDR mode is enabled
  if (state.featureState.hdrMode) {
    // Import HDR capture dynamically
    try {
      const { captureHDR } = await import('../features/hdr.js');
      
      playCameraShutter();
      
      if (dom?.flash) {
        dom.flash.classList.add('active');
        setTimeout(() => dom.flash.classList.remove('active'), 350);
      }
      
      const result = await captureHDR(dom.video, dom.canvas, showStatus);
      if (!result) {
        // HDR failed, fall back to normal capture
        console.warn('HDR capture failed, using normal mode');
      } else {
        // HDR capture successful - the canvas already has the merged image
        // Continue with normal watermark and overlay processing below
      }
    } catch (err) {
      console.error('HDR module error:', err);
      // Fall back to normal capture
    }
  } else {
    // Normal capture mode
    playCameraShutter();

    if (dom?.flash) {
      dom.flash.classList.add('active');
      setTimeout(() => dom.flash.classList.remove('active'), 350);
    }
  }

  const vw = dom.video.videoWidth;
  const vh = dom.video.videoHeight;
  
  // Debug logging (if enabled)
  if (localStorage.getItem('debug_mode') === 'true') {
    console.log('📸 Capture dimensions:', {
      videoWidth: vw,
      videoHeight: vh,
      videoRatio: (vw/vh).toFixed(2),
      clientWidth: dom.video.clientWidth,
      clientHeight: dom.video.clientHeight,
      screenRatio: ((dom.video.clientWidth || window.innerWidth) / (dom.video.clientHeight || window.innerHeight)).toFixed(2),
      zoomLevel: state.zoomLevel
    });
  }
  
  // Calculate crop to match view (WYSIWYG)
  // 1. Get viewport dimensions - use actual rendered size
  const sw = dom.video.clientWidth || window.innerWidth;
  const sh = dom.video.clientHeight || window.innerHeight;
  
  const videoRatio = vw / vh;
  const screenRatio = sw / sh;
  const zoom = state.zoomLevel || 1.0;

  // 2. Calculate the specific region of the video frame that is visible
  let visibleW, visibleH; // The width/height of the video content visible at 1x zoom (object-fit: cover)

  if (screenRatio >= videoRatio) {
    // Screen is wider relative to video. Video fits width-wise, cropped height-wise.
    visibleW = vw;
    visibleH = vw / screenRatio;
  } else {
    // Screen is taller relative to video. Video fits height-wise, cropped width-wise.
    visibleH = vh;
    visibleW = vh * screenRatio;
  }

  // 3. Apply Digital Zoom (center crop of the visible area)
  // The user sees a window of size (visibleW/zoom) x (visibleH/zoom)
  const cropW = visibleW / zoom;
  const cropH = visibleH / zoom;
  
  // 4. Center coordinates
  const sx = (vw - cropW) / 2;
  const sy = (vh - cropH) / 2;

  // 5. Destination Canvas
  // We want the output to be high resolution (based on video source), 
  // but with the aspect ratio of the screen.
  // Scale up by 1.5x for sharper output
  const outputScale = 1.5;
  const outputW = Math.round(visibleW * outputScale);
  const outputH = Math.round(visibleH * outputScale);
  dom.canvas.width = outputW;
  dom.canvas.height = outputH;

  // 6. Draw filtered/cropped image
  // Enable high quality image smoothing for digital zoom
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Apply filters using Context 2D Filter API (Hardware Accelerated)
  // This matches the preview CSS and adds a subtle "Pro" enhancement to base photos
  const brightnessVal = 1 + state.featureState.exposureValue * 0.18;
  const filterCss = cssForFilter(state.featureState.currentFilter);
  const filterParts = [];
  
  if (filterCss) {
    filterParts.push(filterCss);
  } else {
     // Apply "Smart Enhance" for Normal mode: slight pop in contrast and saturation
     filterParts.push('contrast(1.02) saturate(1.05)');
  }

  // Apply exposure
  if (brightnessVal !== 1) {
    filterParts.push(`brightness(${brightnessVal})`);
  }
  
  // Set the filter on the context before drawing
  if (filterParts.length > 0) {
    ctx.filter = filterParts.join(' ');
  }

  // Draw the zoomed crop onto the full canvas size (digital zoom upscale)
  ctx.drawImage(dom.video, sx, sy, cropW, cropH, 0, 0, outputW, outputH);
  
  // Reset filter and apply subtle sharpening for crisp output
  ctx.filter = 'none';
  
  // Apply white balance if adjusted
  if (state.whiteBalanceTemp && state.whiteBalanceTemp !== 5500) {
    try {
      const { applyWhiteBalanceToCanvas } = await import('../features/whitebalance.js');
      applyWhiteBalanceToCanvas(dom.canvas, ctx, state.whiteBalanceTemp);
    } catch (err) {
      console.warn('White balance adjustment failed:', err);
    }
  }
  
  // Apply unsharp mask for better detail (only if not vivid filter, which already sharpens)
  if (state.featureState.currentFilter !== 'vivid') {
    const imageData = ctx.getImageData(0, 0, outputW, outputH);
    sharpenImageData(imageData, 0.15); // Subtle sharpening
    ctx.putImageData(imageData, 0, 0);
  }

  if (state.settings.showData) drawDataOverlay(ctx, dom.canvas);
  if (state.settings.showCompass) drawCompassOverlay(ctx, dom.canvas);

  const logoOk = await ensureLogoLoaded(800);
  if (state.settings.watermark || logoOk) {
    addWatermarkToCanvas(ctx, visibleW, visibleH);
  }

  // Ensure high-quality JPEG output (minimum 0.92)
  const jpegQuality = Math.max(0.92, state.settings.imageQuality || 0.95);
  const blob = await canvasToJpegBlob(dom.canvas, jpegQuality);

  const photo = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    lat: state.currentLat,
    lon: state.currentLon,
    alt: state.currentAlt,
    heading: state.currentHeading,
    projectName: state.settings.projectName,
    location: state.settings.customLocation,
    comment: '',
    mime: blob.type || 'image/jpeg',
    filter: state.featureState.currentFilter
  };

  // CRITICAL FIX: Catch and handle IndexedDB errors with user-friendly messages
  try {
    await dbPutPhoto({ ...photo, blob });
    state.photos.push(photo);
    state.lastCapturedPhotoId = photo.id;
    onCaptured?.(photo);
    if (!state.featureState.burstMode) showStatus?.(t('photoCaptured'), 1500);
  } catch (err) {
    console.error('❌ Failed to save photo:', err);
    
    // User-friendly error based on error type
    if (err.message?.includes('Storage full') || err.message?.includes('QuotaExceeded')) {
      showStatus?.('❌ Storage full! Delete old photos to continue.', 5000);
      throw new Error('Storage full - photo not saved');
    } else {
      showStatus?.('❌ Failed to save photo: ' + (err.message || 'Unknown error'), 4000);
      throw err;
    }
  }
}

export async function performCapture(dom, { showStatus, onCaptured, onBurstUi } = {}) {
  console.log('📸 performCapture called');
  
  if (state.featureState.captureInProgress) {
    console.warn('Capture already in progress');
    return;
  }

  if (!state.videoStream) {
    console.error('❌ No video stream - camera not initialized');
    showStatus?.('❌ ' + t('videoNotReady'), 2500);
    return;
  }
  
  // CRITICAL FIX: Check storage quota before capture to prevent photo loss
  try {
    const quota = await checkStorageQuota({ showStatus });
    if (quota && quota.percentUsed > 95) {
      showStatus?.('❌ Storage full! Please delete photos to continue.', 5000);
      return;
    }
  } catch (e) {
    console.warn('Quota check failed, proceeding anyway:', e);
  }
  
  console.log('Starting capture...');

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
      await sleep(300);
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
  }, 1000);
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
