import { state } from '../../state.js';
import { clamp } from '../../core/utils.js';
import { formatHeadingValue } from './format.js';
import { fillRoundedRect, traceRoundedRect } from './canvas-utils.js';

export function drawCompassBadgeOverlay(ctx, canvas) {
  const portraitTightness = canvas.height > canvas.width ? 0.92 : 1;
  const badgeHeight = clamp(Math.min(canvas.width, canvas.height) * 0.08 * portraitTightness, 44, 68);
  const margin = Math.max(canvas.width * 0.03, 22);
  const headingLabel = formatHeadingValue();
  const label = headingLabel === '--' ? 'Heading --' : headingLabel;

  ctx.save();
  ctx.font = `700 ${badgeHeight * 0.28}px 'Segoe UI', Tahoma, sans-serif`;
  const labelWidth = ctx.measureText(label).width;
  const badgeWidth = badgeHeight + labelWidth + badgeHeight * 1.2;
  const x = canvas.width - margin - badgeWidth;
  const y = margin;
  const circleSize = badgeHeight - 12;
  const circleX = x + 6;
  const circleY = y + 6;
  const circleRadius = circleSize / 2;

  ctx.shadowColor = 'rgba(5, 14, 28, 0.26)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;

  const fill = ctx.createLinearGradient(x, y, x + badgeWidth, y + badgeHeight);
  fill.addColorStop(0, 'rgba(8, 22, 40, 0.84)');
  fill.addColorStop(1, 'rgba(15, 47, 78, 0.72)');
  fillRoundedRect(ctx, x, y, badgeWidth, badgeHeight, badgeHeight / 2, fill);

  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  traceRoundedRect(ctx, x, y, badgeWidth, badgeHeight, badgeHeight / 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.arc(circleX + circleRadius, circleY + circleRadius, circleRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(circleX + circleRadius, circleY + circleRadius, circleRadius * 0.78, 0, Math.PI * 2);
  ctx.stroke();

  ctx.translate(circleX + circleRadius, circleY + circleRadius);
  if (state.orientationListenerActive && Number.isFinite(state.currentHeading)) {
    ctx.rotate((state.currentHeading * Math.PI) / 180);
  }

  ctx.beginPath();
  ctx.moveTo(0, -circleRadius * 0.64);
  ctx.lineTo(circleRadius * 0.17, 0);
  ctx.lineTo(-circleRadius * 0.17, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 126, 96, 0.96)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, circleRadius * 0.64);
  ctx.lineTo(circleRadius * 0.15, 0);
  ctx.lineTo(-circleRadius * 0.15, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(120, 199, 255, 0.88)';
  ctx.fill();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(246, 249, 253, 0.96)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${badgeHeight * 0.28}px 'Segoe UI', Tahoma, sans-serif`;
  ctx.fillText(label, x + circleSize + 16, y + badgeHeight / 2);
  ctx.restore();
}
