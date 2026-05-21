import { isDebugModeEnabled } from '../core/utils.js';

const SW_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol === 'file:') return;

  const register = () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        if (isDebugModeEnabled()) console.log('✅ Service Worker registered');
        setInterval(() => {
          if (isDebugModeEnabled()) console.log('🔄 Checking for Service Worker updates...');
          reg.update();
        }, SW_UPDATE_CHECK_INTERVAL_MS);
      })
      .catch((err) => console.warn('SW registration failed (not critical):', err?.message || err));

    // controllerchange is the authoritative reload trigger; this listener exists
    // as a safety net in case the SW posts SW_UPDATED without rotating control.
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_UPDATED' && isDebugModeEnabled()) {
        console.log('🔄 New version available:', event.data.version);
      }
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      if (isDebugModeEnabled()) console.log('🔄 Controller changed, reloading...');
      window.location.reload();
    });
  };

  // registerServiceWorker() is called from bootstrap() after async IndexedDB
  // work, by which point the 'load' event has usually already fired — so a
  // bare addEventListener('load', …) would never run. Register now if the
  // document is already loaded; otherwise wait for 'load'.
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
