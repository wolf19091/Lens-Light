import { getDom } from './app/dom.js';
import { state } from './app/state.js';
import { createStatus } from './app/core/status.js';
import { t, tFmt, setLanguage } from './app/core/i18n.js';
import { loadSettings, saveSettings, bindSettingsUi } from './app/core/settings.js';
import { applyFeatureUI } from './app/ui/features.js';
import { updateAppVh } from './app/ui/viewport.js';
import { requestWakeLock, releaseWakeLock } from './app/ui/wakelock.js';
import { registerServiceWorker } from './app/pwa/pwa.js';
import { APP_VERSION } from './version.js';
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
  updatePhotoComment,
  updateSelectAllButton,
  getGalleryPhotos,
  getProjectPhotoCount,
  getActiveProjectName
} from './app/gallery/gallery.js';
import { clearAllPhotos, dbGetPhoto, dbPutPhoto } from './app/storage/photoDb.js';
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
import { clamp, sanitizeInput, PHOTOS_CHANGED_EVENT } from './app/core/utils.js';
import { startSensors, stopSensors, maybeUpdateCustomLocationFromWebFactory, updateWeatherDisplay, requestPreciseLocation } from './app/sensors/sensors.js';

// NEW FEATURES
import { initTapToFocus } from './app/features/focus.js';
import { initWhiteBalance } from './app/features/whitebalance.js';
import { initQRScanner } from './app/features/qrscanner.js';
import { initPhotoComparison, updateComparisonButton } from './app/features/comparison.js';
import { initMetadataExport } from './app/features/metadata.js';
import { initHDRToggle } from './app/features/hdr.js';

// Log version at startup
console.log(`📱 Lens Light v${APP_VERSION}`);

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

function isTouchPrimaryInput() {
  return Boolean(
    window.matchMedia?.('(pointer: coarse)')?.matches ||
    window.matchMedia?.('(hover: none)')?.matches ||
    navigator.maxTouchPoints > 0
  );
}

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

// Diagnostic tooling — only runs when the user explicitly enables Debug Logging
// in Settings (sets localStorage.debug_mode = 'true'). The third-party test-video
// fallback is fully removed: it broke offline behaviour and only existed to
// validate the <video> render path during development.
function isDebugModeEnabled() {
  try {
    return localStorage.getItem('debug_mode') === 'true';
  } catch {
    return false;
  }
}

function inspectVideoDebugState(dom) {
  if (!isDebugModeEnabled()) return;
  const video = dom?.video;
  if (!video) return;

  const srcAttr = video.getAttribute('src');
  const sourceValues = Array.from(video.querySelectorAll('source'))
    .map((el) => el.getAttribute('src'))
    .filter(Boolean);

  console.log('🎥 Video element investigation', {
    srcAttribute: srcAttr || '(none)',
    sourceChildren: sourceValues.length ? sourceValues : ['(none)'],
    hasSrcObject: Boolean(video.srcObject),
    readyState: video.readyState,
    paused: video.paused,
    networkState: video.networkState,
    error: video.error
      ? {
          code: video.error.code,
          message: video.error.message || '(no message)'
        }
      : null
  });

  if (video.error) {
    console.error('❌ video.error detected', {
      code: video.error.code,
      message: video.error.message || '(no message)'
    });
  }

  if (!video.__debugErrorListenerAdded) {
    video.addEventListener('error', () => {
      const err = video.error;
      console.error('❌ Video playback error event', {
        code: err?.code,
        message: err?.message || '(no message)'
      });
    });
    video.__debugErrorListenerAdded = true;
  }

  if (!video.srcObject && !srcAttr && sourceValues.length === 0 && video.readyState === 0) {
    console.warn('⚠️ Video has no source and readyState is 0. Check camera stream connection (getUserMedia/srcObject).');
  }
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

function syncProjectInputs(projectName = state.settings.projectName || '') {
  if (dom.projectNameInput) dom.projectNameInput.value = projectName;
  if (dom.projectPanelNameInput) dom.projectPanelNameInput.value = projectName;
  dom.projectBtn?.classList.toggle('active', Boolean(projectName));
}

function applyProjectUiText() {
  const activeProject = getActiveProjectName();
  const buttonLabel = t('projectButtonLabel');
  const closeLabel = t('projectClose');

  if (dom.projectBtn) {
    dom.projectBtn.title = buttonLabel;
    dom.projectBtn.setAttribute('aria-label', buttonLabel);
  }

  if (dom.projectPanelTitle) dom.projectPanelTitle.textContent = t('projectPanelTitle');
  if (dom.projectPanelNameLabel) dom.projectPanelNameLabel.textContent = t('projectNameLabel');
  if (dom.projectPanelNameInput) dom.projectPanelNameInput.placeholder = t('projectPlaceholder');
  if (dom.projectPanelCopy) dom.projectPanelCopy.textContent = t('projectCopy');
  if (dom.projectCurrentLabel) dom.projectCurrentLabel.textContent = activeProject ? t('projectActiveLabel') : t('projectNoneOpen');
  if (dom.projectCurrentName) dom.projectCurrentName.textContent = activeProject || t('projectNoneHint');
  if (dom.openProjectBtn) dom.openProjectBtn.textContent = t('projectOpenAction');
  if (dom.takeProjectPhotoBtn) dom.takeProjectPhotoBtn.textContent = t('projectTakePhoto');
  if (dom.openProjectGalleryBtn) dom.openProjectGalleryBtn.textContent = t('projectOpenPhotos');
  if (dom.addProjectPhotoBtn) dom.addProjectPhotoBtn.textContent = t('projectAddPhotos');
  if (dom.closeActiveProjectBtn) dom.closeActiveProjectBtn.textContent = t('projectCloseAction');
  if (dom.projectListTitle) dom.projectListTitle.textContent = t('projectFiles');
  if (dom.closeProjectPanelBtn) {
    dom.closeProjectPanelBtn.textContent = closeLabel;
    dom.closeProjectPanelBtn.setAttribute('aria-label', closeLabel);
  }
}

function openProjectPanel() {
  refreshProjectManagerUi();
  dom.projectPanelBackdrop?.classList.add('active');
  dom.projectPanel?.classList.add('open');
  dom.projectPanel?.setAttribute('aria-hidden', 'false');
  if (!isTouchPrimaryInput()) {
    dom.projectPanelNameInput?.focus?.();
    dom.projectPanelNameInput?.select?.();
  }
}

function closeProjectPanel() {
  dom.projectPanelNameInput?.blur?.();
  dom.projectPanelBackdrop?.classList.remove('active');
  dom.projectPanel?.classList.remove('open');
  dom.projectPanel?.setAttribute('aria-hidden', 'true');
  if (!isTouchPrimaryInput()) dom.projectBtn?.focus?.();
}

function getProjectFiles() {
  const seen = new Set();
  const files = [];
  const add = (value) => {
    const name = sanitizeInput(value).trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    files.push(name);
  };

  if (Array.isArray(state.settings.savedProjects)) {
    state.settings.savedProjects.forEach(add);
  }
  state.photos.forEach((photo) => add(photo.projectName));
  add(state.settings.projectName);

  return files.sort((a, b) => a.localeCompare(b, state.currentLang === 'ar' ? 'ar' : 'en', { sensitivity: 'base' }));
}

function syncSavedProjectFiles({ persist = true } = {}) {
  const next = getProjectFiles();
  const current = Array.isArray(state.settings.savedProjects) ? state.settings.savedProjects : [];
  const changed = next.length !== current.length || next.some((name, index) => name !== current[index]);

  if (changed) {
    state.settings.savedProjects = next;
    if (persist) saveSettings();
  }

  return next;
}

function updateActiveProjectBadge() {
  const activeProject = getActiveProjectName();

  if (!dom.activeProjectBadge) return;

  if (!activeProject) {
    dom.activeProjectBadge.style.display = 'none';
    dom.activeProjectBadge.textContent = '';
    return;
  }

  dom.activeProjectBadge.style.display = 'inline-flex';
  dom.activeProjectBadge.textContent = activeProject;
  dom.activeProjectBadge.setAttribute('aria-label', activeProject);
}

function renderProjectFiles() {
  if (!dom.projectList) return;

  const files = syncSavedProjectFiles({ persist: false });
  const activeProject = getActiveProjectName();
  dom.projectList.innerHTML = '';

  if (files.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'project-list-empty';
    empty.textContent = t('projectNoSaved');
    dom.projectList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const name of files) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'project-file';
    if (name === activeProject) item.classList.add('active');
    item.dataset.projectName = name;

    const icon = document.createElement('span');
    icon.className = 'project-file-icon';
    icon.textContent = '🗂️';

    const body = document.createElement('span');
    body.className = 'project-file-body';

    const title = document.createElement('span');
    title.className = 'project-file-name';
    title.textContent = name;

    const meta = document.createElement('span');
    meta.className = 'project-file-meta';
    meta.textContent = tFmt('projectFileMeta', { count: getProjectPhotoCount(name) });

    body.appendChild(title);
    body.appendChild(meta);
    item.appendChild(icon);
    item.appendChild(body);
    fragment.appendChild(item);
  }

  dom.projectList.appendChild(fragment);
}

function refreshProjectManagerUi() {
  syncSavedProjectFiles({ persist: true });
  syncProjectInputs(state.settings.projectName || '');
  applyProjectUiText();
  updateActiveProjectBadge();
  renderProjectFiles();
  updateGalleryUI(dom);
}

window.addEventListener(PHOTOS_CHANGED_EVENT, () => {
  refreshProjectManagerUi();
});

function openProjectFile(projectName, { announce = true, closePanelAfter = false } = {}) {
  const nextProject = sanitizeInput(projectName).trim();
  if (!nextProject) {
    showStatus(t('projectNameRequired'), 2200);
    dom.projectPanelNameInput?.focus?.();
    return null;
  }

  state.settings.projectName = nextProject;
  state.settings.savedProjects = getProjectFiles();
  saveSettings();
  refreshProjectManagerUi();

  if (dom.galleryModal?.classList.contains('open')) {
    exitSelectMode(dom);
    renderGallery(dom, galleryObserver, { showStatus });
  }

  if (announce) showStatus(tFmt('projectOpened', { name: nextProject }), 1800);
  if (closePanelAfter) closeProjectPanel();
  return nextProject;
}

function closeProjectFile({ announce = true } = {}) {
  if (!getActiveProjectName()) return;

  state.settings.projectName = '';
  saveSettings();
  refreshProjectManagerUi();

  if (dom.galleryModal?.classList.contains('open')) {
    exitSelectMode(dom);
    renderGallery(dom, galleryObserver, { showStatus });
  }

  if (announce) showStatus(t('projectClosed'), 1800);
}

function openActiveProjectGallery() {
  const activeProject = openProjectFile(dom.projectPanelNameInput?.value ?? state.settings.projectName, {
    announce: false,
    closePanelAfter: false
  });
  if (!activeProject) return;

  dom.galleryModal?.classList.add('open');
  dom.galleryModal?.setAttribute('aria-hidden', 'false');
  renderGallery(dom, galleryObserver, { showStatus });
  if (getGalleryPhotos().length > 0 && dom.selectModeBtn) dom.selectModeBtn.style.display = 'block';
  if (!isTouchPrimaryInput()) dom.closeGalleryBtn?.focus?.();
  closeProjectPanel();
}

function armActiveProjectForCapture() {
  const activeProject = openProjectFile(dom.projectPanelNameInput?.value ?? state.settings.projectName, {
    announce: false,
    closePanelAfter: true
  });
  if (!activeProject) return;

  showStatus(tFmt('projectReadyForCapture', { name: activeProject }), 1800);
  if (!isTouchPrimaryInput()) dom.shutterBtn?.focus?.();
}

async function importIntoActiveProject(fileList) {
  const files = Array.from(fileList || []).filter((file) => file && String(file.type || '').startsWith('image/'));
  if (files.length === 0) {
    showStatus(t('projectNoImagesSelected'), 2200);
    return;
  }

  const activeProject = openProjectFile(dom.projectPanelNameInput?.value ?? state.settings.projectName, {
    announce: false,
    closePanelAfter: false
  });

  if (!activeProject) {
    if (dom.projectPhotoInput) dom.projectPhotoInput.value = '';
    return;
  }

  let importedCount = 0;
  let lastImportedId = null;
  const baseId = Date.now();

  for (const [index, file] of files.entries()) {
    const photoId = baseId + index;
    const timestampSeed = Number.isFinite(file.lastModified) && file.lastModified > 0
      ? file.lastModified
      : Date.now() + index;

    try {
      await dbPutPhoto({
        id: photoId,
        timestamp: new Date(timestampSeed).toISOString(),
        lat: state.currentLat,
        lon: state.currentLon,
        alt: state.currentAlt,
        heading: state.currentHeading,
        projectName: activeProject,
        location: state.settings.customLocation,
        comment: '',
        mime: file.type || 'image/jpeg',
        filter: 'normal',
        blob: file
      });
      importedCount += 1;
      lastImportedId = photoId;
    } catch (error) {
      console.error('Project photo import failed', file?.name, error);
    }
  }

  if (dom.projectPhotoInput) dom.projectPhotoInput.value = '';

  if (!importedCount) {
    showStatus(t('projectImportFailed'), 3000);
    return;
  }

  if (lastImportedId) state.lastCapturedPhotoId = lastImportedId;

  await loadPhotos(dom);
  state.settings.savedProjects = getProjectFiles();
  saveSettings();
  refreshProjectManagerUi();

  if (dom.galleryModal?.classList.contains('open')) {
    renderGallery(dom, galleryObserver, { showStatus });
  }

  showStatus(tFmt('projectAddedCount', { count: importedCount }), 2200);
}

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
  // Shutter button is critical to the app's purpose; surface the failure via
  // the non-blocking status banner and keep the rest of the UI usable.
  console.error('❌ Shutter button NOT FOUND in DOM');
  showStatus(
    state.currentLang === 'ar'
      ? '❌ زر الالتقاط غير متوفر — أعد تحميل التطبيق'
      : '❌ Shutter button missing — please reload the app',
    6000
  );
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
  loadSettings: (d) => loadSettings(d),
  syncProjectUi: () => refreshProjectManagerUi()
});

dom.languageSelect?.addEventListener('change', () => refreshProjectManagerUi());

dom.projectBtn?.addEventListener('click', () => openProjectPanel());
dom.projectPanelBackdrop?.addEventListener('click', () => closeProjectPanel());
dom.closeProjectPanelBtn?.addEventListener('click', () => closeProjectPanel());
dom.openProjectBtn?.addEventListener('click', () => {
  openProjectFile(dom.projectPanelNameInput?.value ?? state.settings.projectName, { announce: true, closePanelAfter: false });
});
dom.projectPanelNameInput?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  openProjectFile(dom.projectPanelNameInput?.value ?? state.settings.projectName, { announce: true, closePanelAfter: false });
});
dom.takeProjectPhotoBtn?.addEventListener('click', () => {
  armActiveProjectForCapture();
});
dom.openProjectGalleryBtn?.addEventListener('click', () => {
  openActiveProjectGallery();
});
dom.addProjectPhotoBtn?.addEventListener('click', () => {
  const projectName = openProjectFile(dom.projectPanelNameInput?.value ?? state.settings.projectName, {
    announce: false,
    closePanelAfter: false
  });
  if (!projectName) return;
  dom.projectPhotoInput?.click();
});
dom.closeActiveProjectBtn?.addEventListener('click', () => {
  closeProjectFile({ announce: true });
});
dom.projectList?.addEventListener('click', (event) => {
  const button = event.target.closest('.project-file');
  if (!button) return;
  const projectName = button.dataset.projectName || '';
  openProjectFile(projectName, { announce: true, closePanelAfter: false });
});
dom.projectPhotoInput?.addEventListener('change', async (event) => {
  await importIntoActiveProject(event.target.files);
});

// Gallery modal
if (dom.galleryBtn) {
  dom.galleryBtn.addEventListener('click', () => {
    dom.galleryModal?.classList.add('open');
    dom.galleryModal?.setAttribute('aria-hidden', 'false');
    renderGallery(dom, galleryObserver, { showStatus });
    if (getGalleryPhotos().length > 0 && dom.selectModeBtn) dom.selectModeBtn.style.display = 'block';
    if (!isTouchPrimaryInput()) dom.closeGalleryBtn?.focus?.();
  });
}

dom.closeGalleryBtn?.addEventListener('click', () => {
  exitSelectMode(dom);
  closePhotoViewer(dom);
  revokeAllPhotoObjectUrls();
  dom.galleryModal?.classList.remove('open');
  // Move focus out of the dialog before hiding it from assistive tech.
  if (!isTouchPrimaryInput()) dom.galleryBtn?.focus?.();
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
  const allIds = getGalleryPhotos().map((p) => p.id);
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
    dom.galleryModal?.setAttribute('aria-hidden', 'false');
    renderGallery(dom, galleryObserver, { showStatus });
    if (getGalleryPhotos().length > 0 && dom.selectModeBtn) dom.selectModeBtn.style.display = 'block';
    if (!isTouchPrimaryInput()) dom.closeGalleryBtn?.focus?.();
    showStatus(
      getGalleryPhotos().length > 0
        ? state.currentLang === 'ar'
          ? 'اختر صورة للمشاركة/الحفظ'
          : 'Select a photo to share/save'
        : state.currentLang === 'ar'
          ? 'لا توجد صور في المشروع المفتوح بعد'
          : 'No photos in the open project yet',
      2000
    );
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

dom.gpsPrecisionBtn?.addEventListener('click', async () => {
  dom.gpsPrecisionBtn.disabled = true;
  showStatus(state.currentLang === 'ar' ? '🔄 تحسين دقة الموقع...' : '🔄 Improving location accuracy...', 1800);

  const maybeUpdate = maybeUpdateCustomLocationFromWebFactory(dom);
  const improved = await requestPreciseLocation(dom, {
    showStatus,
    maybeUpdateCustomLocationFromWeb: maybeUpdate
  });

  applyFeatureUI(dom);
  dom.gpsPrecisionBtn.disabled = false;

  if (!improved) {
    showStatus(state.currentLang === 'ar' ? '❌ تعذر تحسين دقة الموقع' : '❌ Could not improve location accuracy', 3000);
    return;
  }

  const accuracy = Math.round(state.currentAccuracy || 0);
  showStatus(
    state.currentLang === 'ar'
      ? `✅ تم تحسين الدقة: ${accuracy}م`
      : `✅ Accuracy improved: ${accuracy}m`,
    2200
  );
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
window.visualViewport?.addEventListener('resize', updateAppVh);
window.visualViewport?.addEventListener('scroll', updateAppVh);

// Bootstrap
updateAppVh();
loadSettings(dom);
refreshProjectManagerUi();
applyFeatureUI(dom);
inspectVideoDebugState(dom);

// Display version in UI
const versionEl = document.getElementById('app-version');
if (versionEl) {
  versionEl.textContent = `v${APP_VERSION}`;
}

// Initialize new features
console.log('🎯 Initializing advanced features...');
initTapToFocus(dom, dom.video);
initWhiteBalance(dom);
initQRScanner(dom);
initPhotoComparison(dom);
initMetadataExport(dom, { showStatus });
initHDRToggle(dom);
console.log('✅ Advanced features initialized');

async function bootstrap() {
  await loadPhotos(dom);
  refreshProjectManagerUi();
  checkStoredPermissionsAndBootstrap();
  setTimeout(() => inspectVideoDebugState(dom), 2500);
  registerServiceWorker();
}

bootstrap().catch((e) => {
  console.error('bootstrap failed', e);
  try {
    showStatus('❌ App init failed: ' + (e?.message || 'Unknown'), 5000);
  } catch {}
});

} // end initializeApp
