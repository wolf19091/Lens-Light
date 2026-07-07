import { state } from '../state.js';
import { showStatus } from '../core/status.js';
import { isDebugModeEnabled } from '../core/utils.js';
import { playBeep } from '../camera/audio.js';

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
  // Explicit entity escaping — the previous div.innerHTML trick does NOT
  // escape quotes, which allowed a crafted QR payload to break out of the
  // data-qr="..." attribute in the history markup.
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncateText(text, maxLength) {
  return text.length <= maxLength ? text : text.substring(0, maxLength) + '...';
}

function playSuccessBeep() {
  // Reuses the app-wide lazily-created AudioContext. Creating a fresh
  // AudioContext per scan (as before) leaked them — browsers cap live
  // contexts (~6), after which the beep silently stopped working.
  playBeep(SUCCESS_BEEP_HZ, SUCCESS_BEEP_DURATION_S, SUCCESS_BEEP_GAIN);
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
    rescan: () => {
      resultDiv.classList.add('is-hidden');
      resultDiv.style.display = 'none';
      scannerActive = true;
      startQRScan();
    }
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
  // The template ships the card with .is-hidden (display:none !important),
  // which an inline display value cannot override — remove it explicitly.
  resultDiv.classList.remove('is-hidden');
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

let qrScannerInitialized = false;

function ensureQRScannerDOM() {
  if (qrScannerInitialized) return true;
  
  const template = document.getElementById('qr-scanner-template');
  if (!template) return false;
  
  document.body.appendChild(template.content.cloneNode(true));
  qrScannerInitialized = true;
  
  const qrScanner = document.getElementById('qr-scanner');
  const closeBtn = document.getElementById('close-qr-scanner');
  
  bindFlashlightToggle();
  
  closeBtn.addEventListener('click', () => {
    stopScanning();
    qrScanner.setAttribute('aria-hidden', 'true');
    if (isDebugModeEnabled()) console.log('📷 QR Scanner closed');
  });

  qrScanner.addEventListener('click', (e) => {
    if (e.target === qrScanner) closeBtn.click();
  });
  
  return true;
}

export function initQRScanner(_dom) {
  const qrBtn = document.getElementById('qr-btn');

  if (!qrBtn) {
    console.warn('QR scanner UI elements not found');
    return;
  }

  if (typeof window.jsQR === 'undefined') {
    console.warn('⚠️ jsQR library not loaded - QR scanner disabled');
    disableScannerButton(qrBtn);
    return;
  }

  qrBtn.addEventListener('click', () => {
    if (!ensureQRScannerDOM()) return;
    
    const qrScanner = document.getElementById('qr-scanner');
    const resultDiv = document.getElementById('qr-result');
    
    qrScanner.setAttribute('aria-hidden', 'false');
    scannerActive = true;
    resultDiv.classList.add('is-hidden');
    resultDiv.style.display = 'none';
    resultDiv.textContent = '';
    updateHistoryDisplay();
    startQRScan();
    if (isDebugModeEnabled()) console.log('📷 QR Scanner opened');
  });
}
