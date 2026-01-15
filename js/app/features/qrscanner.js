import { state } from '../state.js';

/**
 * QR Code Scanner Feature
 * Scans QR codes from the camera feed for equipment IDs or location markers
 */

let scannerActive = false;
let animationId = null;

export function initQRScanner(dom) {
    const qrScanner = document.getElementById('qr-scanner');
    const qrBtn = document.getElementById('qr-btn');
    const closeBtn = document.getElementById('close-qr-scanner');
    const resultDiv = document.getElementById('qr-result');
    
    if (!qrScanner || !qrBtn || !closeBtn) {
        console.warn('QR scanner UI elements not found');
        return;
    }
    
    // Open scanner
    qrBtn.addEventListener('click', async () => {
        qrScanner.setAttribute('aria-hidden', 'false');
        scannerActive = true;
        resultDiv.style.display = 'none';
        resultDiv.textContent = '';
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
            if (typeof jsQR !== 'undefined') {
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                });
                
                if (code) {
                    handleQRCodeDetected(code.data);
                    return; // Stop scanning after successful detection
                }
            } else {
                // Fallback: simple pattern detection
                const detected = detectQRPattern(imageData);
                if (detected) {
                    handleQRCodeDetected('QR Code detected (install jsQR for full decoding)');
                    return;
                }
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
    
    // Display result
    resultDiv.innerHTML = `<strong>QR Code:</strong><br>${escapeHtml(data)}`;
    resultDiv.style.display = 'block';
    
    // Store QR data in state
    state.lastQRCode = data;
    state.lastQRCodeTimestamp = Date.now();
    
    // Play success beep
    playSuccessBeep();
    
    // Auto-close after 3 seconds
    setTimeout(() => {
        if (qrScanner.getAttribute('aria-hidden') === 'false') {
            stopScanning();
            qrScanner.setAttribute('aria-hidden', 'true');
        }
    }, 3000);
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

// Note: This feature works best with the jsQR library
// Add to index.html before closing body tag:
// <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
