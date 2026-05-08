import { state } from '../state.js';
import { clamp, isDebugModeEnabled } from '../core/utils.js';
import { saveSettings } from '../core/settings.js';
import { applyFeatureUI } from '../ui/features.js';
import {
  applyExposureToTrackOrPreview,
  applyZoom,
  checkStorageQuota,
  initCamera,
  performCapture,
  startTimerCapture,
  toggleTorch
} from '../camera/camera.js';
import { updateGalleryUI } from '../gallery/gallery.js';
import { maybeUpdateCustomLocationFromWebFactory, requestPreciseLocation } from '../sensors/sensors.js';

const ZOOM_STEP = 0.5;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const STORAGE_QUOTA_CHECK_INTERVAL = 5;
const EXPOSURE_MIN = -2;
const EXPOSURE_MAX = 2;

function makeBurstUiHandler(dom) {
  return (kind) => {
    if (kind === 'count') {
      const burstCounter = dom.burstIndicator?.querySelector('.burst-counter');
      if (burstCounter) {
        burstCounter.textContent = `${state.featureState.burstCount}/${state.featureState.maxBurstPhotos}`;
      }
      return;
    }
    dom.burstBtn?.classList.remove('active');
    dom.burstIndicator?.classList.remove('active');
  };
}

function bindShutterButton(dom, { showStatus }) {
  if (!dom.shutterBtn) {
    console.error('❌ Shutter button NOT FOUND in DOM');
    showStatus(
      state.currentLang === 'ar'
        ? '❌ زر الالتقاط غير متوفر — أعد تحميل التطبيق'
        : '❌ Shutter button missing — please reload the app',
      6000
    );
    return;
  }

  dom.shutterBtn.addEventListener('click', async (event) => {
    event.preventDefault();

    if (dom.shutterBtn.classList.contains('disabled')) return;
    if (state.featureState.captureInProgress) {
      if (isDebugModeEnabled()) console.warn('⚠️ Capture already in progress');
      return;
    }

    if (isDebugModeEnabled()) {
      console.log('📷 Taking photo...', {
        hasVideoStream: Boolean(state.videoStream),
        timerDelay: state.featureState.timerDelay
      });
    }

    const onBurstUi = makeBurstUiHandler(dom);

    try {
      if (state.featureState.timerDelay > 0) {
        await startTimerCapture(dom, {
          showStatus,
          onCaptured: () => updateGalleryUI(dom),
          onBurstUi
        });
        return;
      }

      await performCapture(dom, {
        showStatus,
        onCaptured: async () => {
          updateGalleryUI(dom);
          if (state.photos.length % STORAGE_QUOTA_CHECK_INTERVAL === 0) {
            await checkStorageQuota({ showStatus });
          }
        },
        onBurstUi
      });
    } catch (err) {
      console.error('❌ Capture failed:', err);
      showStatus('❌ Capture failed: ' + (err?.message || 'Unknown error'), 3500);
    }
  });
}

function bindFlipCamera(dom, { showStatus }) {
  dom.flipCameraBtn?.addEventListener('click', async () => {
    state.settings.cameraFacingMode = state.settings.cameraFacingMode === 'user' ? 'environment' : 'user';
    saveSettings();
    await initCamera(dom, { showStatus });
  });
}

function bindZoomButtons(dom) {
  const apply = (delta) => {
    state.zoomLevel = clamp(state.zoomLevel + delta, MIN_ZOOM, MAX_ZOOM);
    applyZoom(dom);
  };
  dom.zoomInBtn?.addEventListener('click', () => apply(ZOOM_STEP));
  dom.zoomOutBtn?.addEventListener('click', () => apply(-ZOOM_STEP));
}

function bindGridToggle(dom, { showStatus }) {
  dom.gridBtn?.addEventListener('click', () => {
    state.featureState.gridEnabled = !state.featureState.gridEnabled;
    applyFeatureUI(dom);
    showStatus(state.featureState.gridEnabled ? '⊞ Grid ON' : '⊞ Grid OFF', 1500);
  });
}

function bindLevelToggle(dom, { showStatus }) {
  dom.levelBtn?.addEventListener('click', () => {
    state.featureState.levelEnabled = !state.featureState.levelEnabled;
    applyFeatureUI(dom);
    showStatus(state.featureState.levelEnabled ? '⚖️ Level ON' : '⚖️ Level OFF', 1500);
  });
}

function bindGpsPrecision(dom, { showStatus }) {
  if (!dom.gpsPrecisionBtn) return;

  dom.gpsPrecisionBtn.addEventListener('click', async () => {
    dom.gpsPrecisionBtn.disabled = true;
    showStatus(
      state.currentLang === 'ar' ? '🔄 تحسين دقة الموقع...' : '🔄 Improving location accuracy...',
      1800
    );

    const maybeUpdate = maybeUpdateCustomLocationFromWebFactory(dom);
    const improved = await requestPreciseLocation(dom, {
      showStatus,
      maybeUpdateCustomLocationFromWeb: maybeUpdate
    });

    applyFeatureUI(dom);
    dom.gpsPrecisionBtn.disabled = false;

    if (!improved) {
      showStatus(
        state.currentLang === 'ar' ? '❌ تعذر تحسين دقة الموقع' : '❌ Could not improve location accuracy',
        3000
      );
      return;
    }

    const accuracy = Math.round(state.currentAccuracy || 0);
    showStatus(
      state.currentLang === 'ar' ? `✅ تم تحسين الدقة: ${accuracy}م` : `✅ Accuracy improved: ${accuracy}m`,
      2200
    );
  });
}

function bindFlashlight(dom, { showStatus }) {
  dom.flashlightBtn?.addEventListener('click', () => toggleTorch(dom, { showStatus }));
}

function bindExposureControls(dom) {
  dom.exposureBtn?.addEventListener('click', () => {
    const isActive = dom.exposureControl?.classList.toggle('active');
    dom.exposureBtn?.classList.toggle('active', Boolean(isActive));
  });

  dom.exposureSlider?.addEventListener('input', async (e) => {
    state.featureState.exposureValue = clamp(parseFloat(e.target.value), EXPOSURE_MIN, EXPOSURE_MAX);
    await applyExposureToTrackOrPreview(dom);
  });
}

function bindBurstToggle(dom, { showStatus }) {
  dom.burstBtn?.addEventListener('click', () => {
    state.featureState.burstMode = !state.featureState.burstMode;
    state.featureState.burstCount = 0;
    const burstCounter = dom.burstIndicator?.querySelector('.burst-counter');
    if (burstCounter) burstCounter.textContent = `0/${state.featureState.maxBurstPhotos}`;

    applyFeatureUI(dom);
    showStatus(state.featureState.burstMode ? '📸 Burst Mode ON' : '📸 Burst Mode OFF', 1500);
  });
}

export function bindCaptureControls(dom, env) {
  bindShutterButton(dom, env);
  bindFlipCamera(dom, env);
  bindZoomButtons(dom);
  bindGridToggle(dom, env);
  bindLevelToggle(dom, env);
  bindGpsPrecision(dom, env);
  bindFlashlight(dom, env);
  bindExposureControls(dom);
  bindBurstToggle(dom, env);
}
