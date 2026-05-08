import { t } from '../core/i18n.js';
import { isDebugModeEnabled } from '../core/utils.js';
import { initCamera } from '../camera/camera.js';
import { startSensors, maybeUpdateCustomLocationFromWebFactory } from '../sensors/sensors.js';

/**
 * Examines persisted grant flags and bootstraps the camera/sensors directly
 * if the user has previously approved both. Otherwise displays the appropriate
 * permission button so the user can re-grant explicitly.
 */
export function checkStoredPermissionsAndBootstrap(dom, { showStatus }) {
  const cameraGranted = localStorage.getItem('camera_granted') === 'true';
  const sensorsGranted = localStorage.getItem('sensors_granted') === 'true';

  if (isDebugModeEnabled()) console.log('🚀 Bootstrap check:', { cameraGranted, sensorsGranted });

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

export function bindPermissionButton(dom, { showStatus }) {
  if (!dom.permBtn) return;

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

      // iOS 13+ requires an explicit prompt for DeviceOrientationEvent.
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
