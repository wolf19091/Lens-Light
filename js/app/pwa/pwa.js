export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol === 'file:') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        console.log('✅ Service Worker registered');
        // Check for updates every hour
        setInterval(() => {
          console.log('🔄 Checking for Service Worker updates...');
          reg.update();
        }, 60 * 60 * 1000);
      })
      .catch((err) => console.warn('SW registration failed (not critical):', err?.message || err));

    // Listen for SW update messages
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SW_UPDATED') {
        console.log('🔄 New version available:', event.data.version);
        // We rely on controllerchange for the actual reload to avoid duplicates,
        // but if controllerchange doesn't fire (e.g. strict message update), we can prompt.
        // For now, let's trust controllerchange.
      }
    });

    // Fallback: detect controller change (when SW updates)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      console.log('🔄 Controller changed, reloading...');
      window.location.reload();
    });
  });
}
