import { state } from '../state.js';
import { updateAppVh, scheduleAppVhAfterRotation } from '../ui/viewport.js';
import { bindUiRotation } from '../ui/orientation.js';
import { releaseWakeLock, requestWakeLock } from '../ui/wakelock.js';
import { stopSensors } from '../sensors/sensors.js';
import { initCamera } from '../camera/camera.js';

const CLOCK_TICK_MS = 1000;
// Guard against overlapping recovery attempts when the OS fires
// visibilitychange/pageshow/focus back-to-back as the user returns from
// the share sheet or a download prompt.
let cameraRecoveryInFlight = false;
// Tracked so the wall-clock tick can be stopped on unload.
let clockIntervalId = null;

/** True iff `stream` has at least one live, non-muted video track. */
function isStreamLive(stream) {
  if (!stream) return false;
  const tracks = (stream.getVideoTracks?.() || []);
  if (tracks.length === 0) return false;
  return tracks.some((track) => track.readyState === 'live' && !track.muted);
}

/**
 * After share/export the OS often pauses the camera track or revokes the
 * stream entirely. When the page becomes visible again we try the cheap
 * fix first (`video.play()`); if the underlying tracks are actually dead
 * we re-run `initCamera` so the preview comes back to life instead of
 * leaving the user looking at a frozen frame.
 */
async function recoverCameraIfNeeded(dom, env) {
  if (cameraRecoveryInFlight) return;
  if (!dom?.video) return;
  // Nothing to recover if the camera was never started (e.g. permission
  // not yet granted) — the permission flow will start it when ready.
  if (!state.videoStream) return;

  cameraRecoveryInFlight = true;
  try {
    if (isStreamLive(state.videoStream)) {
      // Stream is healthy; just nudge the element in case the OS paused it.
      if (dom.video.paused) {
        try { await dom.video.play(); } catch {}
      }
      return;
    }

    // Tracks are ended or muted — only a fresh getUserMedia call brings
    // the preview back. initCamera() guards against overlapping requests
    // internally via state.initCameraRequestId.
    await initCamera(dom, { showStatus: env?.showStatus });
  } finally {
    cameraRecoveryInFlight = false;
  }
}

function bindWakeLock(dom, env) {
  dom.video?.addEventListener('play', requestWakeLock);

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      await recoverCameraIfNeeded(dom, env);
      if (dom.video && !dom.video.paused) requestWakeLock();
    } else {
      await releaseWakeLock();
    }
  });

  // BFCache restores (back-button on Android, swipe-back on iOS Safari)
  // don't always trigger visibilitychange but do fire pageshow.
  window.addEventListener('pageshow', () => {
    if (document.visibilityState === 'visible') {
      recoverCameraIfNeeded(dom, env);
    }
  });
}

function bindBeforeUnload() {
  window.addEventListener('beforeunload', () => {
    stopSensors();
    if (state.videoStream) {
      try { state.videoStream.getTracks().forEach((track) => track.stop()); } catch {}
    }
    releaseWakeLock();
    if (state.featureState.countdownIntervalId) clearInterval(state.featureState.countdownIntervalId);
    if (clockIntervalId) clearInterval(clockIntervalId);
  });
}

function bindViewportResize() {
  updateAppVh();
  window.addEventListener('resize', updateAppVh);
  window.addEventListener('orientationchange', scheduleAppVhAfterRotation);
  window.addEventListener('pageshow', updateAppVh);
  window.visualViewport?.addEventListener('resize', updateAppVh);
  window.visualViewport?.addEventListener('scroll', updateAppVh);
}

function startClock(dom) {
  if (clockIntervalId) clearInterval(clockIntervalId);
  clockIntervalId = setInterval(() => {
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
  }, CLOCK_TICK_MS);
}

export function bindLifecycle(dom, env = {}) {
  bindWakeLock(dom, env);
  bindBeforeUnload();
  bindViewportResize();
  bindUiRotation();
  startClock(dom);
}
