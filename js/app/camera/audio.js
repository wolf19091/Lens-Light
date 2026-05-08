import { state } from '../state.js';

/**
 * Plays a short tone via WebAudio. Lazily creates a single AudioContext and
 * resumes it on demand to handle iOS autoplay policy.
 */
export function playBeep(frequency = 800, durationSec = 0.1, gain = 0.08) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!playBeep.ctx) playBeep.ctx = new AudioCtx();
    const ac = playBeep.ctx;
    if (ac.state === 'suspended') ac.resume().catch(() => {});

    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.frequency.value = frequency;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + durationSec);
  } catch {
    // ignore
  }
}

export function playCameraShutter() {
  if (!state.settings.cameraSound) return;
  playBeep(1200, 0.05, 0.12);
}
