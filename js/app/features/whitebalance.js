import { state } from '../state.js';
import { isDebugModeEnabled } from '../core/utils.js';

/**
 * White balance from 2000K (warm/candle) to 8000K (cool/shade).
 * Live preview uses CSS sepia + hue-rotate; capture pipeline uses RGB
 * channel multipliers via {@link applyWhiteBalanceToCanvas}.
 */

const NEUTRAL_KELVIN = 5500;
const WARM_RANGE = 3500;
const COOL_RANGE = 2500;
const WARM_SEPIA_MAX = 0.3;
const COOL_SEPIA_MAX = 0.15;
const WARM_HUE_ROTATE_MAX = 20;
const COOL_HUE_ROTATE_MAX = 30;

let currentColorTemp = NEUTRAL_KELVIN;

/**
 * Tanner Helland's color-temperature → RGB approximation.
 * @see http://www.tannerhelland.com/4435/convert-temperature-rgb-algorithm-code/
 */
function colorTempToRGB(kelvin) {
  const temp = kelvin / 100;
  let r, g, b;

  if (temp <= 66) {
    r = 255;
  } else {
    r = Math.max(0, Math.min(255, 329.698727446 * Math.pow(temp - 60, -0.1332047592)));
  }

  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }
  g = Math.max(0, Math.min(255, g));

  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = Math.max(0, Math.min(255, 138.5177312231 * Math.log(temp - 10) - 305.0447927307));
  }

  return { r: r / 255, g: g / 255, b: b / 255 };
}

function getTempName(kelvin) {
  if (kelvin < 3000) return 'Warm/Candlelight';
  if (kelvin < 4000) return 'Warm/Incandescent';
  if (kelvin < 5000) return 'Neutral/Fluorescent';
  if (kelvin < 6000) return 'Daylight';
  if (kelvin < 7000) return 'Cool/Overcast';
  return 'Cool/Shade';
}

function buildPreviewFilter(existingFilters, colorTemp) {
  if (colorTemp < NEUTRAL_KELVIN) {
    const warmth = (NEUTRAL_KELVIN - colorTemp) / WARM_RANGE;
    return `${existingFilters} sepia(${warmth * WARM_SEPIA_MAX}) hue-rotate(${-warmth * WARM_HUE_ROTATE_MAX}deg)`;
  }
  if (colorTemp > NEUTRAL_KELVIN) {
    const coolness = (colorTemp - NEUTRAL_KELVIN) / COOL_RANGE;
    return `${existingFilters} sepia(${coolness * COOL_SEPIA_MAX}) hue-rotate(${coolness * COOL_HUE_ROTATE_MAX}deg)`;
  }
  return existingFilters;
}

function applyWhiteBalance(colorTemp) {
  const video = document.getElementById('video');
  if (!video) return;

  const { r, g, b } = colorTempToRGB(colorTemp);

  const existingFilters = video.style.filter
    .split(' ')
    .filter((f) => !f.startsWith('sepia') && !f.startsWith('hue-rotate'))
    .join(' ');

  video.style.filter = buildPreviewFilter(existingFilters, colorTemp).trim();

  state.whiteBalanceTemp = colorTemp;
  state.whiteBalanceRGB = { r, g, b };

  if (isDebugModeEnabled()) console.log(`🌡️ White balance: ${colorTemp}K (${getTempName(colorTemp)})`);
}

export function initWhiteBalance(dom) {
  const wbControl = dom.wbControl || document.getElementById('wb-control');
  const wbSlider = dom.wbSlider || document.getElementById('wb-slider');
  const wbBtn = dom.wbBtn || document.getElementById('wb-btn');

  if (!wbControl || !wbSlider || !wbBtn) {
    console.warn('White balance UI elements not found');
    return;
  }

  wbBtn.addEventListener('click', () => {
    const isVisible = wbControl.classList.toggle('visible');
    wbBtn.classList.toggle('active', isVisible);
    wbBtn.setAttribute('aria-pressed', isVisible);
  });

  wbSlider.addEventListener('input', (e) => {
    const temp = parseInt(e.target.value);
    currentColorTemp = temp;
    wbSlider.setAttribute('aria-valuenow', temp);
    applyWhiteBalance(temp);
  });

  applyWhiteBalance(currentColorTemp);
}

export function applyWhiteBalanceToCanvas(canvas, ctx, colorTemp) {
  if (!colorTemp || colorTemp === NEUTRAL_KELVIN) return;

  const { r, g, b } = colorTempToRGB(colorTemp);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] * r);
    data[i + 1] = Math.min(255, data[i + 1] * g);
    data[i + 2] = Math.min(255, data[i + 2] * b);
  }

  ctx.putImageData(imageData, 0, 0);
}

export const getCurrentColorTemp = () => currentColorTemp;

export function resetWhiteBalance() {
  currentColorTemp = NEUTRAL_KELVIN;
  const wbSlider = document.getElementById('wb-slider');
  if (wbSlider) wbSlider.value = NEUTRAL_KELVIN;
  applyWhiteBalance(NEUTRAL_KELVIN);
}
