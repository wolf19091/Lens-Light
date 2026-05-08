import { isDebugModeEnabled } from '../core/utils.js';

/**
 * Logs diagnostic state about the <video> element. Runs only when the user
 * enables Debug Logging in Settings (sets `localStorage.debug_mode = 'true'`).
 *
 * Attaches a one-time `error` listener so subsequent playback failures are
 * captured without doubling up across calls.
 */
export function inspectVideoDebugState(dom) {
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
      ? { code: video.error.code, message: video.error.message || '(no message)' }
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
