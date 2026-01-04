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

async function ensureVideoReady(video, timeoutMs = 2500) {
  if (!video) return false;
  if (video.videoWidth && video.videoHeight) return true;

  try {
    // Some browsers require an explicit play() after setting srcObject.
    await video.play();
  } catch {
    // ignore
  }

  return await new Promise((resolve) => {
    let resolved = false;
    const finish = (ok) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timerId);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('canplay', onReady);
      resolve(ok);
    };

    const onReady = () => finish(Boolean(video.videoWidth && video.videoHeight));
    const timerId = setTimeout(() => finish(false), timeoutMs);

    video.addEventListener('loadedmetadata', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
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

  if (dom?.shutterBtn) dom.shutterBtn.disabled = true;

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
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraintsExact);
    } catch (e1) {
      lastError = e1;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraintsIdeal);
      } catch (e2) {
        lastError = e2;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
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
    if (dom?.shutterBtn) dom.shutterBtn.disabled = !ready;
    showStatus?.(ready ? t('cameraReady') : '⚠️ ' + t('videoNotReady'), ready ? 2000 : 3000);

    applyPreviewEffects(dom);
    return ready;
  } catch (e) {
    if (e?.name === 'NotFoundError' || e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
      console.warn('initCamera failed', e);
    } else {
      console.error('initCamera failed', e);
    }
    if (dom?.shutterBtn) dom.shutterBtn.disabled = true;

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
  const fontSize = Math.max(16, width * 0.018);
  const padding = fontSize * 1.2;
  const logoSize = Math.max(50, width * 0.08);

  if (logoImg.naturalWidth > 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 12;
    ctx.drawImage(logoImg, padding, padding, logoSize, logoSize);
    ctx.restore();

    ctx.font = `700 ${fontSize * 1.2}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'left';
    ctx.fillText('LENS LIGHT', padding + logoSize + fontSize * 0.7, padding + logoSize / 2 + fontSize * 0.35);
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

export function formatAltitude(altMeters) {
  if (!altMeters || !Number.isFinite(altMeters)) return state.settings.units === 'imperial' ? '-- ft' : '-- m';
  if (state.settings.units === 'imperial') return `${Math.round(altMeters * 3.28084)} ft`;
  return `${Math.round(altMeters)} m`;
}

function drawDataOverlay(ctx, canvas) {
  const fontSize = Math.max(canvas.width / 40, 16);
  const padding = fontSize * 1.2;
  const lineHeight = fontSize * 1.4;

  const panelWidth = canvas.width * 0.46;
  const panelHeight = lineHeight * 6.5;
  const x = canvas.width - panelWidth - padding;
  const y = canvas.height - panelHeight - padding;

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;

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

  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textAlign = 'left';

  const now = new Date();
  let yy = y + padding + fontSize;
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
  if (!dom.video.videoWidth || !dom.video.videoHeight) {
    const ready = await ensureVideoReady(dom.video);
    if (!ready) throw new Error(t('videoNotReady'));
  }
  if (!dom?.canvas) {
    throw new Error('Canvas missing');
  }

  const ctx = dom.canvas.getContext('2d', { alpha: false });

  playCameraShutter();

  if (dom?.flash) {
    dom.flash.classList.add('active');
    setTimeout(() => dom.flash.classList.remove('active'), 350);
  }

  const vw = dom.video.videoWidth;
  const vh = dom.video.videoHeight;
  dom.canvas.width = vw;
  dom.canvas.height = vh;

  ctx.drawImage(dom.video, 0, 0, vw, vh);

  if (state.featureState.currentFilter !== 'normal' || state.featureState.exposureValue !== 0) {
    const imageData = ctx.getImageData(0, 0, vw, vh);
    applyFilterToImageData(imageData, state.featureState.currentFilter);
    ctx.putImageData(imageData, 0, 0);
  }

  if (state.settings.showData) drawDataOverlay(ctx, dom.canvas);
  if (state.settings.showCompass) drawCompassOverlay(ctx, dom.canvas);

  const logoOk = await ensureLogoLoaded(800);
  if (state.settings.watermark || logoOk) {
    addWatermarkToCanvas(ctx, vw, vh);
  }

  const blob = await canvasToJpegBlob(dom.canvas, state.settings.imageQuality);

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

  await dbPutPhoto({ ...photo, blob });
  state.photos.push(photo);
  state.lastCapturedPhotoId = photo.id;

  onCaptured?.(photo);

  if (!state.featureState.burstMode) showStatus?.(t('photoCaptured'), 1500);
}

export async function performCapture(dom, { showStatus, onCaptured, onBurstUi } = {}) {
  if (state.featureState.captureInProgress) return;

  if (!state.videoStream) {
    showStatus?.('❌ ' + t('videoNotReady'), 2500);
    return;
  }

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
