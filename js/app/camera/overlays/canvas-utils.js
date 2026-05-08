import { sleep } from '../../core/utils.js';

export function traceRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function fillRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.save();
  ctx.fillStyle = fillStyle;
  traceRoundedRect(ctx, x, y, width, height, radius);
  ctx.fill();
  ctx.restore();
}

export function createSeededRandom(seedA = 0, seedB = 0) {
  let seed = (
    (Math.abs(Math.round(seedA * 1e6)) * 2654435761) ^
    Math.abs(Math.round(seedB * 1e6)) ^
    0x9e3779b9
  ) >>> 0;

  if (!seed) seed = 0x12345678;

  return function next() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function wrapTextIntoLines(ctx, text, maxWidth, maxLines = 2) {
  const value = String(text || '').trim();
  if (!value) return [];
  const safeMaxWidth = Math.max(1, maxWidth || 0);
  const safeMaxLines = Math.max(1, Math.floor(maxLines || 1));
  const words = value.split(/\s+/);
  const lines = [];

  const fitSingleLine = (line) => {
    let output = String(line || '').trim();
    if (!output) return '';
    if (ctx.measureText(output).width <= safeMaxWidth) return output;
    while (output.length > 1 && ctx.measureText(`${output}...`).width > safeMaxWidth) {
      output = output.slice(0, -1).trimEnd();
    }
    return output ? `${output}...` : '';
  };

  if (safeMaxLines === 1) {
    const line = fitSingleLine(value);
    return line ? [line] : [];
  }

  let wordIndex = 0;
  while (wordIndex < words.length && lines.length < safeMaxLines) {
    let currentLine = words[wordIndex];
    wordIndex += 1;

    while (wordIndex < words.length) {
      const trial = `${currentLine} ${words[wordIndex]}`;
      if (ctx.measureText(trial).width > safeMaxWidth) break;
      currentLine = trial;
      wordIndex += 1;
    }

    if (lines.length === safeMaxLines - 1 && wordIndex < words.length) {
      const finalLine = fitSingleLine(`${currentLine} ${words.slice(wordIndex).join(' ')}`);
      if (finalLine) lines.push(finalLine);
      return lines;
    }

    lines.push(currentLine);
  }

  return lines.slice(0, safeMaxLines);
}

export function drawTextLines(ctx, lines, x, startY, lineHeight) {
  let y = startY;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

/**
 * Resolved at module load: '/logo-max-ar-inv.svg' relative to the app root.
 * Loaded lazily via {@link ensureLogoLoaded} so capture pipelines can wait
 * for natural dimensions before drawing.
 */
export const logoImg = new Image();
logoImg.src = new URL('../../../../logo-max-ar-inv.svg', import.meta.url).href;

let logoLoadPromise = null;

function getLogoLoadPromise() {
  if (logoImg.naturalWidth > 0) return Promise.resolve(true);
  if (logoLoadPromise) return logoLoadPromise;

  logoLoadPromise = new Promise((resolve) => {
    const done = (ok) => resolve(Boolean(ok));
    logoImg.addEventListener('load', () => done(true), { once: true });
    logoImg.addEventListener('error', () => done(false), { once: true });
  });

  return logoLoadPromise;
}

export async function ensureLogoLoaded(timeoutMs = 1000) {
  if (logoImg.naturalWidth > 0) return true;
  const ok = await Promise.race([getLogoLoadPromise(), sleep(timeoutMs).then(() => false)]);
  if (!ok || logoImg.naturalWidth <= 0) return false;

  try {
    if (typeof logoImg.decode === 'function') {
      await Promise.race([logoImg.decode(), sleep(500)]);
    }
  } catch {
    // ignore
  }

  return logoImg.naturalWidth > 0;
}
