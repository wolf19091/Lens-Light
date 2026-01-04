import { state } from '../state.js';

export async function requestWakeLock() {
  try {
    if (!('wakeLock' in navigator)) return;
    if (state.wakeLock) await state.wakeLock.release().catch(() => {});
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => {});
  } catch (e) {
    console.warn('wakeLock failed', e);
  }
}

export async function releaseWakeLock() {
  if (!state.wakeLock) return;
  try {
    await state.wakeLock.release();
  } catch {}
  state.wakeLock = null;
}
