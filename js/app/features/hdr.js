import { state } from '../state.js';

/**
 * HDR (High Dynamic Range) Feature
 * Captures multiple exposures and merges them for better dynamic range
 */

export async function captureHDR(video, canvas, showStatus) {
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
    
    // Check if exposure compensation is supported
    if (!capabilities.exposureCompensation) {
        console.warn('❌ HDR not supported - no exposure control on this device');
        if (showStatus) {
            showStatus('⚠️ HDR not supported on this camera', 3000);
        }
        return null;
    }
    
    if (showStatus) {
        showStatus('✨ Capturing HDR (3 exposures)...', 2000);
    }
    
    console.log('✨ Starting HDR capture...');
    
    // Capture 3 exposures: underexposed, normal, overexposed
    const exposures = [-1.5, 0, 1.5];
    const images = [];
    
    // Store original exposure setting
    const originalSettings = track.getSettings();
    const originalExposure = originalSettings.exposureCompensation || 0;
    
    try {
        for (let i = 0; i < exposures.length; i++) {
            const exp = exposures[i];
            
            console.log(`  Capturing exposure ${i + 1}/3 (${exp > 0 ? '+' : ''}${exp} EV)`);
            
            // Apply exposure compensation
            await track.applyConstraints({
                advanced: [{ exposureCompensation: exp }]
            });
            
            // Wait for exposure to settle (longer for first adjustment)
            await sleep(i === 0 ? 400 : 250);
            
            // Capture frame
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            images.push(imageData);
        }
        
        // Merge HDR images
        console.log('  Merging HDR images...');
        const hdrImage = mergeHDRImages(images);
        ctx.putImageData(hdrImage, 0, 0);
        
        // Reset exposure to original
        await track.applyConstraints({
            advanced: [{ exposureCompensation: originalExposure }]
        });
        
        console.log('✅ HDR capture complete');
        
        if (showStatus) {
            showStatus('✅ HDR photo captured', 2000);
        }
        
        return canvas.toDataURL('image/jpeg', 0.95);
        
    } catch (err) {
        console.error('HDR capture failed:', err);
        
        // Try to reset exposure
        try {
            await track.applyConstraints({
                advanced: [{ exposureCompensation: originalExposure }]
            });
        } catch (e) {
            // Ignore
        }
        
        if (showStatus) {
            showStatus('❌ HDR capture failed', 2000);
        }
        
        return null;
    }
}

function mergeHDRImages(images) {
    const [underexposed, normal, overexposed] = images;
    const merged = new ImageData(normal.width, normal.height);
    
    const underData = underexposed.data;
    const normalData = normal.data;
    const overData = overexposed.data;
    const mergedData = merged.data;
    
    // Advanced HDR merging algorithm
    for (let i = 0; i < mergedData.length; i += 4) {
        // Calculate luminance of normal exposure
        const normalR = normalData[i];
        const normalG = normalData[i + 1];
        const normalB = normalData[i + 2];
        const normalLuminance = (0.299 * normalR + 0.587 * normalG + 0.114 * normalB);
        
        // Determine which exposure to use based on luminance
        let r, g, b;
        let weight;
        
        if (normalLuminance < 60) {
            // Dark area - blend normal and overexposed
            weight = normalLuminance / 60; // 0 to 1
            r = lerp(overData[i], normalData[i], weight);
            g = lerp(overData[i + 1], normalData[i + 1], weight);
            b = lerp(overData[i + 2], normalData[i + 2], weight);
            
        } else if (normalLuminance > 195) {
            // Bright area - blend normal and underexposed
            weight = (normalLuminance - 195) / 60; // 0 to 1
            r = lerp(normalData[i], underData[i], weight);
            g = lerp(normalData[i + 1], underData[i + 1], weight);
            b = lerp(normalData[i + 2], underData[i + 2], weight);
            
        } else {
            // Mid-tone - use normal exposure
            r = normalR;
            g = normalG;
            b = normalB;
        }
        
        // Apply tone mapping to increase local contrast
        const toneMapped = applyToneMapping(r, g, b);
        
        mergedData[i] = toneMapped.r;
        mergedData[i + 1] = toneMapped.g;
        mergedData[i + 2] = toneMapped.b;
        mergedData[i + 3] = 255; // Alpha
    }
    
    return merged;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function applyToneMapping(r, g, b) {
    // Simple Reinhard tone mapping
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    const Lnew = L / (1 + L / 255);
    
    const scale = Lnew / (L || 1);
    
    return {
        r: Math.min(255, Math.max(0, r * scale * 1.1)),
        g: Math.min(255, Math.max(0, g * scale * 1.1)),
        b: Math.min(255, Math.max(0, b * scale * 1.1))
    };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function isHDRSupported() {
    try {
        if (!state.videoStream) return false;
        
        const track = state.videoStream.getVideoTracks()[0];
        if (!track) return false;
        
        const capabilities = track.getCapabilities();
        return Boolean(capabilities.exposureCompensation);
    } catch (err) {
        return false;
    }
}

export async function initHDRToggle(dom) {
    const hdrBtn = document.getElementById('hdr-btn');
    const hdrToggle = document.getElementById('toggle-hdr');
    
    if (!hdrBtn) {
        console.warn('HDR button not found');
        return;
    }
    
    // Check support
    const supported = isHDRSupported();
    
    if (!supported) {
        hdrBtn.disabled = true;
        hdrBtn.style.opacity = '0.5';
        hdrBtn.title = 'HDR not supported on this camera';
        console.log('ℹ️ HDR mode not supported on this device');
        return;
    }
    
    // Toggle HDR mode
    hdrBtn.addEventListener('click', () => {
        const enabled = !state.featureState.hdrMode;
        state.featureState.hdrMode = enabled;
        hdrBtn.classList.toggle('active', enabled);
        hdrBtn.setAttribute('aria-pressed', enabled);
        
        if (hdrToggle) {
            hdrToggle.checked = enabled;
        }
        
        console.log('✨ HDR mode:', enabled ? 'enabled' : 'disabled');
    });
    
    // Sync with settings toggle
    hdrToggle?.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        state.featureState.hdrMode = enabled;
        hdrBtn.classList.toggle('active', enabled);
        hdrBtn.setAttribute('aria-pressed', enabled);
    });
    
    console.log('✅ HDR feature initialized');
}
