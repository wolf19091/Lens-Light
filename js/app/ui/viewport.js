// Mobile-browser viewport-height fix.
//
// Modern browsers honour `100dvh` (dynamic viewport height) which already
// accounts for Safari/Chrome bottom toolbars. The CSS uses `dvh` first
// and falls back to `calc(var(--app-vh, 1vh) * 100)` for older WebKit
// where `dvh` is missing.
//
// We update --app-vh on resize / visualViewport changes / orientation
// changes. Safari also reports stale dimensions for one frame after
// `orientationchange`, so we re-poll a second later.

export function updateAppVh() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const vh = viewportHeight * 0.01;
  document.documentElement.style.setProperty('--app-vh', `${vh}px`);
}

export function scheduleAppVhAfterRotation() {
  // First update is immediate; the second one catches Safari's late metrics.
  updateAppVh();
  setTimeout(updateAppVh, 350);
}
