import { state } from '../state.js';
import { updateAppVh } from '../ui/viewport.js';
import { releaseWakeLock, requestWakeLock } from '../ui/wakelock.js';
import { stopSensors } from '../sensors/sensors.js';

const CLOCK_TICK_MS = 1000;

function bindWakeLock(dom) {
  dom.video?.addEventListener('play', requestWakeLock);

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && dom.video && !dom.video.paused) {
      requestWakeLock();
    } else if (document.visibilityState === 'hidden') {
      await releaseWakeLock();
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
  });
}

function bindViewportResize() {
  window.addEventListener('resize', updateAppVh);
  window.addEventListener('orientationchange', updateAppVh);
  window.visualViewport?.addEventListener('resize', updateAppVh);
  window.visualViewport?.addEventListener('scroll', updateAppVh);
}

function startClock(dom) {
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
  }, CLOCK_TICK_MS);
}

export function bindLifecycle(dom) {
  bindWakeLock(dom);
  bindBeforeUnload();
  bindViewportResize();
  startClock(dom);
}
