import { state } from '../../state.js';
import { clamp } from '../../core/utils.js';
import { formatHeadingValue } from './format.js';
import { fillRoundedRect, traceRoundedRect } from './canvas-utils.js';

/* -------------------------------------------------------------
   Compass watermark — translucent gray chip (DESIGN.md
   button-icon-circular over photography), with a quiet ink-tone
   compass face. Sits on the right edge under the header band.
   No gradient, no shadow.
   ------------------------------------------------------------- */
const FONT_TEXT = `"SF Pro Text", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

export function drawCompassBadgeOverlay(ctx, canvas) {
  const portraitTightness = canvas.height > canvas.width ? 0.92 : 1;
  const badgeHeight = clamp(Math.min(canvas.width, canvas.height) * 0.07 * portraitTightness, 44, 64);
  const margin = clamp(canvas.width * 0.018, 12, 28);
  const headingLabel = formatHeadingValue();
  const label = headingLabel === '--' ? 'Heading --' : headingLabel;

  ctx.save();
  ctx.font = `600 ${badgeHeight * 0.32}px ${FONT_TEXT}`;
  const labelWidth = ctx.measureText(label).width;
  const sidePad = badgeHeight * 0.34;
  const circleSize = badgeHeight * 0.66;
  const gap = badgeHeight * 0.22;
  const badgeWidth = sidePad + circleSize + gap + labelWidth + sidePad;

  // Position below the masthead band so the two don't collide.
  // The header band height is ~clamp(width * 0.075, 56, 92) + margin*2.
  const headerBandHeight = clamp(canvas.width * 0.075, 56, 92);
  const x = canvas.width - margin - badgeWidth;
  const y = margin + headerBandHeight + Math.max(8, margin * 0.6);

  // Translucent chip (DESIGN.md surface-chip-translucent)
  fillRoundedRect(ctx, x, y, badgeWidth, badgeHeight, badgeHeight / 2, 'rgba(210, 210, 215, 0.64)');
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  traceRoundedRect(ctx, x, y, badgeWidth, badgeHeight, badgeHeight / 2);
  ctx.stroke();
  ctx.restore();

  // Compass face — quiet ink ring with a single Action Blue north triangle
  const circleX = x + sidePad;
  const circleY = y + (badgeHeight - circleSize) / 2;
  const circleR = circleSize / 2;

  ctx.save();
  ctx.strokeStyle = 'rgba(29, 29, 31, 0.5)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(circleX + circleR, circleY + circleR, circleR * 0.92, 0, Math.PI * 2);
  ctx.stroke();

  ctx.translate(circleX + circleR, circleY + circleR);
  if (state.orientationListenerActive && Number.isFinite(state.currentHeading)) {
    ctx.rotate((state.currentHeading * Math.PI) / 180);
  }

  // North needle — Action Blue
  ctx.beginPath();
  ctx.moveTo(0, -circleR * 0.7);
  ctx.lineTo(circleR * 0.18, 0);
  ctx.lineTo(-circleR * 0.18, 0);
  ctx.closePath();
  ctx.fillStyle = '#0066cc';
  ctx.fill();

  // South needle — ink-muted
  ctx.beginPath();
  ctx.moveTo(0, circleR * 0.7);
  ctx.lineTo(circleR * 0.16, 0);
  ctx.lineTo(-circleR * 0.16, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(29, 29, 31, 0.45)';
  ctx.fill();
  ctx.restore();

  // Label
  ctx.save();
  ctx.fillStyle = '#1d1d1f';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${badgeHeight * 0.32}px ${FONT_TEXT}`;
  ctx.fillText(label, circleX + circleSize + gap, y + badgeHeight / 2);
  ctx.restore();
}
