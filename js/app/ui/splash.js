// Animated splash screen lifecycle.
//
// The splash markup lives in index.html so it paints before any JS runs.
// main.js calls dismissSplash() once the UI is interactive; a failsafe
// timer guarantees the splash never traps the user if init throws early.

const MIN_VISIBLE_MS = 650;   // let the entrance animation finish
const FAILSAFE_MS = 4000;     // never block the camera longer than this
const FADE_MS = 550;          // matches the CSS opacity transition

const shownAt = performance.now();
let dismissed = false;

export function dismissSplash() {
  if (dismissed) return;
  dismissed = true;

  const el = document.getElementById('splash');
  if (!el) return;

  const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - shownAt));
  setTimeout(() => {
    el.classList.add('done');
    // Remove from the DOM once faded so the blur layer costs nothing.
    setTimeout(() => el.remove(), FADE_MS);
  }, wait);
}

export function armSplashFailsafe() {
  setTimeout(dismissSplash, FAILSAFE_MS);
}
