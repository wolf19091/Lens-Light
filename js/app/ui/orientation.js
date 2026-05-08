// Chrome rotation: when the device rotates, keep the camera feed
// where it is (object-fit: cover already handles that) and counter-
// rotate the small glyphs on every chip so they read upright.
//
// We expose two CSS variables on the document root and a data
// attribute that selectors can latch onto:
//   --ui-rotate   the angle every glyph counter-rotates by
//   data-ui-rotation  one of "0" | "90" | "-90" | "180"

const ROTATE_TRANSITION_MS = 350;

function readScreenAngle() {
  // Modern browsers: screen.orientation.angle is 0/90/180/270.
  const angle = window.screen?.orientation?.angle;
  if (typeof angle === 'number') return angle;

  // Older iOS Safari fallback.
  if (typeof window.orientation === 'number') {
    // window.orientation is one of 0, 90, -90, 180.
    return ((window.orientation % 360) + 360) % 360;
  }

  return 0;
}

function normalize(angle) {
  // Map to -180..180 so chrome rotates the short way around.
  let a = ((angle + 180) % 360) - 180;
  if (a < -180) a += 360;
  return a;
}

export function applyUiRotation() {
  const raw = readScreenAngle();
  const counter = normalize(-raw);
  const root = document.documentElement;
  root.style.setProperty('--ui-rotate', `${counter}deg`);
  root.setAttribute('data-ui-rotation', String(raw));
}

export function bindUiRotation() {
  applyUiRotation();

  if (window.screen?.orientation?.addEventListener) {
    window.screen.orientation.addEventListener('change', applyUiRotation);
  }
  // Belt-and-braces for iOS where screen.orientation may not fire reliably.
  window.addEventListener('orientationchange', applyUiRotation);
  window.addEventListener('resize', applyUiRotation);
}

export const UI_ROTATION_TRANSITION_MS = ROTATE_TRANSITION_MS;
