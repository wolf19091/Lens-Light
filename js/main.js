import { getDom } from './app/dom.js';
import { createStatus } from './app/core/status.js';
import { isDebugModeEnabled } from './app/core/utils.js';
import { loadSettings, bindSettingsUi } from './app/core/settings.js';
import { applyFeatureUI } from './app/ui/features.js';
import { updateAppVh } from './app/ui/viewport.js';
import { registerServiceWorker } from './app/pwa/pwa.js';
import { APP_VERSION } from './version.js';
import {
  createGalleryObserver,
  loadPhotos,
  renderGallery,
  revokeAllPhotoObjectUrls,
  updateGalleryUI
} from './app/gallery/gallery.js';
import { clearAllPhotos } from './app/storage/photoDb.js';
import { updateWeatherDisplay } from './app/sensors/sensors.js';

import { initTapToFocus } from './app/features/focus.js';
import { initWhiteBalance } from './app/features/whitebalance.js';
import { initQRScanner } from './app/features/qrscanner.js';
import { initPhotoComparison } from './app/features/comparison.js';
import { initMetadataExport } from './app/features/metadata.js';
import { initHDRToggle } from './app/features/hdr.js';

import { inspectVideoDebugState } from './app/wiring/diagnostics.js';
import { bindProjectEvents, refreshProjectManagerUi } from './app/wiring/projects.js';
import { bindPermissionButton, checkStoredPermissionsAndBootstrap } from './app/wiring/permissions.js';
import { bindMenusAndGestures } from './app/wiring/menus.js';
import { bindCaptureControls } from './app/wiring/capture-wiring.js';
import { bindGalleryEvents } from './app/wiring/gallery-wiring.js';
import { bindLifecycle } from './app/wiring/lifecycle.js';

console.log(`📱 Lens Light v${APP_VERSION}`);

if (window.__LENS_LIGHT_INITIALIZED__) {
  console.warn('⚠️ Main.js already initialized, skipping duplicate run');
} else {
  window.__LENS_LIGHT_INITIALIZED__ = true;
  initializeApp();
}

function initializeApp() {
  const dom = getDom();
  const { showStatus } = createStatus(dom.statusMsg);
  const galleryObserver = createGalleryObserver(dom);
  const env = { showStatus, galleryObserver };

  bindSettingsUi(dom, {
    showStatus,
    updateWeatherDisplay: () => updateWeatherDisplay(dom),
    renderGallery: () => renderGallery(dom, galleryObserver, { showStatus }),
    revokeAllPhotoObjectUrls,
    clearAllPhotos,
    updateGalleryUI: () => updateGalleryUI(dom),
    loadSettings: (d) => loadSettings(d),
    syncProjectUi: () => refreshProjectManagerUi(dom)
  });

  // Language change shouldn't tear down the gallery — just rebuild project UI.
  dom.languageSelect?.addEventListener('change', () => refreshProjectManagerUi(dom));

  bindPermissionButton(dom, env);
  bindCaptureControls(dom, env);
  bindGalleryEvents(dom, env);
  bindProjectEvents(dom, env);
  bindMenusAndGestures(dom, env);
  bindLifecycle(dom);

  updateAppVh();
  loadSettings(dom);
  refreshProjectManagerUi(dom);
  applyFeatureUI(dom);
  inspectVideoDebugState(dom);

  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = `v${APP_VERSION}`;

  if (isDebugModeEnabled()) console.log('🎯 Initializing advanced features...');
  initTapToFocus(dom, dom.video);
  initWhiteBalance(dom);
  initQRScanner(dom);
  initPhotoComparison(dom);
  initMetadataExport(dom, { showStatus });
  initHDRToggle(dom);
  if (isDebugModeEnabled()) console.log('✅ Advanced features initialized');

  bootstrap(dom, env).catch((e) => {
    console.error('bootstrap failed', e);
    try {
      showStatus('❌ App init failed: ' + (e?.message || 'Unknown'), 5000);
    } catch {}
  });
}

async function bootstrap(dom, env) {
  await loadPhotos(dom);
  refreshProjectManagerUi(dom);
  checkStoredPermissionsAndBootstrap(dom, env);
  // A second pass after the camera has had a moment to wire up — useful for
  // debugging the iOS Safari `srcObject` race when debug_mode is enabled.
  setTimeout(() => inspectVideoDebugState(dom), 2500);
  registerServiceWorker();
}
