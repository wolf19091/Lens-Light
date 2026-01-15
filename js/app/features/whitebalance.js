import { state } from '../state.js';

/**
 * White Balance Feature
 * Adjust color temperature from warm (2000K) to cool (8000K)
 */

let currentColorTemp = 5500; // Default daylight

export function initWhiteBalance(dom) {
    const wbControl = dom.wbControl || document.getElementById('wb-control');
    const wbSlider = dom.wbSlider || document.getElementById('wb-slider');
    const wbBtn = dom.wbBtn || document.getElementById('wb-btn');
    
    if (!wbControl || !wbSlider || !wbBtn) {
        console.warn('White balance UI elements not found');
        return;
    }
    
    // Toggle white balance control
    wbBtn.addEventListener('click', () => {
        const isVisible = wbControl.classList.toggle('visible');
        wbBtn.classList.toggle('active', isVisible);
        wbBtn.setAttribute('aria-pressed', isVisible);
    });
    
    // Apply white balance on slider change
    wbSlider.addEventListener('input', (e) => {
        const temp = parseInt(e.target.value);
        currentColorTemp = temp;
        wbSlider.setAttribute('aria-valuenow', temp);
        applyWhiteBalance(temp);
    });
    
    // Initialize with default
    applyWhiteBalance(currentColorTemp);
}

function applyWhiteBalance(colorTemp) {
    const video = document.getElementById('video');
    if (!video) return;
    
    // Calculate RGB adjustments based on color temperature
    const { r, g, b } = colorTempToRGB(colorTemp);
    
    // Apply CSS filter (for preview)
    const existingFilters = video.style.filter
        .split(' ')
        .filter(f => !f.startsWith('sepia') && !f.startsWith('hue-rotate'))
        .join(' ');
    
    // Use sepia and hue-rotate for better results than just brightness
    let filterValue = existingFilters;
    
    if (colorTemp < 5500) {
        // Warm tones
        const warmth = (5500 - colorTemp) / 3500; // 0-1
        const sepia = warmth * 0.3;
        const hueRotate = -warmth * 20;
        filterValue += ` sepia(${sepia}) hue-rotate(${hueRotate}deg)`;
    } else if (colorTemp > 5500) {
        // Cool tones
        const coolness = (colorTemp - 5500) / 2500; // 0-1
        const sepia = coolness * 0.15;
        const hueRotate = coolness * 30;
        filterValue += ` sepia(${sepia}) hue-rotate(${hueRotate}deg)`;
    }
    
    video.style.filter = filterValue.trim();
    
    // Store for capture processing
    state.whiteBalanceTemp = colorTemp;
    state.whiteBalanceRGB = { r, g, b };
    
    console.log(`🌡️ White balance: ${colorTemp}K (${getTempName(colorTemp)})`);
}

function colorTempToRGB(kelvin) {
    // Algorithm based on Tanner Helland's work
    // http://www.tannerhelland.com/4435/convert-temperature-rgb-algorithm-code/
    
    let temp = kelvin / 100;
    let r, g, b;
    
    // Red
    if (temp <= 66) {
        r = 255;
    } else {
        r = temp - 60;
        r = 329.698727446 * Math.pow(r, -0.1332047592);
        r = Math.max(0, Math.min(255, r));
    }
    
    // Green
    if (temp <= 66) {
        g = temp;
        g = 99.4708025861 * Math.log(g) - 161.1195681661;
    } else {
        g = temp - 60;
        g = 288.1221695283 * Math.pow(g, -0.0755148492);
    }
    g = Math.max(0, Math.min(255, g));
    
    // Blue
    if (temp >= 66) {
        b = 255;
    } else if (temp <= 19) {
        b = 0;
    } else {
        b = temp - 10;
        b = 138.5177312231 * Math.log(b) - 305.0447927307;
        b = Math.max(0, Math.min(255, b));
    }
    
    return {
        r: r / 255,
        g: g / 255,
        b: b / 255
    };
}

function getTempName(kelvin) {
    if (kelvin < 3000) return 'Warm/Candlelight';
    if (kelvin < 4000) return 'Warm/Incandescent';
    if (kelvin < 5000) return 'Neutral/Fluorescent';
    if (kelvin < 6000) return 'Daylight';
    if (kelvin < 7000) return 'Cool/Overcast';
    return 'Cool/Shade';
}

export function applyWhiteBalanceToCanvas(canvas, ctx, colorTemp) {
    if (!colorTemp || colorTemp === 5500) return; // No adjustment needed
    
    const { r, g, b } = colorTempToRGB(colorTemp);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Apply color temperature to each pixel
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * r);     // Red
        data[i + 1] = Math.min(255, data[i + 1] * g); // Green
        data[i + 2] = Math.min(255, data[i + 2] * b); // Blue
        // Alpha (i+3) unchanged
    }
    
    ctx.putImageData(imageData, 0, 0);
}

export function getCurrentColorTemp() {
    return currentColorTemp;
}

export function resetWhiteBalance() {
    currentColorTemp = 5500;
    const wbSlider = document.getElementById('wb-slider');
    if (wbSlider) {
        wbSlider.value = 5500;
    }
    applyWhiteBalance(5500);
}
