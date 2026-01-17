import { getDom } from './app/dom.js';
import { state } from './app/state.js';
import { createStatus } from './app/core/status.js';
import { t, setLanguage } from './app/core/i18n.js';
import { loadSettings, saveSettings, bindSettingsUi } from './app/core/settings.js';
import { applyFeatureUI } from './app/ui/features.js';
import { updateAppVh } from './app/ui/viewport.js';
import { requestWakeLock, releaseWakeLock } from './app/ui/wakelock.js';
import { registerServiceWorker } from './app/pwa/pwa.js';
import {
  loadPhotos,
  updateGalleryUI,
  createGalleryObserver,
  renderGallery,
  enterSelectMode,
  exitSelectMode,
  revokeAllPhotoObjectUrls,
  closePhotoViewer,
  openPhotoViewer,
  deleteSelectedPhotos,
  downloadSelectedPhotos,
  shareSelectedPhotos,
  shareLastCapturedPhoto,
  getPhotoFilename,
  updatePhotoComment
} from './app/gallery/gallery.js';
import { clearAllPhotos, dbGetPhoto } from './app/storage/photoDb.js';
import {
  initCamera,
  checkStorageQuota,
  applyZoom,
  applyPreviewEffects,
  performCapture,
  startTimerCapture,
  toggleTorch,
  applyExposureToTrackOrPreview
} from './app/camera/camera.js';
import { clamp } from './app/core/utils.js';
import { startSensors, stopSensors, maybeUpdateCustomLocationFromWebFactory, updateWeatherDisplay } from './app/sensors/sensors.js';

// NEW FEATURES
import { initTapToFocus } from './app/features/focus.js';
import { initWhiteBalance } from './app/features/whitebalance.js';
import { initQRScanner } from './app/features/qrscanner.js';
import { initPhotoComparison, updateComparisonButton } from './app/features/comparison.js';
import { initMetadataExport } from './app/features/metadata.js';
import { initHDRToggle } from './app/features/hdr.js';

// Prevent multiple initialization
if (window.__LENS_LIGHT_INITIALIZED__) {
  console.warn('⚠️ Main.js already initialized, skipping duplicate run');
} else {
  window.__LENS_LIGHT_INITIALIZED__ = true;
  initializeApp();
}

function initializeApp() {

const dom = getDom();
const { showStatus } = createStatus(dom.statusMsg);

function warnIfElementCovered(el) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const topEl = document.elementFromPoint(x, y);
  if (!topEl) return;
  if (topEl === el || el.contains(topEl)) return;
  console.warn('shutter element may be covered by', topEl);
}

// Bootstrap helpers
function checkStoredPermissionsAndBootstrap() {
  const cameraGranted = localStorage.getItem('camera_granted') === 'true';
  const sensorsGranted = localStorage.getItem('sensors_granted') === 'true';
  
  console.log('🚀 Bootstrap check:', { cameraGranted, sensorsGranted });

  if (cameraGranted && sensorsGranted) {
    if (dom.permBtn) dom.permBtn.style.display = 'none';
    initCamera(dom, { showStatus });
    const maybeUpdate = maybeUpdateCustomLocationFromWebFactory(dom);
    startSensors(dom, { showStatus, maybeUpdateCustomLocationFromWeb: maybeUpdate });
    return;
  }

  if (cameraGranted) {
    initCamera(dom, { showStatus });
    if (dom.permBtn) {
      dom.permBtn.textContent = t('enableGPS');
      dom.permBtn.style.display = 'block';
    }
    return;
  }

  if (dom.permBtn) {
    dom.permBtn.textContent = t('enableCamera');
    dom.permBtn.style.display = 'block';
  }
}

// Gallery observer
const galleryObserver = createGalleryObserver(dom);

// Double-tap to flip camera
let lastTap = 0;
dom.video?.parentElement?.addEventListener('click', (e) => {
  const now = Date.now();
  if (now - lastTap < 300) {
    if (dom.flipCameraBtn && !dom.flipCameraBtn.disabled) {
      dom.flipCameraBtn.click();
      // Show small visual feedback
      const rip = document.createElement('div');
      rip.style.cssText = `
        position: absolute; left: ${e.clientX}px; top: ${e.clientY}px;
        width: 10px; height: 10px; border-radius: 50%;
        background: rgba(255,255,255,0.8);
        transform: translate(-50%, -50%);
        pointer-events: none; animation: ripple 0.5s ease-out forwards;
      `;
      // We can insert styles for ripple dynamically or reuse existing if any
      // Assuming CSS for ripple logic or inline simplistic
      document.body.appendChild(rip);
      setTimeout(() => rip.remove(), 500);
    }
  }
  lastTap = now;
});

// Events wiring
if (dom.permBtn) {
  dom.permBtn.addEventListener('click', async () => {
    dom.permBtn.disabled = true;

    try {
      const cameraGranted = localStorage.getItem('camera_granted') === 'true';
      if (!cameraGranted) {
        const ok = await initCamera(dom, { showStatus });
        if (!ok) {
          dom.permBtn.disabled = false;
          return;
        }
      }

      if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          showStatus(t('permissionDenied'), 3000);
          dom.permBtn.disabled = false;
          return;
        }
      }

      localStorage.setItem('sensors_granted', 'true');
      dom.permBtn.style.display = 'none';
      showStatus(t('sensorsEnabled'), 2000);

      const maybeUpdate = maybeUpdateCustomLocationFromWebFactory(dom);
      startSensors(dom, { showStatus, maybeUpdateCustomLocationFromWeb: maybeUpdate });
    } catch (e) {
      console.error('permission flow failed', e);
      showStatus('❌ Permission failed: ' + (e?.message || 'Unknown'), 3000);
      dom.permBtn.disabled = false;
    }
  });
}

// Capture - Shutter Button Click Handler
if (dom.shutterBtn) {
  console.log('✅ Shutter button listener attached');
  
  dom.shutterBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log('📸 Shutter button clicked');

    // Check if button is disabled
    if (dom.shutterBtn.classList.contains('disabled')) {
      // If camera is initializing, this is expected
      console.log('ℹ️ Shutter clicked while camera initializing or disabled');
      return;
    }

    // Check if capture already in progress
    if (state.featureState.captureInProgress) {
      console.warn('⚠️ Capture already in progress');
      return;
    }

    console.log('📷 Taking photo...', { 
      hasVideoStream: !!state.videoStream, 
      timerDelay: state.featureState.timerDelay 
    });

    try {
      // Timer mode: countdown before capture
      if (state.featureState.timerDelay > 0) {
        await startTimerCapture(dom, {
          showStatus,
          onCaptured: () => updateGalleryUI(dom),
          onBurstUi: (kind) => {
            if (kind === 'count') {
              const burstCounter = dom.burstIndicator?.querySelector('.burst-counter');
              if (burstCounter) burstCounter.textContent = `${state.featureState.burstCount}/${state.featureState.maxBurstPhotos}`;
            } else {
              dom.burstBtn?.classList.remove('active');
              dom.burstIndicator?.classList.remove('active');
            }
          }
        });
        return;
      }

      // Immediate capture
      await performCapture(dom, {
        showStatus,
        onCaptured: async () => {
          updateGalleryUI(dom);
          // Check storage quota periodically
          if (state.photos.length % 5 === 0) {
            await checkStorageQuota({ showStatus });
          }
        },
        onBurstUi: (kind) => {
          if (kind === 'count') {
            const burstCounter = dom.burstIndicator?.querySelector('.burst-counter');
            if (burstCounter) burstCounter.textContent = `${state.featureState.burstCount}/${state.featureState.maxBurstPhotos}`;
          } else {
            dom.burstBtn?.classList.remove('active');
            dom.burstIndicator?.classList.remove('active');
          }
        }
      });
    } catch (err) {
      console.error('❌ Capture failed:', err);
      showStatus('❌ Capture failed: ' + (err?.message || 'Unknown error'), 3500);
    }
  });
} else {
  alert('❌ ERROR: Shutter button NOT FOUND!');
  console.error('❌ Shutter button NOT FOUND in DOM');
}

// Flip camera
if (dom.flipCameraBtn) {
  dom.flipCameraBtn.addEventListener('click', async () => {
    state.settings.cameraFacingMode = state.settings.cameraFacingMode === 'user' ? 'environment' : 'user';
    saveSettings();
    await initCamera(dom, { showStatus });
  });
}

// Zoom
dom.zoomInBtn?.addEventListener('click', () => {
  state.zoomLevel = clamp(state.zoomLevel + 0.5, 1, 3);
  applyZoom(dom);
});

dom.zoomOutBtn?.addEventListener('click', () => {
  state.zoomLevel = clamp(state.zoomLevel - 0.5, 1, 3);
  applyZoom(dom);
});

// Settings binding (includes clear-data)
bindSettingsUi(dom, {
  showStatus,
  updateWeatherDisplay: () => updateWeatherDisplay(dom),
  renderGallery: () => renderGallery(dom, galleryObserver, { showStatus }),
  revokeAllPhotoObjectUrls,
  clearAllPhotos,
  updateGalleryUI: () => updateGalleryUI(dom),
  loadSettings: (d) => loadSettings(d)
});

// Gallery modal
if (dom.galleryBtn) {
  dom.galleryBtn.addEventListener('click', () => {
    dom.galleryModal?.classList.add('open');
    dom.galleryModal?.setAttribute('aria-hidden', 'false');
    renderGallery(dom, galleryObserver, { showStatus });
    if (state.photos.length > 0 && dom.selectModeBtn) dom.selectModeBtn.style.display = 'block';
    dom.closeGalleryBtn?.focus?.();
  });
}

dom.closeGalleryBtn?.addEventListener('click', () => {
  exitSelectMode(dom);
  closePhotoViewer(dom);
  revokeAllPhotoObjectUrls();
  dom.galleryModal?.classList.remove('open');
  // Move focus out of the dialog before hiding it from assistive tech.
  dom.galleryBtn?.focus?.();
  dom.galleryModal?.setAttribute('aria-hidden', 'true');
});

dom.selectModeBtn?.addEventListener('click', () => {
  enterSelectMode(dom);
  renderGallery(dom, galleryObserver, { showStatus });
});

dom.cancelSelectBtn?.addEventListener('click', () => {
  exitSelectMode(dom);
  renderGallery(dom, galleryObserver, { showStatus });
});

dom.selectAllBtn?.addEventListener('click', () => {
  if (!state.isSelectMode) return;
  const allIds = state.photos.map((p) => p.id);
  const isAllSelected = allIds.length > 0 && allIds.every((id) => state.selectedPhotos.has(id));

  state.selectedPhotos = isAllSelected ? new Set() : new Set(allIds);

  document.querySelectorAll('.gallery-item').forEach((item) => {
    const id = Number(item.dataset.photoId);
    const checked = state.selectedPhotos.has(id);
    item.classList.toggle('selected', checked);
    const cb = item.querySelector('.gallery-item-checkbox');
    if (cb) cb.checked = checked;
  });
  
  // Update UI state
  updateSelectAllButton(dom);
  updateComparisonButton();
});

dom.shareSelectedBtn?.addEventListener('click', () => {
  if (state.selectedPhotos.size === 0) return showStatus('⚠️ No photos selected', 2000);
  shareSelectedPhotos(dom, { showStatus });
});

dom.downloadSelectedBtn?.addEventListener('click', () => {
  if (state.selectedPhotos.size === 0) return showStatus('⚠️ No photos selected', 2000);
  downloadSelectedPhotos(dom, { showStatus });
});

dom.deleteSelectedBtn?.addEventListener('click', () => {
  if (state.selectedPhotos.size === 0) return showStatus('⚠️ No photos selected', 2000);
  deleteSelectedPhotos(dom, { showStatus }, galleryObserver);
});

// Photo viewer actions

dom.closePhotoViewerBtn?.addEventListener('click', () => closePhotoViewer(dom));

dom.viewerShareBtn?.addEventListener('click', async () => {
  if (!state.viewedPhotoId) return;
  const record = await dbGetPhoto(state.viewedPhotoId);
  if (!record?.blob) return showStatus(t('photoMissing'), 2500);

  const meta = state.photos.find((p) => p.id === state.viewedPhotoId) || {
    id: state.viewedPhotoId,
    timestamp: new Date().toISOString(),
    projectName: state.settings.projectName
  };

  const { shareBlob, downloadBlob } = await import('./app/core/utils.js');
  const shared = await shareBlob(record.blob, getPhotoFilename(meta), { t, photoMeta: meta });
  if (shared) showStatus('✓ Shared', 2000);
  else {
    downloadBlob(record.blob, getPhotoFilename(meta), { showStatus });
    showStatus('✓ Saved', 2000);
  }
});

dom.viewerSaveBtn?.addEventListener('click', async () => {
  if (!state.viewedPhotoId) return;
  const record = await dbGetPhoto(state.viewedPhotoId);
  if (!record?.blob) return showStatus(t('photoMissing'), 2500);

  const meta = state.photos.find((p) => p.id === state.viewedPhotoId) || {
    id: state.viewedPhotoId,
    timestamp: new Date().toISOString(),
    projectName: state.settings.projectName
  };

  const { downloadBlob } = await import('./app/core/utils.js');
  downloadBlob(record.blob, getPhotoFilename(meta), { showStatus });
  showStatus('✓ Saved', 1500);
});

dom.viewerCommentBtn?.addEventListener('click', async () => {
  if (!state.viewedPhotoId) return;
  await updatePhotoComment(state.viewedPhotoId, dom, { showStatus });
});

dom.viewerDeleteBtn?.addEventListener('click', async () => {
  if (!state.viewedPhotoId) return;
  if (!confirm(t('deleteThisPhoto'))) return;
  const id = state.viewedPhotoId;
  closePhotoViewer(dom);
  const { deletePhoto } = await import('./app/gallery/gallery.js');
  await deletePhoto(id, dom, { showStatus }, galleryObserver);
  renderGallery(dom, galleryObserver, { showStatus });
});

// Share button

dom.shareBtn?.addEventListener('click', () => {
  if (state.lastCapturedPhotoId) {
    shareLastCapturedPhoto({ showStatus });
    return;
  }

  if (state.photos.length > 0) {
    dom.galleryModal?.classList.add('open');
    renderGallery(dom, galleryObserver, { showStatus });
    showStatus(state.currentLang === 'ar' ? 'اختر صورة للمشاركة/الحفظ' : 'Select a photo to share/save', 2000);
    return;
  }

  dom.fileInput?.click();
});

dom.fileInput?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!navigator.share) {
    showStatus('❌ Sharing not supported', 3000);
    dom.fileInput.value = '';
    return;
  }

  if (navigator.canShare && !navigator.canShare({ files: [file] })) {
    showStatus('❌ Sharing not available for this file', 3000);
    dom.fileInput.value = '';
    return;
  }

  try {
    await navigator.share({ files: [file], title: t('shareTitle'), text: t('shareText') });
    showStatus('✓ Shared', 2000);
  } catch (e) {
    if (e?.name !== 'AbortError') showStatus('❌ Share failed', 3000);
  }

  dom.fileInput.value = '';
});

// Feature buttons

dom.gridBtn?.addEventListener('click', () => {
  state.featureState.gridEnabled = !state.featureState.gridEnabled;
  applyFeatureUI(dom);
  showStatus(state.featureState.gridEnabled ? '⊞ Grid ON' : '⊞ Grid OFF', 1500);
});

dom.levelBtn?.addEventListener('click', () => {
  state.featureState.levelEnabled = !state.featureState.levelEnabled;
  applyFeatureUI(dom);
  showStatus(state.featureState.levelEnabled ? '⚖️ Level ON' : '⚖️ Level OFF', 1500);
});

dom.timerBtn?.addEventListener('click', () => {
  dom.timerMenu?.classList.toggle('active');
  dom.timerBtn?.setAttribute('aria-expanded', dom.timerMenu?.classList.contains('active') ? 'true' : 'false');
});

Array.from(document.querySelectorAll('.timer-option')).forEach((opt) => {
  opt.addEventListener('click', () => {
    const time = parseInt(opt.dataset.time, 10) || 0;
    state.featureState.timerDelay = time;

    document.querySelectorAll('.timer-option').forEach((o) => {
      o.classList.toggle('selected', o === opt);
      o.setAttribute('aria-checked', o === opt ? 'true' : 'false');
      o.tabIndex = o === opt ? 0 : -1;
    });

    dom.timerBtn?.classList.toggle('active', time > 0);
    dom.timerMenu?.classList.remove('active');
    dom.timerBtn?.setAttribute('aria-expanded', 'false');

    showStatus(time > 0 ? `⏱️ Timer: ${time}s` : '⏱️ Timer OFF', 1500);
  });
});

dom.flashlightBtn?.addEventListener('click', () => toggleTorch(dom, { showStatus }));

dom.filterBtn?.addEventListener('click', () => {
  dom.filterMenu?.classList.toggle('active');
  dom.filterBtn?.setAttribute('aria-expanded', dom.filterMenu?.classList.contains('active') ? 'true' : 'false');
});

Array.from(document.querySelectorAll('.filter-option')).forEach((opt) => {
  opt.addEventListener('click', () => {
    const filter = opt.dataset.filter || 'normal';
    state.featureState.currentFilter = filter;

    document.querySelectorAll('.filter-option').forEach((o) => {
      o.classList.toggle('selected', o === opt);
      o.setAttribute('aria-checked', o === opt ? 'true' : 'false');
      o.tabIndex = o === opt ? 0 : -1;
    });

    dom.filterBtn?.classList.toggle('active', filter !== 'normal');
    dom.filterMenu?.classList.remove('active');
    dom.filterBtn?.setAttribute('aria-expanded', 'false');

    applyPreviewEffects(dom);
    showStatus(`🎨 Filter: ${filter}`, 1500);
  });
});

dom.exposureBtn?.addEventListener('click', () => {
  const isActive = dom.exposureControl?.classList.toggle('active');
  dom.exposureBtn?.classList.toggle('active', Boolean(isActive));
});

dom.exposureSlider?.addEventListener('input', async (e) => {
  const value = parseFloat(e.target.value);
  state.featureState.exposureValue = clamp(value, -2, 2);
  await applyExposureToTrackOrPreview(dom);
});

dom.burstBtn?.addEventListener('click', () => {
  state.featureState.burstMode = !state.featureState.burstMode;
  state.featureState.burstCount = 0;
  const burstCounter = dom.burstIndicator?.querySelector('.burst-counter');
  if (burstCounter) burstCounter.textContent = `0/${state.featureState.maxBurstPhotos}`;

  applyFeatureUI(dom);
  showStatus(state.featureState.burstMode ? '📸 Burst Mode ON' : '📸 Burst Mode OFF', 1500);
});

// Close menus when clicking outside

document.addEventListener('click', (e) => {
  if (dom.timerBtn && dom.timerMenu && !dom.timerBtn.contains(e.target) && !dom.timerMenu.contains(e.target)) {
    dom.timerMenu.classList.remove('active');
    dom.timerBtn.setAttribute('aria-expanded', 'false');
  }
  if (dom.filterBtn && dom.filterMenu && !dom.filterBtn.contains(e.target) && !dom.filterMenu.contains(e.target)) {
    dom.filterMenu.classList.remove('active');
    dom.filterBtn.setAttribute('aria-expanded', 'false');
  }
  if (dom.exposureBtn && dom.exposureControl && !dom.exposureBtn.contains(e.target) && !dom.exposureControl.contains(e.target)) {
    dom.exposureControl.classList.remove('active');
    dom.exposureBtn.classList.remove('active');
  }
});

// Time update
setInterval(() => {
  if (!dom.dateTimeEl) return;
  const now = new Date();
  dom.dateTimeEl.textContent = now.toLocaleString(state.currentLang === 'ar' ? 'ar' : 'en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}, 1000);

// Wake lock events

dom.video?.addEventListener('play', requestWakeLock);

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && dom.video && !dom.video.paused) {
    requestWakeLock();
  } else if (document.visibilityState === 'hidden') {
    await releaseWakeLock();
  }
});

window.addEventListener('beforeunload', () => {
  stopSensors();
  if (state.videoStream) {
    try {
      state.videoStream.getTracks().forEach((t) => t.stop());
    } catch {}
  }
  releaseWakeLock();
  if (state.featureState.countdownIntervalId) clearInterval(state.featureState.countdownIntervalId);
});

window.addEventListener('resize', updateAppVh);
window.addEventListener('orientationchange', updateAppVh);

// Bootstrap
updateAppVh();
loadSettings(dom);
applyFeatureUI(dom);

// Initialize new features
console.log('🎯 Initializing advanced features...');
initTapToFocus(dom, dom.video);
initWhiteBalance(dom);
initQRScanner(dom);
initPhotoComparison(dom);
initMetadataExport(dom);
initHDRToggle(dom);
console.log('✅ Advanced features initialized');

async function bootstrap() {
  await loadPhotos(dom);
  updateGalleryUI(dom);
  checkStoredPermissionsAndBootstrap();
  registerServiceWorker();
}

bootstrap().catch((e) => {
  console.error('bootstrap failed', e);
  try {
    showStatus('❌ App init failed: ' + (e?.message || 'Unknown'), 5000);
  } catch {}
});

} // end initializeApp
