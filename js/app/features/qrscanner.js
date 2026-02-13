import { state } from '../state.js';
import * as statusModule from '../core/status.js';

function showStatus(message, duration = 2500) {
    if (typeof statusModule.showStatus === 'function') {
        statusModule.showStatus(message, duration);
        return;
    }
    const statusEl = document.getElementById('status-msg');
    if (!statusEl) return;
    statusEl.textContent = String(message);
    statusEl.classList.add('show');
    setTimeout(() => statusEl.classList.remove('show'), duration);
}

/**
 * QR Code Scanner Feature
 * Scans QR codes from the camera feed for equipment IDs or location markers
 * Enhanced with history, actions, and improved UX
 */

let scannerActive = false;
let animationId = null;
let scanHistory = [];
const MAX_HISTORY = 20;

export function initQRScanner(dom) {
    const qrScanner = document.getElementById('qr-scanner');
    const qrBtn = document.getElementById('qr-btn');
    const closeBtn = document.getElementById('close-qr-scanner');
    const resultDiv = document.getElementById('qr-result');
    
    if (!qrScanner || !qrBtn || !closeBtn) {
        console.warn('QR scanner UI elements not found');
        return;
    }
    
    // Check if jsQR library loaded successfully
    if (typeof window.jsQR === 'undefined') {
        console.warn('⚠️ jsQR library not loaded - QR scanner disabled');
        if (qrBtn) {
            qrBtn.disabled = true;
            qrBtn.title = 'QR Scanner unavailable (library blocked)';
            qrBtn.style.opacity = '0.5';
        }
        return;
    }
    
    // Flashlight toggle for QR scanning
    const flashlightToggle = document.getElementById('qr-flashlight-toggle');
    if (flashlightToggle) {
        flashlightToggle.addEventListener('click', async () => {
            const video = document.getElementById('video');
            const track = video?.srcObject?.getVideoTracks()[0];
            if (track && 'torch' in track.getCapabilities()) {
                const currentTorch = track.getSettings().torch || false;
                await track.applyConstraints({
                    advanced: [{ torch: !currentTorch }]
                });
                flashlightToggle.classList.toggle('active', !currentTorch);
            }
        });
    }
    
    // Open scanner
    qrBtn.addEventListener('click', async () => {
        qrScanner.setAttribute('aria-hidden', 'false');
        scannerActive = true;
        resultDiv.style.display = 'none';
        resultDiv.textContent = '';
        updateHistoryDisplay();
        startQRScan();
        console.log('📷 QR Scanner opened');
    });
    
    // Close scanner
    closeBtn.addEventListener('click', () => {
        stopScanning();
        qrScanner.setAttribute('aria-hidden', 'true');
        console.log('📷 QR Scanner closed');
    });
    
    // Close on outside click
    qrScanner.addEventListener('click', (e) => {
        if (e.target === qrScanner) {
            closeBtn.click();
        }
    });
}

function startQRScan() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('qr-canvas');
    const resultDiv = document.getElementById('qr-result');
    
    if (!video || !canvas || !scannerActive) {
        console.warn('QR scan prerequisites not met');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    function scan() {
        if (!scannerActive) return;
        
        // Set canvas size to match video
        if (video.videoWidth && video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            // Draw current frame
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Get image data for QR detection
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // Detect QR code (using jsQR if available)
            if (typeof window.jsQR !== 'undefined') {
                const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                });
                
                if (code) {
                    handleQRCodeDetected(code.data);
                    return; // Stop scanning after successful detection
                }
            } else {
                console.warn('jsQR not available, QR scanning disabled');
                // Don't spam console - just fail silently after first warning
                if (!scan.warnedOnce) {
                    scan.warnedOnce = true;
                }
                stopQRScan();
                return;
            }
        }
        
        // Continue scanning
        animationId = requestAnimationFrame(scan);
    }
    
    scan();
}

function handleQRCodeDetected(data) {
    const resultDiv = document.getElementById('qr-result');
    const qrScanner = document.getElementById('qr-scanner');
    
    console.log('✅ QR Code detected:', data);
    
    // Vibrate on success
    if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
    }
    
    // Add to history (avoid duplicates)
    if (!scanHistory.some(item => item.data === data)) {
        scanHistory.unshift({
            data,
            timestamp: Date.now(),
            type: detectQRType(data)
        });
        if (scanHistory.length > MAX_HISTORY) {
            scanHistory = scanHistory.slice(0, MAX_HISTORY);
        }
        updateHistoryDisplay();
    }
    
    // Detect QR type and show appropriate actions
    const qrType = detectQRType(data);
    const actions = generateActions(data, qrType);
    
    // Display result with actions
    resultDiv.innerHTML = `
        <div class="qr-result-header">
            <strong>✅ ${qrType} Detected</strong>
        </div>
        <div class="qr-result-data">${escapeHtml(truncateText(data, 100))}</div>
        <div class="qr-result-actions">${actions}</div>
    `;
    resultDiv.style.display = 'block';
    
    // Attach action handlers
    attachActionHandlers(resultDiv, data, qrType);
    
    // Store QR data in state
    state.lastQRCode = data;
    state.lastQRCodeTimestamp = Date.now();
    
    // Play success beep
    playSuccessBeep();
    
    // Stop scanning but don't auto-close - let user interact
    stopScanning();
}

function stopScanning() {
    scannerActive = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

// Simple QR pattern detection (fallback when jsQR not available)
function detectQRPattern(imageData) {
    const { width, height, data } = imageData;
    let darkPixels = 0;
    let lightPixels = 0;
    
    // Sample center region
    const sampleSize = Math.min(width, height) * 0.3;
    const startX = Math.floor((width - sampleSize) / 2);
    const startY = Math.floor((height - sampleSize) / 2);
    
    for (let y = startY; y < startY + sampleSize; y += 5) {
        for (let x = startX; x < startX + sampleSize; x += 5) {
            const i = (y * width + x) * 4;
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            
            if (brightness < 128) darkPixels++;
            else lightPixels++;
        }
    }
    
    // QR codes have roughly balanced dark/light pixels
    const ratio = darkPixels / (darkPixels + lightPixels);
    return ratio > 0.3 && ratio < 0.7;
}

function playSuccessBeep() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.frequency.value = 1200;
        gain.gain.value = 0.1;
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
        // Ignore audio errors
    }
}

function detectQRType(data) {
    if (/^https?:\/\//i.test(data)) return 'URL';
    if (/^mailto:/i.test(data)) return 'Email';
    if (/^tel:/i.test(data)) return 'Phone';
    if (/^geo:/i.test(data)) return 'Location';
    if (/^wifi:/i.test(data)) return 'WiFi';
    if (data.startsWith('{') || data.startsWith('[')) return 'JSON';
    return 'Text';
}

function generateActions(data, type) {
    const buttons = [];
    
    buttons.push('<button class="qr-action-btn" data-action="copy">📋 Copy</button>');
    
    if (type === 'URL') {
        buttons.push('<button class="qr-action-btn" data-action="open">🔗 Open Link</button>');
    } else if (type === 'Email') {
        buttons.push('<button class="qr-action-btn" data-action="email">📧 Email</button>');
    } else if (type === 'Phone') {
        buttons.push('<button class="qr-action-btn" data-action="call">📞 Call</button>');
    } else if (type === 'Location') {
        buttons.push('<button class="qr-action-btn" data-action="maps">🗺️ Maps</button>');
    }
    
    buttons.push('<button class="qr-action-btn" data-action="share">📤 Share</button>');
    buttons.push('<button class="qr-action-btn" data-action="rescan">🔄 Scan Again</button>');
    
    return buttons.join('');
}

function attachActionHandlers(resultDiv, data, type) {
    const actionBtns = resultDiv.querySelectorAll('.qr-action-btn');
    
    actionBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            
            switch(action) {
                case 'copy':
                    await copyToClipboard(data);
                    showStatus('✅ Copied to clipboard');
                    break;
                case 'open':
                    window.open(data, '_blank');
                    break;
                case 'email':
                    window.location.href = data;
                    break;
                case 'call':
                    window.location.href = data;
                    break;
                case 'maps':
                    window.open(data, '_blank');
                    break;
                case 'share':
                    await shareQRData(data);
                    break;
                case 'rescan':
                    resultDiv.style.display = 'none';
                    startQRScan();
                    break;
            }
        });
    });
}

async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
    } catch (err) {
        console.error('Copy failed:', err);
    }
}

async function shareQRData(data) {
    try {
        if (navigator.share) {
            await navigator.share({
                title: 'QR Code Data',
                text: data
            });
        } else {
            await copyToClipboard(data);
            showStatus('📋 Copied to clipboard (share not available)');
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Share failed:', err);
        }
    }
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function updateHistoryDisplay() {
    const historyContainer = document.getElementById('qr-history');
    if (!historyContainer) return;
    
    if (scanHistory.length === 0) {
        historyContainer.innerHTML = '<div class="qr-history-empty">No scan history yet</div>';
        return;
    }
    
    const historyHTML = scanHistory.slice(0, 5).map(item => {
        const date = new Date(item.timestamp).toLocaleTimeString();
        return `
            <div class="qr-history-item" data-qr="${escapeHtml(item.data)}">
                <div class="qr-history-type">${item.type}</div>
                <div class="qr-history-data">${escapeHtml(truncateText(item.data, 40))}</div>
                <div class="qr-history-time">${date}</div>
            </div>
        `;
    }).join('');
    
    historyContainer.innerHTML = historyHTML;
    
    // Add click handlers to history items
    historyContainer.querySelectorAll('.qr-history-item').forEach(item => {
        item.addEventListener('click', () => {
            const data = item.dataset.qr;
            handleQRCodeDetected(data);
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function getLastQRCode() {
    return {
        data: state.lastQRCode,
        timestamp: state.lastQRCodeTimestamp
    };
}

export function clearQRCode() {
    state.lastQRCode = null;
    state.lastQRCodeTimestamp = null;
}

export function getScanHistory() {
    return scanHistory;
}

export function clearScanHistory() {
    scanHistory = [];
    updateHistoryDisplay();
}

// Note: This feature works best with the jsQR library
// Add to index.html before closing body tag:
// <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
