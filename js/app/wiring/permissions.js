import { t } from '../core/i18n.js';
import { isDebugModeEnabled } from '../core/utils.js';
import { initCamera } from '../camera/camera.js';
import { startSensors, maybeUpdateCustomLocationFromWebFactory } from '../sensors/sensors.js';

// localStorage keys for the persisted grant flags. Exported so other modules
// (e.g. Clear All Data) can preserve them instead of hardcoding the strings.
export const PERMISSION_FLAGS = ['camera_granted', 'sensors_granted'];

/**
 * Asks the browser what it actually remembers about a permission.
 * Returns 'granted' | 'denied' | 'prompt' | 'unsupported' (Safari doesn't
 * expose 'camera' through the Permissions API on older versions).
 */
async function queryPermission(name) {
  try {
    if (!navigator.permissions?.query) return 'unsupported';
    const status = await navigator.permissions.query({ name });
    return status.state;
  } catch {
    return 'unsupported';
  }
}

// iOS 13+ gates DeviceOrientationEvent behind a user-gesture prompt, so on
// those devices sensors can never auto-start — the button must be tapped once.
const needsOrientationGesture = () =>
  typeof DeviceOrientationEvent !== 'undefined' &&
  typeof DeviceOrientationEvent.requestPermission === 'function';

/**
 * Examines persisted grant flags and bootstraps the camera/sensors directly
 * if the user has previously approved both. Otherwise displays the appropriate
 * permission button so the user can re-grant explicitly.
 *
 * The stored flags are resynced against the browser's real permission state
 * first, so the app recovers from Clear All Data (flags lost but browser still
 * remembers the grant) and stops silently re-prompting after the user revokes
 * access from the browser's site settings.
 */
export async function checkStoredPermissionsAndBootstrap(dom, { showStatus }) {
  const camState = await queryPermission('camera');
  const geoState = await queryPermission('geolocation');

  if (camState === 'granted') localStorage.setItem('camera_granted', 'true');
  else if (camState === 'denied') localStorage.removeItem('camera_granted');

  if (geoState === 'denied') localStorage.removeItem('sensors_granted');
  else if (geoState === 'granted' && !needsOrientationGesture()) {
    // Non-iOS: orientation needs no gesture, so a remembered location grant is
    // the only sensor gate — safe to auto-start without showing the button.
    localStorage.setItem('sensors_granted', 'true');
  }

  const cameraGranted = localStorage.getItem('camera_granted') === 'true';
  const sensorsGranted = localStorage.getItem('sensors_granted') === 'true';

  if (isDebugModeEnabled()) console.log('🚀 Bootstrap check:', { camState, geoState, cameraGranted, sensorsGranted });

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

/**
 * The full grant flow: camera → iOS orientation gesture → sensors. Shared by
 * the on-screen permission button and the Settings "re-enable" action (both
 * are user gestures, which iOS requires for the orientation prompt).
 * Returns true when everything is up and running.
 */
async function runPermissionFlow(dom, { showStatus }) {
  // A hard browser-level deny can't be re-prompted from JS — getUserMedia
  // would reject instantly. Tell the user where to unblock it instead.
  const camState = await queryPermission('camera');
  const geoState = await queryPermission('geolocation');
  if (camState === 'denied' || geoState === 'denied') {
    showStatus(t('permBlockedHint'), 6000);
    return false;
  }

  const cameraGranted = localStorage.getItem('camera_granted') === 'true';
  if (!cameraGranted || !dom.video?.srcObject) {
    const ok = await initCamera(dom, { showStatus });
    if (!ok) return false;
  }

  // iOS 13+ requires an explicit prompt for DeviceOrientationEvent.
  if (needsOrientationGesture()) {
    const permission = await DeviceOrientationEvent.requestPermission();
    if (permission !== 'granted') {
      showStatus(t('permissionDenied'), 3000);
      return false;
    }
  }

  localStorage.setItem('sensors_granted', 'true');
  if (dom.permBtn) dom.permBtn.style.display = 'none';
  showStatus(t('sensorsEnabled'), 2000);

  const maybeUpdate = maybeUpdateCustomLocationFromWebFactory(dom);
  startSensors(dom, { showStatus, maybeUpdateCustomLocationFromWeb: maybeUpdate });
  return true;
}

export function bindPermissionButton(dom, { showStatus }) {
  dom.permBtn?.addEventListener('click', async () => {
    dom.permBtn.disabled = true;
    try {
      await runPermissionFlow(dom, { showStatus });
    } catch (e) {
      console.error('permission flow failed', e);
      showStatus('❌ Permission failed: ' + (e?.message || 'Unknown'), 3000);
    } finally {
      dom.permBtn.disabled = false;
    }
  });

  // Settings → "Re-enable Camera & Location": same flow, available even when
  // the main permission button is hidden (e.g. flags say granted but the
  // stream died, or the user denied earlier and wants to retry).
  dom.reenablePermsBtn?.addEventListener('click', async () => {
    dom.reenablePermsBtn.disabled = true;
    try {
      const ok = await runPermissionFlow(dom, { showStatus });
      if (ok) {
        dom.settingsPanel?.classList.remove('open');
        dom.settingsPanel?.setAttribute('aria-hidden', 'true');
      }
    } catch (e) {
      console.error('re-enable permission flow failed', e);
      showStatus('❌ Permission failed: ' + (e?.message || 'Unknown'), 3000);
    } finally {
      dom.reenablePermsBtn.disabled = false;
    }
  });
}
