import { state } from '../state.js';

const HEADING_SMOOTHING = 0.15;
const COMPASS_THROTTLE_MS = 100;
const LEVEL_THROTTLE_MS = 50;
const LEVEL_THRESHOLD_DEG = 1;
const LEVEL_VIBRATE_MS = 10;
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const getCardinalDirection = (heading) => CARDINALS[Math.round(heading / 45) % 8];

function readEventHeading(event) {
  if (event.webkitCompassHeading) return event.webkitCompassHeading;
  if (event.alpha !== null && event.alpha !== undefined) return 360 - event.alpha;
  return null;
}

function smoothHeading(rawHeading) {
  let heading = rawHeading;
  if (heading < 0) heading += 360;
  if (heading >= 360) heading -= 360;

  let diff = heading - state.smoothedHeading;
  while (diff < -180) diff += 360;
  while (diff > 180) diff -= 360;

  state.smoothedHeading += diff * HEADING_SMOOTHING;
  if (state.smoothedHeading < 0) state.smoothedHeading += 360;
  if (state.smoothedHeading >= 360) state.smoothedHeading -= 360;

  return state.smoothedHeading;
}

function updateCompassUi(dom) {
  if (dom?.compassArrow) dom.compassArrow.style.transform = `rotate(${-state.currentHeading}deg)`;
  if (dom?.headingTextEl) {
    dom.headingTextEl.textContent =
      `Heading: ${Math.round(state.currentHeading)}° ${getCardinalDirection(state.currentHeading)}`;
  }
}

function updateLevelUi(dom, gamma) {
  const levelLine = dom?.levelIndicator?.querySelector('.level-line');
  if (!levelLine) return;

  levelLine.style.transform = `rotate(${gamma}deg)`;
  if (Math.abs(gamma) < LEVEL_THRESHOLD_DEG) {
    dom?.levelIndicator?.classList.add('level');
    if (navigator.vibrate && !dom.levelIndicator?.dataset.wasLevel) {
      try { navigator.vibrate(LEVEL_VIBRATE_MS); } catch {}
      dom.levelIndicator.dataset.wasLevel = 'true';
    }
  } else {
    dom?.levelIndicator?.classList.remove('level');
    if (dom?.levelIndicator?.dataset) delete dom.levelIndicator.dataset.wasLevel;
  }
}

export function handleOrientation(event, dom) {
  const rawHeading = readEventHeading(event);
  if (rawHeading === null) return;

  state.currentHeading = smoothHeading(rawHeading);

  const now = performance.now();
  if (!handleOrientation.lastUpdate || now - handleOrientation.lastUpdate > COMPASS_THROTTLE_MS) {
    handleOrientation.lastUpdate = now;
    updateCompassUi(dom);
  }

  if (state.featureState.levelEnabled && event.gamma !== null && event.gamma !== undefined) {
    if (handleOrientation.lastLevelUpdate && now - handleOrientation.lastLevelUpdate <= LEVEL_THROTTLE_MS) return;
    handleOrientation.lastLevelUpdate = now;
    updateLevelUi(dom, event.gamma);
  }
}
