import { state } from '../state.js';
import { showStatus } from '../core/status.js';
import { isDebugModeEnabled } from '../core/utils.js';

/**
 * QR scanner. Streams frames from the live camera into a hidden canvas and
 * delegates detection to `jsQR` (vendored at js/vendor/jsQR.min.js so the
 * scanner works fully offline). Maintains a 20-entry session history with
 * type-aware action buttons (copy/open/email/call/maps/share/rescan).
 */

const MAX_HISTORY = 20;
const VIBRATE_PATTERN_MS = [100, 50, 100];
const SUCCESS_BEEP_HZ = 1200;
const SUCCESS_BEEP_DURATION_S = 0.1;
const SUCCESS_BEEP_GAIN = 0.1;
const RESULT_TRUNCATE_CHARS = 100;
const HISTORY_TRUNCATE_CHARS = 40;
const HISTORY_DISPLAY_LIMIT = 5;

let scannerActive = false;
let animationId = null;
let scanHistory = [];

const QR_TYPE_PATTERNS = [
  ['URL', /^https?:\/\//i],
  ['Email', /^mailto:/i],
  ['Phone', /^tel:/i],
  ['Location', /^geo:/i],
  ['WiFi', /^wifi:/i]
];

function detectQRType(data) {
  for (const [label, pattern] of QR_TYPE_PATTERNS) {
    if (pattern.test(data)) return label;
  }
  if (data.startsWith('{') || data.startsWith('[')) return 'JSON';
  return 'Text';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncateText(text, maxLength) {
  return text.length <= maxLength ? text : text.substring(0, maxLength) + '...';
}

function playSuccessBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = SUCCESS_BEEP_HZ;
    gain.gain.value = SUCCESS_BEEP_GAIN;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + SUCCESS_BEEP_DURATION_S);
  } catch {
    // Ignore audio errors — non-critical UI cue.
  }
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    // Fallback for browsers without async clipboard API.
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  } catch (err) {
    console.error('Copy failed:', err);
  }
}

async function shareQRData(data) {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'QR Code Data', text: data });
      return;
    }
    await copyToClipboard(data);
    showStatus('📋 Copied to clipboard (share not available)');
  } catch (err) {
    if (err.name !== 'AbortError') console.error('Share failed:', err);
  }
}

function generateActions(_data, type) {
  const buttons = ['<button class="qr-action-btn" data-action="copy">📋 Copy</button>'];

  if (type === 'URL') buttons.push('<button class="qr-action-btn" data-action="open">🔗 Open Link</button>');
  else if (type === 'Email') buttons.push('<button class="qr-action-btn" data-action="email">📧 Email</button>');
  else if (type === 'Phone') buttons.push('<button class="qr-action-btn" data-action="call">📞 Call</button>');
  else if (type === 'Location') buttons.push('<button class="qr-action-btn" data-action="maps">🗺️ Maps</button>');

  buttons.push('<button class="qr-action-btn" data-action="share">📤 Share</button>');
  buttons.push('<button class="qr-action-btn" data-action="rescan">🔄 Scan Again</button>');
  return buttons.join('');
}

function buildActionHandlers(data, resultDiv) {
  return {
    copy: async () => { await copyToClipboard(data); showStatus('✅ Copied to clipboard'); },
    open: () => window.open(data, '_blank'),
    email: () => { window.location.href = data; },
    call: () => { window.location.href = data; },
    maps: () => window.open(data, '_blank'),
    share: () => shareQRData(data),
    rescan: () => { resultDiv.style.display = 'none'; startQRScan(); }
  };
}

function attachActionHandlers(resultDiv, data) {
  const handlers = buildActionHandlers(data, resultDiv);
  resultDiv.querySelectorAll('.qr-action-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const handler = handlers[btn.dataset.action];
      if (handler) await handler();
    });
  });
}

function pushToHistory(data, type) {
  if (scanHistory.some((item) => item.data === data)) return false;
  scanHistory.unshift({ data, timestamp: Date.now(), type });
  if (scanHistory.length > MAX_HISTORY) scanHistory = scanHistory.slice(0, MAX_HISTORY);
  return true;
}

function updateHistoryDisplay() {
  const historyContainer = document.getElementById('qr-history');
  if (!historyContainer) return;

  if (scanHistory.length === 0) {
    historyContainer.innerHTML = '<div class="qr-history-empty">No scan history yet</div>';
    return;
  }

  const historyHTML = scanHistory.slice(0, HISTORY_DISPLAY_LIMIT).map((item) => {
    const date = new Date(item.timestamp).toLocaleTimeString();
    return `
      <div class="qr-history-item" data-qr="${escapeHtml(item.data)}">
        <div class="qr-history-type">${item.type}</div>
        <div class="qr-history-data">${escapeHtml(truncateText(item.data, HISTORY_TRUNCATE_CHARS))}</div>
        <div class="qr-history-time">${date}</div>
      </div>
    `;
  }).join('');

  historyContainer.innerHTML = historyHTML;
  historyContainer.querySelectorAll('.qr-history-item').forEach((item) => {
    item.addEventListener('click', () => handleQRCodeDetected(item.dataset.qr));
  });
}

function stopScanning() {
  scannerActive = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

function handleQRCodeDetected(data) {
  const resultDiv = document.getElementById('qr-result');
  if (isDebugModeEnabled()) console.log('✅ QR Code detected:', data);

  if ('vibrate' in navigator) navigator.vibrate(VIBRATE_PATTERN_MS);

  const qrType = detectQRType(data);
  if (pushToHistory(data, qrType)) updateHistoryDisplay();

  resultDiv.innerHTML = `
    <div class="qr-result-header">
      <strong>✅ ${qrType} Detected</strong>
    </div>
    <div class="qr-result-data">${escapeHtml(truncateText(data, RESULT_TRUNCATE_CHARS))}</div>
    <div class="qr-result-actions">${generateActions(data, qrType)}</div>
  `;
  resultDiv.style.display = 'block';
  attachActionHandlers(resultDiv, data);

  state.lastQRCode = data;
  state.lastQRCodeTimestamp = Date.now();

  playSuccessBeep();
  stopScanning();
}

function startQRScan() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('qr-canvas');
  if (!video || !canvas || !scannerActive) return;

  const ctx = canvas.getContext('2d');

  function scan() {
    if (!scannerActive) return;

    if (video.videoWidth && video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // jsQR availability is gated upfront in initQRScanner — safe to call.
      const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });

      if (code) {
        handleQRCodeDetected(code.data);
        return;
      }
    }

    animationId = requestAnimationFrame(scan);
  }

  scan();
}

function bindFlashlightToggle() {
  const flashlightToggle = document.getElementById('qr-flashlight-toggle');
  if (!flashlightToggle) return;

  flashlightToggle.addEventListener('click', async () => {
    const video = document.getElementById('video');
    const track = video?.srcObject?.getVideoTracks()[0];
    if (!track || !('torch' in track.getCapabilities())) return;

    const currentTorch = track.getSettings().torch || false;
    await track.applyConstraints({ advanced: [{ torch: !currentTorch }] });
    flashlightToggle.classList.toggle('active', !currentTorch);
  });
}

function disableScannerButton(qrBtn) {
  qrBtn.disabled = true;
  qrBtn.title = 'QR Scanner unavailable (library blocked)';
  qrBtn.style.opacity = '0.5';
}

export function initQRScanner(_dom) {
  const qrScanner = document.getElementById('qr-scanner');
  const qrBtn = document.getElementById('qr-btn');
  const closeBtn = document.getElementById('close-qr-scanner');
  const resultDiv = document.getElementById('qr-result');

  if (!qrScanner || !qrBtn || !closeBtn) {
    console.warn('QR scanner UI elements not found');
    return;
  }

  if (typeof window.jsQR === 'undefined') {
    console.warn('⚠️ jsQR library not loaded - QR scanner disabled');
    if (qrBtn) disableScannerButton(qrBtn);
    return;
  }

  bindFlashlightToggle();

  qrBtn.addEventListener('click', () => {
    qrScanner.setAttribute('aria-hidden', 'false');
    scannerActive = true;
    resultDiv.style.display = 'none';
    resultDiv.textContent = '';
    updateHistoryDisplay();
    startQRScan();
    if (isDebugModeEnabled()) console.log('📷 QR Scanner opened');
  });

  closeBtn.addEventListener('click', () => {
    stopScanning();
    qrScanner.setAttribute('aria-hidden', 'true');
    if (isDebugModeEnabled()) console.log('📷 QR Scanner closed');
  });

  qrScanner.addEventListener('click', (e) => {
    if (e.target === qrScanner) closeBtn.click();
  });
}

export function getLastQRCode() {
  return { data: state.lastQRCode, timestamp: state.lastQRCodeTimestamp };
}

export function clearQRCode() {
  state.lastQRCode = null;
  state.lastQRCodeTimestamp = null;
}

export const getScanHistory = () => scanHistory;

export function clearScanHistory() {
  scanHistory = [];
  updateHistoryDisplay();
}
