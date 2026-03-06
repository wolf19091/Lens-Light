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
// The logo is at the app root: /logo-max-ar-inv.svg
logoImg.src = new URL('../../../logo-max-ar-inv.svg', import.meta.url).href;

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

function traceRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.save();
  ctx.fillStyle = fillStyle;
  traceRoundedRect(ctx, x, y, width, height, radius);
  ctx.fill();
  ctx.restore();
}

function createSeededRandom(seedA = 0, seedB = 0) {
  let seed = (
    (Math.abs(Math.round(seedA * 1e6)) * 2654435761) ^
    Math.abs(Math.round(seedB * 1e6)) ^
    0x9e3779b9
  ) >>> 0;

  if (!seed) seed = 0x12345678;

  return function next() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function wrapTextIntoLines(ctx, text, maxWidth, maxLines = 2) {
  const value = String(text || '').trim();
  if (!value) return [];

  const words = value.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const trial = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth || !currentLine) {
      currentLine = trial;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;

    if (lines.length === maxLines - 1) break;
  }

  if (currentLine) {
    let finalLine = currentLine;
    const usedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
    const hasOverflow = usedWords < words.length;

    if (hasOverflow) {
      const remaining = words.slice(usedWords).join(' ');
      finalLine = finalLine ? `${finalLine} ${remaining}` : remaining;
    }

    while (ctx.measureText(`${finalLine}...`).width > maxWidth && finalLine.length > 1) {
      finalLine = finalLine.slice(0, -1).trimEnd();
    }

    if (hasOverflow && finalLine) {
      finalLine = `${finalLine}...`;
    }

    lines.push(finalLine);
  }

  return lines.slice(0, maxLines);
}

function drawTextLines(ctx, lines, x, startY, lineHeight) {
  let y = startY;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function getCaptureText() {
  if (state.currentLang === 'ar') {
    return {
      badgeSubtitle: '\u0643\u0627\u0645\u064a\u0631\u0627 \u0645\u0633\u062d',
      defaultLabel: '\u062a\u0642\u0631\u064a\u0631 \u0645\u064a\u062f\u0627\u0646\u064a',
      gpsReady: '\u0627\u0644\u0645\u0648\u0642\u0639 \u0645\u062a\u0627\u062d',
      gpsMissing: 'GPS \u063a\u064a\u0631 \u0645\u062a\u0627\u062d',
      fallbackTitle: '\u0627\u0644\u062a\u0642\u0627\u0637 \u0645\u064a\u062f\u0627\u0646\u064a',
      projectLabel: '\u0627\u0644\u0645\u0634\u0631\u0648\u0639',
      coordsLabel: '\u0627\u0644\u0625\u062d\u062f\u0627\u062b\u064a\u0627\u062a',
      timeLabel: '\u0627\u0644\u0648\u0642\u062a',
      noteLabel: '\u0645\u0644\u0627\u062d\u0638\u0629',
      noteValue: '\u062a\u0645 \u0627\u0644\u062a\u0642\u0627\u0637\u0647 \u0628\u0648\u0627\u0633\u0637\u0629 Lens Light',
      mapLabel: '\u062e\u0631\u064a\u0637\u0629 GPS',
      noMap: '\u0644\u0627 \u064a\u0648\u062c\u062f \u0625\u062d\u062f\u0627\u062b\u064a\u0627\u062a',
      altitudeLabel: '\u0627\u0644\u0627\u0631\u062a\u0641\u0627\u0639',
      headingLabel: '\u0627\u0644\u0627\u062a\u062c\u0627\u0647',
      accuracyLabel: '\u0627\u0644\u062f\u0642\u0629',
      weatherLabel: '\u0627\u0644\u0637\u0642\u0633',
      filterLabel: '\u0627\u0644\u0645\u0631\u0634\u062d'
    };
  }

  return {
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
    altitudeLabel: 'Altitude',
    headingLabel: 'Heading',
    accuracyLabel: 'Accuracy',
    weatherLabel: 'Weather',
    filterLabel: 'Filter'
  };
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getLocalOffsetLabel(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `GMT${sign}${pad2(hours)}:${pad2(minutes)}`;
}

function formatLocalIsoStamp(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())} ${getLocalOffsetLabel(date)}`;
}

function formatCaptureTimestamp(date = new Date()) {
  const format = state.settings.timestampFormat || 'iso';

  switch (format) {
    case 'us':
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(date);
    case 'eu':
      return new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(date);
    case 'arabic':
      return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-arab', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(date);
    case 'iso':
    default:
      return formatLocalIsoStamp(date);
  }
}

function getCardinalDirection(heading) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(heading / 45) % 8];
}

function hasGpsFix() {
  return Number.isFinite(state.currentLat) &&
    Number.isFinite(state.currentLon) &&
    (state.currentLat !== 0 || state.currentLon !== 0);
}

function formatHeadingValue() {
  if (!state.orientationListenerActive || !Number.isFinite(state.currentHeading)) return '--';
  const normalized = ((state.currentHeading % 360) + 360) % 360;
  return `${Math.round(normalized)}\u00b0 ${getCardinalDirection(normalized)}`;
}

function formatAccuracy(accuracyMeters) {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0) {
    return state.settings.units === 'imperial' ? '-- ft' : '-- m';
  }

  if (state.settings.units === 'imperial') {
    return `${Math.round(accuracyMeters * 3.28084)} ft`;
  }

  return `${Math.round(accuracyMeters)} m`;
}

function buildWeatherChip(text) {
  if (state.weatherData?.temp === null || state.weatherData?.temp === undefined) return '';

  const temperature = Math.round(state.weatherData.temp);
  const tempUnit = state.settings.units === 'imperial' ? '\u00b0F' : '\u00b0C';
  const description = state.weatherData.description ? ` ${state.weatherData.description}` : '';
  return `${text.weatherLabel} ${temperature}${tempUnit}${description}`;
}

function drawMetricChip(ctx, x, y, label, height, options = {}) {
  const {
    fill = 'rgba(255, 255, 255, 0.12)',
    stroke = 'rgba(255, 255, 255, 0.16)',
    textColor = 'rgba(246, 248, 251, 0.96)'
  } = options;

  const horizontalPadding = height * 0.55;
  const chipWidth = ctx.measureText(label).width + horizontalPadding * 2;

  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  traceRoundedRect(ctx, x, y, chipWidth, height, height / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + horizontalPadding, y + height / 2);
  ctx.restore();

  return chipWidth;
}

function drawMiniMapTile(ctx, x, y, size, cornerRadius, labelText) {
  const random = createSeededRandom(state.currentLat, state.currentLon);

  ctx.save();
  traceRoundedRect(ctx, x, y, size, size, cornerRadius);
  ctx.clip();

  const background = ctx.createLinearGradient(x, y, x + size, y + size);
  background.addColorStop(0, '#e9dfb6');
  background.addColorStop(0.48, '#c9c198');
  background.addColorStop(1, '#97b07b');
  ctx.fillStyle = background;
  ctx.fillRect(x, y, size, size);

  for (let i = 0; i < 8; i += 1) {
    const fieldX = x + random() * size * 0.82;
    const fieldY = y + random() * size * 0.82;
    const fieldW = size * (0.12 + random() * 0.22);
    const fieldH = size * (0.08 + random() * 0.18);
    const fill = random() > 0.55 ? 'rgba(91, 125, 66, 0.35)' : 'rgba(197, 185, 138, 0.42)';
    ctx.fillStyle = fill;
    ctx.fillRect(fieldX, fieldY, fieldW, fieldH);
  }

  ctx.strokeStyle = 'rgba(246, 239, 213, 0.88)';
  ctx.lineCap = 'round';

  for (let i = 0; i < 3; i += 1) {
    ctx.lineWidth = size * (0.035 + random() * 0.02);
    ctx.beginPath();
    ctx.moveTo(x - size * 0.05, y + size * (0.12 + random() * 0.76));
    ctx.lineTo(x + size * 1.05, y + size * (0.08 + random() * 0.82));
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(63, 92, 52, 0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 10; i += 1) {
    const rowY = y + size * (0.1 + i * 0.075);
    ctx.beginPath();
    ctx.moveTo(x + size * 0.08, rowY);
    ctx.lineTo(x + size * 0.92, rowY + size * 0.04);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(10, 28, 48, 0.72)';
  ctx.fillRect(x, y + size * 0.74, size, size * 0.26);

  ctx.font = `700 ${Math.max(size * 0.08, 12)}px 'Segoe UI', Tahoma, sans-serif`;
  ctx.fillStyle = 'rgba(247, 250, 255, 0.94)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(labelText, x + size * 0.08, y + size * 0.87);

  if (hasGpsFix()) {
    const pinX = x + size * (0.22 + (Math.abs(state.currentLon * 10) % 1) * 0.56);
    const pinY = y + size * (0.18 + (Math.abs(state.currentLat * 10) % 1) * 0.5);
    const pinRadius = size * 0.08;

    ctx.save();
    ctx.shadowColor = 'rgba(118, 12, 16, 0.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#e44747';
    ctx.beginPath();
    ctx.arc(pinX, pinY, pinRadius, Math.PI, 0);
    ctx.quadraticCurveTo(pinX + pinRadius, pinY + pinRadius * 0.9, pinX, pinY + pinRadius * 2.25);
    ctx.quadraticCurveTo(pinX - pinRadius, pinY + pinRadius * 0.9, pinX - pinRadius, pinY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.beginPath();
    ctx.arc(pinX, pinY, pinRadius * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.font = `600 ${Math.max(size * 0.075, 11)}px 'Segoe UI', Tahoma, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.textAlign = 'center';
    ctx.fillText(getCaptureText().noMap, x + size / 2, y + size * 0.45);
  }

  ctx.restore();

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
  traceRoundedRect(ctx, x, y, size, size, cornerRadius);
  ctx.stroke();
  ctx.restore();
}

function addWatermarkToCanvas(ctx, width) {
  const badgeHeight = clamp(width * 0.075, 52, 82);
  const badgeWidth = clamp(width * 0.34, 210, 420);
  const margin = Math.max(width * 0.03, 22);
  const iconBox = badgeHeight - 14;
  const text = getCaptureText();

  ctx.save();
  ctx.shadowColor = 'rgba(5, 14, 28, 0.3)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;

  const badgeFill = ctx.createLinearGradient(margin, margin, margin + badgeWidth, margin + badgeHeight);
  badgeFill.addColorStop(0, 'rgba(8, 22, 40, 0.88)');
  badgeFill.addColorStop(1, 'rgba(18, 56, 92, 0.74)');
  fillRoundedRect(ctx, margin, margin, badgeWidth, badgeHeight, badgeHeight / 2, badgeFill);

  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  traceRoundedRect(ctx, margin, margin, badgeWidth, badgeHeight, badgeHeight / 2);
  ctx.stroke();
  ctx.restore();

  if (logoImg.naturalWidth > 0) {
    ctx.save();
    ctx.drawImage(logoImg, margin + 7, margin + 7, iconBox, iconBox);
    ctx.restore();
  }

  const textX = margin + iconBox + 18;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(247, 250, 255, 0.97)';
  ctx.font = `800 ${Math.max(badgeHeight * 0.28, 18)}px 'Segoe UI', Tahoma, sans-serif`;
  ctx.fillText('LENS LIGHT', textX, margin + badgeHeight * 0.5);
  ctx.fillStyle = 'rgba(197, 228, 255, 0.84)';
  ctx.font = `600 ${Math.max(badgeHeight * 0.18, 12)}px 'Segoe UI', Tahoma, sans-serif`;
  ctx.fillText(text.badgeSubtitle, textX, margin + badgeHeight * 0.78);
  ctx.restore();
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
  if (!Number.isFinite(altMeters)) return state.settings.units === 'imperial' ? '-- ft' : '-- m';
  if (state.settings.units === 'imperial') return `${Math.round(altMeters * 3.28084)} ft`;
  return `${Math.round(altMeters)} m`;
}

function drawDataOverlay(ctx, canvas) {
  // Scale font size appropriately for output resolution
  const fontSize = Math.max(Math.min(canvas.width / 48, 26), 15);
  const padding = fontSize * 1.5;
  const lineHeight = fontSize * 1.6;

  const panelWidth = Math.min(canvas.width * 0.52, canvas.width - padding * 2);
  const panelHeight = lineHeight * 8.2; // Increased to fit weather info
  const x = canvas.width - panelWidth - padding * 0.8;
  const y = canvas.height - panelHeight - padding * 0.8;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 24, 58, 0.92)';
  ctx.strokeStyle = 'rgba(230, 232, 235, 0.3)';
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
  ctx.font = `600 ${fontSize}px 'SE Heartbeat', 'Segoe UI', Roboto, sans-serif`;
  ctx.fillStyle = 'rgba(242, 243, 245, 1.0)';
  ctx.textAlign = 'left';
  
  // No shadow - crisp text on dark background
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const now = new Date();
  let yy = y + padding * 0.9;
  const project = state.settings.projectName ? `Project: ${state.settings.projectName}` : '';
  
  // Build weather string if available
  let weatherStr = '';
  if (state.weatherData?.temp !== null && state.weatherData?.temp !== undefined) {
    const tempUnit = state.settings.units === 'imperial' ? '°F' : '°C';
    const temp = Math.round(state.weatherData.temp);
    weatherStr = `Weather: ${temp}${tempUnit}`;
    if (state.weatherData.description) {
      weatherStr += ` ${state.weatherData.description}`;
    }
  }

  const lines = [
    project,
    `Time: ${now.toLocaleString(state.currentLang === 'ar' ? 'ar' : 'en-GB', { hour12: false })}`,
    state.currentLat && state.currentLon ? `GPS: ${state.currentLat.toFixed(6)}, ${state.currentLon.toFixed(6)}` : 'GPS: --',
    `Alt: ${formatAltitude(state.currentAlt)}`,
    `Heading: ${Math.round(state.currentHeading)}°`,
    state.settings.customLocation ? `Loc: ${state.settings.customLocation}` : '',
    weatherStr
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
  ctx.fillStyle = 'rgba(0, 24, 58, 0.78)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(230, 232, 235, 0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.translate(cx, cy);
  ctx.rotate((state.currentHeading * Math.PI) / 180);

  ctx.beginPath();
  ctx.moveTo(0, -r * 0.75);
  ctx.lineTo(-r * 0.12, 0);
  ctx.lineTo(r * 0.12, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 255, 134, 0.95)';
  ctx.fill();

  ctx.restore();
}

function drawReportOverlay(ctx, canvas) {
  const text = getCaptureText();
  const isRtl = state.currentLang === 'ar';
  const margin = Math.max(canvas.width * 0.03, 22);
  const cardWidth = canvas.width - margin * 2;
  const cardHeight = clamp(canvas.height * 0.24, 180, canvas.height * 0.32);
  const cardX = margin;
  const cardY = canvas.height - cardHeight - margin;
  const innerPadding = clamp(cardWidth * 0.028, 18, 34);
  const mapSize = cardHeight - innerPadding * 2;
  const gap = clamp(cardWidth * 0.02, 16, 26);
  const mapX = isRtl ? cardX + cardWidth - innerPadding - mapSize : cardX + innerPadding;
  const mapY = cardY + innerPadding;
  const textStartX = isRtl ? cardX + innerPadding : mapX + mapSize + gap;
  const textEndX = isRtl ? mapX - gap : cardX + cardWidth - innerPadding;
  const textWidth = Math.max(80, textEndX - textStartX);
  const textAnchorX = isRtl ? textEndX : textStartX;
  const accentX = isRtl ? cardX + cardWidth - 8 : cardX;

  const baseSize = clamp(canvas.width / 46, 15, 26);
  const eyebrowSize = baseSize * 0.72;
  const titleSize = baseSize * 1.36;
  const bodySize = baseSize * 0.82;
  const smallSize = baseSize * 0.72;
  const titleLineHeight = titleSize * 1.08;
  const bodyLineHeight = bodySize * 1.3;
  const smallLineHeight = smallSize * 1.3;

  const overline = state.settings.projectName
    ? `${text.projectLabel}: ${state.settings.projectName}`
    : (hasGpsFix() ? text.gpsReady : text.gpsMissing);
  const titleText = state.settings.customLocation || state.settings.projectName || text.fallbackTitle;
  const coordinatesText = hasGpsFix()
    ? `${state.currentLat.toFixed(6)}, ${state.currentLon.toFixed(6)}`
    : '--';
  const timestampText = formatCaptureTimestamp(new Date());
  const headingText = formatHeadingValue();
  const noteText = state.featureState.currentFilter && state.featureState.currentFilter !== 'normal'
    ? `${text.noteValue} | ${text.filterLabel}: ${String(state.featureState.currentFilter).toUpperCase()}`
    : text.noteValue;

  const chips = [
    buildWeatherChip(text),
    `${text.altitudeLabel} ${formatAltitude(state.currentAlt)}`,
    `${text.headingLabel} ${headingText}`,
    `${text.accuracyLabel} ${formatAccuracy(state.currentAccuracy)}`
  ].filter(Boolean);

  const titleLines = (() => {
    ctx.save();
    ctx.font = `800 ${titleSize}px 'Segoe UI', Tahoma, sans-serif`;
    const wrapped = wrapTextIntoLines(ctx, titleText, textWidth, 2);
    ctx.restore();
    return wrapped;
  })();

  ctx.save();
  const glow = ctx.createLinearGradient(0, cardY - cardHeight * 0.7, 0, canvas.height);
  glow.addColorStop(0, 'rgba(5, 14, 24, 0)');
  glow.addColorStop(1, 'rgba(5, 14, 24, 0.54)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, cardY - cardHeight * 0.7, canvas.width, canvas.height - cardY + cardHeight * 0.7);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = 'rgba(4, 10, 22, 0.32)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 8;
  const cardFill = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY + cardHeight);
  cardFill.addColorStop(0, 'rgba(7, 20, 36, 0.88)');
  cardFill.addColorStop(0.55, 'rgba(11, 33, 58, 0.84)');
  cardFill.addColorStop(1, 'rgba(18, 54, 89, 0.76)');
  fillRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 28, cardFill);
  ctx.restore();

  ctx.save();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  traceRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 28);
  ctx.stroke();
  fillRoundedRect(ctx, accentX, cardY, 8, cardHeight, 6, 'rgba(255, 186, 78, 0.96)');
  ctx.restore();

  drawMiniMapTile(ctx, mapX, mapY, mapSize, 22, text.mapLabel);

  ctx.save();
  ctx.textAlign = isRtl ? 'right' : 'left';
  ctx.textBaseline = 'top';

  let cursorY = cardY + innerPadding * 0.88;

  ctx.fillStyle = 'rgba(255, 191, 103, 0.96)';
  ctx.font = `800 ${eyebrowSize}px 'Segoe UI', Tahoma, sans-serif`;
  ctx.fillText(overline, textAnchorX, cursorY);
  cursorY += eyebrowSize * 1.55;

  ctx.fillStyle = 'rgba(247, 250, 255, 0.98)';
  ctx.font = `800 ${titleSize}px 'Segoe UI', Tahoma, sans-serif`;
  cursorY = drawTextLines(ctx, titleLines, textAnchorX, cursorY, titleLineHeight);
  cursorY += bodySize * 0.18;

  ctx.fillStyle = 'rgba(212, 228, 245, 0.96)';
  ctx.font = `600 ${bodySize}px 'Segoe UI', Tahoma, sans-serif`;
  const coordsLines = wrapTextIntoLines(ctx, `${text.coordsLabel}: ${coordinatesText}`, textWidth, 1);
  cursorY = drawTextLines(ctx, coordsLines, textAnchorX, cursorY, bodyLineHeight);
  cursorY += bodySize * 0.35;

  ctx.font = `700 ${smallSize}px 'Segoe UI', Tahoma, sans-serif`;
  let chipX = isRtl ? textEndX : textStartX;
  let chipY = cursorY;
  const chipHeight = smallSize * 2;
  const chipGap = smallSize * 0.6;

  for (const label of chips) {
    const widthEstimate = ctx.measureText(label).width + chipHeight * 1.1;
    const nextEdge = isRtl ? chipX - widthEstimate : chipX + widthEstimate;
    const exceedsRow = isRtl ? nextEdge < textStartX : nextEdge > textEndX;

    if (exceedsRow) {
      chipY += chipHeight + chipGap * 0.7;
      chipX = isRtl ? textEndX : textStartX;
    }

    const chipDrawX = isRtl ? chipX - widthEstimate : chipX;
    const chipWidth = drawMetricChip(ctx, chipDrawX, chipY, label, chipHeight);
    chipX = isRtl ? chipDrawX - chipGap : chipDrawX + chipWidth + chipGap;
  }

  const footerStartY = cardY + cardHeight - innerPadding - smallLineHeight * 2.3;
  ctx.fillStyle = 'rgba(214, 226, 241, 0.92)';
  ctx.font = `600 ${smallSize}px 'Segoe UI', Tahoma, sans-serif`;
  const timeLines = wrapTextIntoLines(ctx, `${text.timeLabel}: ${timestampText}`, textWidth, 1);
  drawTextLines(ctx, timeLines, textAnchorX, footerStartY, smallLineHeight);

  ctx.fillStyle = 'rgba(194, 213, 232, 0.9)';
  const noteLines = wrapTextIntoLines(ctx, `${text.noteLabel}: ${noteText}`, textWidth, 1);
  drawTextLines(ctx, noteLines, textAnchorX, footerStartY + smallLineHeight * 1.1, smallLineHeight);
  ctx.restore();
}

function drawCompassBadgeOverlay(ctx, canvas) {
  const badgeHeight = clamp(Math.min(canvas.width, canvas.height) * 0.08, 46, 70);
  const margin = Math.max(canvas.width * 0.03, 22);
  const headingLabel = formatHeadingValue();
  const label = headingLabel === '--' ? 'Heading --' : headingLabel;

  ctx.save();
  ctx.font = `700 ${badgeHeight * 0.28}px 'Segoe UI', Tahoma, sans-serif`;
  const labelWidth = ctx.measureText(label).width;
  const badgeWidth = badgeHeight + labelWidth + badgeHeight * 1.2;
  const x = canvas.width - margin - badgeWidth;
  const y = margin;
  const circleSize = badgeHeight - 12;
  const circleX = x + 6;
  const circleY = y + 6;
  const circleRadius = circleSize / 2;

  ctx.shadowColor = 'rgba(5, 14, 28, 0.26)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;

  const fill = ctx.createLinearGradient(x, y, x + badgeWidth, y + badgeHeight);
  fill.addColorStop(0, 'rgba(8, 22, 40, 0.84)');
  fill.addColorStop(1, 'rgba(15, 47, 78, 0.72)');
  fillRoundedRect(ctx, x, y, badgeWidth, badgeHeight, badgeHeight / 2, fill);

  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  traceRoundedRect(ctx, x, y, badgeWidth, badgeHeight, badgeHeight / 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.arc(circleX + circleRadius, circleY + circleRadius, circleRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(circleX + circleRadius, circleY + circleRadius, circleRadius * 0.78, 0, Math.PI * 2);
  ctx.stroke();

  ctx.translate(circleX + circleRadius, circleY + circleRadius);
  if (state.orientationListenerActive && Number.isFinite(state.currentHeading)) {
    ctx.rotate((state.currentHeading * Math.PI) / 180);
  }

  ctx.beginPath();
  ctx.moveTo(0, -circleRadius * 0.64);
  ctx.lineTo(circleRadius * 0.17, 0);
  ctx.lineTo(-circleRadius * 0.17, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 126, 96, 0.96)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, circleRadius * 0.64);
  ctx.lineTo(circleRadius * 0.15, 0);
  ctx.lineTo(-circleRadius * 0.15, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(120, 199, 255, 0.88)';
  ctx.fill();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(246, 249, 253, 0.96)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${badgeHeight * 0.28}px 'Segoe UI', Tahoma, sans-serif`;
  ctx.fillText(label, x + circleSize + 16, y + badgeHeight / 2);
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

  // Use actual video stream dimensions (native resolution)
  const vw = dom.video.videoWidth;
  const vh = dom.video.videoHeight;
  
  // Get viewport aspect ratio (what user sees due to object-fit: cover)
  const viewportWidth = dom.video.clientWidth || window.innerWidth;
  const viewportHeight = dom.video.clientHeight || window.innerHeight;
  const viewportRatio = viewportWidth / viewportHeight;
  const videoRatio = vw / vh;
  const zoom = state.zoomLevel || 1.0;

  // Calculate which part of the video is visible (object-fit: cover logic)
  // This determines the "visible frame" before zoom is applied
  let visibleWidth, visibleHeight, offsetX, offsetY;
  
  if (videoRatio > viewportRatio) {
    // Video is wider - height fills viewport, width is cropped
    visibleHeight = vh;
    visibleWidth = vh * viewportRatio;
    offsetX = (vw - visibleWidth) / 2;
    offsetY = 0;
  } else {
    // Video is taller - width fills viewport, height is cropped
    visibleWidth = vw;
    visibleHeight = vw / viewportRatio;
    offsetX = 0;
    offsetY = (vh - visibleHeight) / 2;
  }

  // Apply digital zoom (center-crop within the visible area)
  const zoomedWidth = visibleWidth / zoom;
  const zoomedHeight = visibleHeight / zoom;
  
  // Calculate source rectangle (center-crop)
  const sx = offsetX + (visibleWidth - zoomedWidth) / 2;
  const sy = offsetY + (visibleHeight - zoomedHeight) / 2;

  // Set output canvas to match the aspect ratio of viewport
  // Use the actual video resolution as base, clamped to reasonable max
  const maxDimension = 2400; // Max 2400px on long edge for quality/filesize balance
  let outputWidth, outputHeight;
  
  if (viewportRatio > 1) {
    // Landscape
    outputWidth = Math.min(maxDimension, zoomedWidth);
    outputHeight = outputWidth / viewportRatio;
  } else {
    // Portrait or square
    outputHeight = Math.min(maxDimension, zoomedHeight);
    outputWidth = outputHeight * viewportRatio;
  }
  
  dom.canvas.width = Math.round(outputWidth);
  dom.canvas.height = Math.round(outputHeight);
  
  if (localStorage.getItem('debug_mode') === 'true') {
    console.log('📸 Capture:', {
      video: `${vw}x${vh} (${videoRatio.toFixed(2)})`,
      viewport: `${viewportWidth}x${viewportHeight} (${viewportRatio.toFixed(2)})`,
      visible: `${visibleWidth.toFixed(0)}x${visibleHeight.toFixed(0)}`,
      crop: `${zoomedWidth.toFixed(0)}x${zoomedHeight.toFixed(0)} at (${sx.toFixed(0)},${sy.toFixed(0)})`,
      output: `${dom.canvas.width}x${dom.canvas.height}`,
      zoom: `${zoom}x`
    });
  }

  // Draw the cropped video frame to canvas (single-pass for crisp output)
  // Enable high-quality smoothing only if we're downscaling
  const isDownscaling = (zoomedWidth > dom.canvas.width) || (zoomedHeight > dom.canvas.height);
  ctx.imageSmoothingEnabled = isDownscaling;
  ctx.imageSmoothingQuality = isDownscaling ? 'high' : 'medium';

  // Build filter chain for canvas rendering
  const brightnessVal = 1 + state.featureState.exposureValue * 0.18;
  const filterCss = cssForFilter(state.featureState.currentFilter);
  const filterParts = [];
  
  if (filterCss) {
    filterParts.push(filterCss);
  } else {
     // Subtle enhancement for normal mode
     filterParts.push('contrast(1.02) saturate(1.05)');
  }

  if (brightnessVal !== 1) {
    filterParts.push(`brightness(${brightnessVal})`);
  }
  
  if (filterParts.length > 0) {
    ctx.filter = filterParts.join(' ');
  }

  // Single drawImage call: source crop -> destination canvas (no intermediate scaling)
  ctx.drawImage(
    dom.video,
    sx, sy, zoomedWidth, zoomedHeight,  // Source rectangle (cropped region)
    0, 0, dom.canvas.width, dom.canvas.height  // Destination (full canvas)
  );
  
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
    const imageData = ctx.getImageData(0, 0, dom.canvas.width, dom.canvas.height);
    sharpenImageData(imageData, 0.15); // Subtle sharpening
    ctx.putImageData(imageData, 0, 0);
  }

  if (state.settings.showData) drawReportOverlay(ctx, dom.canvas);
  if (state.settings.showCompass) drawCompassBadgeOverlay(ctx, dom.canvas);

  const logoOk = await ensureLogoLoaded(800);
  if (state.settings.watermark || logoOk) {
    addWatermarkToCanvas(ctx, dom.canvas.width);
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
