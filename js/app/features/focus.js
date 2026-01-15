import { state } from '../state.js';

/**
 * Tap-to-Focus Feature
 * Allows users to tap on the screen to focus on specific areas
 */

export function initTapToFocus(dom, videoElement) {
    if (!videoElement) {
        console.warn('Video element not available for tap-to-focus');
        return;
    }
    
    let focusEnabled = state.settings.focusAssist !== false;
    const focusRing = dom.focusRing || document.getElementById('focus-ring');
    const focusBtn = dom.focusBtn || document.getElementById('focus-btn');
    
    if (!focusBtn || !focusRing) {
        console.warn('Focus UI elements not found');
        return;
    }
    
    // Toggle focus mode
    focusBtn.addEventListener('click', () => {
        focusEnabled = !focusEnabled;
        focusBtn.classList.toggle('active', focusEnabled);
        focusBtn.setAttribute('aria-pressed', focusEnabled);
        
        if (!focusEnabled && focusRing) {
            focusRing.classList.remove('active');
        }
        
        console.log('🎯 Tap-to-focus:', focusEnabled ? 'enabled' : 'disabled');
    });
    
    // Handle tap to focus
    const cameraView = videoElement.parentElement || document.getElementById('camera-view');
    
    cameraView.addEventListener('click', async (e) => {
        // Ignore if focus is disabled or clicking on UI elements
        if (!focusEnabled || !state.videoStream || e.target !== videoElement) return;
        
        const rect = videoElement.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        
        // Clamp to valid range
        const clampedX = Math.max(0, Math.min(1, x));
        const clampedY = Math.max(0, Math.min(1, y));
        
        // Show focus ring animation
        if (focusRing) {
            focusRing.style.left = `${e.clientX}px`;
            focusRing.style.top = `${e.clientY}px`;
            focusRing.classList.add('active');
            
            setTimeout(() => {
                focusRing.classList.remove('active');
            }, 1000);
        }
        
        // Apply focus constraints
        await applyFocusPoint(clampedX, clampedY);
    });
}

async function applyFocusPoint(x, y) {
    try {
        const track = state.videoStream.getVideoTracks()[0];
        if (!track) return;
        
        const capabilities = track.getCapabilities();
        
        // Try point of interest (newer API)
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
            try {
                await track.applyConstraints({
                    advanced: [{ 
                        focusMode: 'continuous',
                        pointsOfInterest: [{ x, y }]
                    }]
                });
                console.log(`✅ Focus applied at (${x.toFixed(2)}, ${y.toFixed(2)})`);
                return;
            } catch (err) {
                // Point of interest not supported, try manual focus
            }
        }
        
        // Try manual focus with distance calculation
        if (capabilities.focusMode && capabilities.focusMode.includes('manual')) {
            const focusDistance = calculateFocusDistance(x, y, capabilities);
            await track.applyConstraints({
                advanced: [{ 
                    focusMode: 'manual',
                    focusDistance: focusDistance
                }]
            });
            console.log(`✅ Manual focus applied: ${focusDistance.toFixed(3)}`);
            return;
        }
        
        // Fallback to single-shot autofocus
        if (capabilities.focusMode && capabilities.focusMode.includes('single-shot')) {
            await track.applyConstraints({
                advanced: [{ focusMode: 'single-shot' }]
            });
            console.log('✅ Single-shot autofocus triggered');
        }
        
    } catch (err) {
        console.warn('❌ Focus adjustment failed:', err.message);
    }
}

function calculateFocusDistance(x, y, capabilities) {
    // Calculate distance from center of frame
    // Center (0.5, 0.5) = infinity (far focus)
    // Edges = close focus
    const centerX = 0.5, centerY = 0.5;
    const distFromCenter = Math.sqrt(
        Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
    );
    
    const min = capabilities.focusDistance?.min || 0;
    const max = capabilities.focusDistance?.max || 1;
    
    // Normalize distance (0 at center, ~0.7 at corners)
    const normalizedDist = Math.min(distFromCenter / 0.7, 1);
    
    // Closer to center = farther focus distance (higher value)
    // Closer to edge = nearer focus distance (lower value)
    return max - (normalizedDist * (max - min));
}

export function getFocusCapabilities() {
    try {
        if (!state.videoStream) return null;
        
        const track = state.videoStream.getVideoTracks()[0];
        if (!track) return null;
        
        const capabilities = track.getCapabilities();
        const settings = track.getSettings();
        
        return {
            supported: Boolean(capabilities.focusMode),
            modes: capabilities.focusMode || [],
            currentMode: settings.focusMode,
            focusDistance: {
                min: capabilities.focusDistance?.min,
                max: capabilities.focusDistance?.max,
                current: settings.focusDistance
            }
        };
    } catch (err) {
        console.warn('Could not get focus capabilities:', err);
        return null;
    }
}
