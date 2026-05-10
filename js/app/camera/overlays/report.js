import { state } from '../../state.js';
import { clamp } from '../../core/utils.js';
import {
  formatAccuracy,
  formatAltitude,
  formatOverlayTimestamp,
  getCaptureText,
  hasGpsFix
} from './format.js';
import {
  drawTextLines,
  fillRoundedRect,
  logoImg,
  traceRoundedRect,
  wrapTextIntoLines
} from './canvas-utils.js';

/* -------------------------------------------------------------
   DESIGN.md tokens used in the watermark renderer.
   Keep in sync with css/style.css.
   ------------------------------------------------------------- */
const COLOR_PRIMARY = '#0066cc';
const COLOR_PRIMARY_ON_DARK = '#2997ff';
const COLOR_INK = '#1d1d1f';
const COLOR_INK_MUTED_80 = '#333333';
const COLOR_INK_MUTED_48 = '#7a7a7a';
const COLOR_HAIRLINE = '#e0e0e0';
const COLOR_PARCHMENT = '#f5f5f7';
const FONT_DISPLAY = `"SF Pro Display", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
const FONT_TEXT = `"SF Pro Text", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

function getOverlayLocationCopy(text) {
  const rawLocation = String(state.settings.customLocation || '').trim();
  const projectName = String(state.settings.projectName || '').trim();

  if (!rawLocation) {
    return {
      title: projectName || text.fallbackTitle,
      address: projectName && projectName !== text.fallbackTitle
        ? `${text.projectLabel}: ${projectName}`
        : ''
    };
  }

  const parts = rawLocation.split(',').map((part) => part.trim()).filter(Boolean);
  const title = parts.length >= 4 ? parts.slice(-3).join(', ') : rawLocation;
  let address = parts.length >= 4 ? parts.join(', ') : '';

  if (!address && projectName && projectName !== title) {
    address = `${text.projectLabel}: ${projectName}`;
  }

  return { title, address };
}

function buildWeatherChip(text) {
  if (state.weatherData?.temp === null || state.weatherData?.temp === undefined) return '';

  const temperature = Math.round(state.weatherData.temp);
  const tempUnit = state.settings.units === 'imperial' ? '°F' : '°C';
  const description = state.weatherData.description ? ` ${state.weatherData.description}` : '';
  return `${text.weatherLabel} ${temperature}${tempUnit}${description}`;
}

function buildOverlayFooterText(text) {
  const parts = [];
  const accuracyText = Number.isFinite(state.currentAccuracy) && state.currentAccuracy > 0
    ? `${text.accuracyLabel}: ${formatAccuracy(state.currentAccuracy)}`
    : '';
  const altitudeText = Number.isFinite(state.currentAlt)
    ? `${text.altitudeLabel}: ${formatAltitude(state.currentAlt)}`
    : '';
  const weatherText = buildWeatherChip(text);
  const filterText = state.featureState.currentFilter && state.featureState.currentFilter !== 'normal'
    ? `${text.filterLabel}: ${String(state.featureState.currentFilter).toUpperCase()}`
    : '';

  if (accuracyText) parts.push(accuracyText);
  if (!altitudeText.endsWith('-- m') && !altitudeText.endsWith('-- ft')) parts.push(altitudeText);
  if (weatherText) parts.push(weatherText);
  if (filterText) parts.push(filterText);

  return parts.length > 0 ? parts.join(' • ') : `${text.noteLabel}: ${text.noteValue}`;
}

/* -------------------------------------------------------------
   Apple-Maps style location tile.
   Parchment background, hairline grid, single Action Blue pin.
   Replaces the previous procedural "fake aerial" map.
   ------------------------------------------------------------- */
function drawMiniMapTile(ctx, x, y, size, cornerRadius) {
  ctx.save();
  traceRoundedRect(ctx, x, y, size, size, cornerRadius);
  ctx.clip();

  // Parchment surface
  ctx.fillStyle = COLOR_PARCHMENT;
  ctx.fillRect(x, y, size, size);

  // Hairline grid
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
  ctx.lineWidth = 1;
  const gridSteps = 6;
  const step = size / gridSteps;
  for (let i = 1; i < gridSteps; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x + i * step, y);
    ctx.lineTo(x + i * step, y + size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + i * step);
    ctx.lineTo(x + size, y + i * step);
    ctx.stroke();
  }

  // Subtle road accents — one curved, two straight crosshairs
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, size * 0.035);
  ctx.beginPath();
  ctx.moveTo(x + size * 0.08, y + size * 0.7);
  ctx.quadraticCurveTo(x + size * 0.55, y + size * 0.42, x + size * 0.96, y + size * 0.32);
  ctx.stroke();

  ctx.lineWidth = Math.max(1.5, size * 0.022);
  ctx.beginPath();
  ctx.moveTo(x + size * 0.5, y);
  ctx.lineTo(x + size * 0.5, y + size);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.5);
  ctx.lineTo(x + size, y + size * 0.5);
  ctx.stroke();

  if (hasGpsFix()) {
    const pinX = x + size * 0.5;
    const pinY = y + size * 0.46;
    const pinR = size * 0.13;

    // Soft halo (Action Blue at low alpha)
    ctx.fillStyle = 'rgba(0, 102, 204, 0.18)';
    ctx.beginPath();
    ctx.arc(pinX, pinY + pinR * 1.05, pinR * 1.9, 0, Math.PI * 2);
    ctx.fill();

    // Pin body (single Action Blue)
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.beginPath();
    ctx.arc(pinX, pinY, pinR, Math.PI, 0);
    ctx.quadraticCurveTo(pinX + pinR, pinY + pinR * 0.95, pinX, pinY + pinR * 2.4);
    ctx.quadraticCurveTo(pinX - pinR, pinY + pinR * 0.95, pinX - pinR, pinY);
    ctx.closePath();
    ctx.fill();

    // Inner dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(pinX, pinY, pinR * 0.42, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = COLOR_INK_MUTED_48;
    ctx.font = `400 ${Math.max(size * 0.085, 11)}px ${FONT_TEXT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getCaptureText().noMap, x + size / 2, y + size / 2);
  }

  ctx.restore();

  // Hairline border (DESIGN.md store-utility-card)
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLOR_HAIRLINE;
  traceRoundedRect(ctx, x, y, size, size, cornerRadius);
  ctx.stroke();
  ctx.restore();
}

/* -------------------------------------------------------------
   Top header band — the "webpage masthead" the user asked for.
   Full-width black strip, 32–40px logo on the left next to the
   "LENS LIGHT" wordmark in SF Pro Display 600. Timestamp on the
   right. No decorative gradient, no shadow.
   ------------------------------------------------------------- */
export function drawHeaderBand(ctx, canvas, logoOk = false) {
  const isRtl = state.currentLang === 'ar';
  const text = getCaptureText();
  const margin = clamp(canvas.width * 0.018, 12, 56);
  const bandHeight = clamp(canvas.width * 0.075, 56, 200);
  const innerPad = bandHeight * 0.22;
  const logoSize = bandHeight - innerPad * 2;
  const bandWidth = canvas.width - margin * 2;
  const x = margin;
  const y = margin;

  // Black bar at ~85% — readable over any photo without dominating it
  ctx.save();
  fillRoundedRect(ctx, x, y, bandWidth, bandHeight, bandHeight / 2, 'rgba(0, 0, 0, 0.85)');
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  traceRoundedRect(ctx, x, y, bandWidth, bandHeight, bandHeight / 2);
  ctx.stroke();
  ctx.restore();

  const centreY = y + bandHeight / 2;
  const wordFontSize = Math.max(bandHeight * 0.34, 16);
  const captionFontSize = Math.max(bandHeight * 0.22, 11);
  const wordmark = String(text.brandLabel || 'LENS LIGHT').toUpperCase();
  const timestamp = formatOverlayTimestamp(new Date());

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';

  // Brand block (logo + wordmark) — top-left in LTR, top-right in RTL
  if (isRtl) {
    let cursor = x + bandWidth - innerPad;
    if (logoOk && logoImg.naturalWidth > 0) {
      ctx.drawImage(logoImg, cursor - logoSize, y + innerPad, logoSize, logoSize);
      cursor -= logoSize + innerPad * 0.7;
    }
    ctx.font = `600 ${wordFontSize}px ${FONT_DISPLAY}`;
    ctx.textAlign = 'right';
    ctx.fillText(wordmark, cursor, centreY);
  } else {
    let cursor = x + innerPad;
    if (logoOk && logoImg.naturalWidth > 0) {
      ctx.drawImage(logoImg, cursor, y + innerPad, logoSize, logoSize);
      cursor += logoSize + innerPad * 0.7;
    }
    ctx.font = `600 ${wordFontSize}px ${FONT_DISPLAY}`;
    ctx.textAlign = 'left';
    ctx.fillText(wordmark, cursor, centreY);
  }

  // Timestamp on the opposite side
  ctx.font = `400 ${captionFontSize}px ${FONT_TEXT}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  if (isRtl) {
    ctx.textAlign = 'left';
    ctx.fillText(timestamp, x + innerPad, centreY);
  } else {
    ctx.textAlign = 'right';
    ctx.fillText(timestamp, x + bandWidth - innerPad, centreY);
  }
  ctx.restore();
}

/**
 * Backwards-compatible alias used by existing callers. Now draws the
 * header band rather than the old in-line brand pill.
 */
export function addWatermarkToCanvas(ctx, _width, logoOk = false) {
  // Some callers don't pass `logoOk`; assume the logo is ready since the
  // capture pipeline awaits ensureLogoLoaded() before composing overlays.
  drawHeaderBand(ctx, ctx.canvas, logoOk || logoImg.naturalWidth > 0);
}

function measureWrappedLines(ctx, font, text, width, maxLines) {
  ctx.save();
  ctx.font = font;
  const wrapped = wrapTextIntoLines(ctx, text, width, maxLines);
  ctx.restore();
  return wrapped;
}

function computeReportLayout(ctx, canvas, text) {
  const isRtl = state.currentLang === 'ar';
  const portraitWeight = canvas.height / Math.max(canvas.width, 1);
  const compactMode = portraitWeight > 1.45;
  const margin = clamp(canvas.width * 0.018, 12, 56);
  const cardWidth = canvas.width - margin * 2;
  const innerPadding = clamp(canvas.width * (compactMode ? 0.026 : 0.022), 14, 56);
  const mapSize = clamp(
    Math.min(canvas.width * (compactMode ? 0.16 : 0.18), canvas.height * 0.16),
    compactMode ? 96 : 116,
    compactMode ? 320 : 380
  );
  const gap = clamp(cardWidth * 0.02, 14, 56);
  const cardX = margin;
  const mapX = isRtl ? cardX + cardWidth - innerPadding - mapSize : cardX + innerPadding;
  const textLeft = isRtl ? cardX + innerPadding : mapX + mapSize + gap;
  const textRight = isRtl ? mapX - gap : cardX + cardWidth - innerPadding;
  const textWidth = Math.max(96, textRight - textLeft);
  const textAnchorX = isRtl ? textRight : textLeft;

  // SF Pro Display headline + SF Pro Text body, per DESIGN.md
  const titleSize = clamp(canvas.width * (compactMode ? 0.04 : 0.036), 18, 72);
  const bodySize = clamp(canvas.width * 0.022, 13, 44);
  const noteSize = clamp(canvas.width * 0.019, 12, 38);
  const titleLineHeight = titleSize * 1.1;
  const bodyLineHeight = bodySize * 1.34;
  const noteLineHeight = noteSize * 1.3;

  const timestampText = formatOverlayTimestamp(new Date());
  const { title, address } = getOverlayLocationCopy(text);
  const coordinatesText = hasGpsFix()
    ? `${text.latLabel} ${state.currentLat.toFixed(6)}, ${text.longLabel} ${state.currentLon.toFixed(6)}${state.currentShortAddress ? ` | ${state.currentShortAddress}` : ''}`
    : text.noMap;
  const footerText = buildOverlayFooterText(text);

  const titleLines = measureWrappedLines(
    ctx, `600 ${titleSize}px ${FONT_DISPLAY}`,
    title, textWidth, compactMode ? 1 : 2
  );
  const addressLines = address
    ? measureWrappedLines(ctx, `400 ${bodySize}px ${FONT_TEXT}`, address, textWidth, compactMode ? 1 : 2)
    : [];
  const coordsLines = measureWrappedLines(
    ctx, `400 ${bodySize}px ${FONT_TEXT}`,
    coordinatesText, textWidth, 1
  );
  const timeLines = measureWrappedLines(
    ctx, `400 ${noteSize}px ${FONT_TEXT}`,
    timestampText, textWidth, 1
  );
  const footerLines = measureWrappedLines(
    ctx, `400 ${noteSize}px ${FONT_TEXT}`,
    footerText, textWidth, compactMode ? 1 : 2
  );

  let textContentHeight = titleLines.length * titleLineHeight;
  if (addressLines.length > 0) textContentHeight += bodySize * 0.4 + addressLines.length * bodyLineHeight;
  if (coordsLines.length > 0) textContentHeight += bodySize * 0.25 + coordsLines.length * bodyLineHeight;
  if (timeLines.length > 0) textContentHeight += noteSize * 0.3 + timeLines.length * noteLineHeight;
  if (footerLines.length > 0) textContentHeight += noteSize * 0.3 + footerLines.length * noteLineHeight;

  const cardHeight = clamp(
    innerPadding * 2 + Math.max(mapSize, textContentHeight),
    compactMode ? 132 : 154,
    compactMode ? canvas.height * 0.30 : canvas.height * 0.34
  );
  const cardY = canvas.height - cardHeight - margin;
  const mapY = cardY + (cardHeight - mapSize) / 2;

  return {
    isRtl, compactMode, margin, cardX, cardY, cardWidth, cardHeight, innerPadding,
    mapX, mapY, mapSize,
    textLeft, textRight, textAnchorX, textWidth,
    titleSize, bodySize, noteSize, titleLineHeight, bodyLineHeight, noteLineHeight,
    titleLines, addressLines, coordsLines, timeLines, footerLines
  };
}

/* -------------------------------------------------------------
   Report card background — DESIGN.md store-utility-card:
   parchment surface, 18px radius, hairline border. No gradient,
   no decorative shadow.
   ------------------------------------------------------------- */
function drawReportCardBackground(ctx, _canvas, layout) {
  const { cardX, cardY, cardWidth, cardHeight } = layout;

  ctx.save();
  fillRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 18, 'rgba(245, 245, 247, 0.94)');
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLOR_HAIRLINE;
  traceRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 18);
  ctx.stroke();
  ctx.restore();
}

/* -------------------------------------------------------------
   Report text — ink colors on parchment, SF Pro typography.
   ------------------------------------------------------------- */
function drawReportTextBlock(ctx, layout) {
  const {
    isRtl, cardY, innerPadding, textAnchorX,
    titleSize, bodySize, noteSize,
    titleLineHeight, bodyLineHeight, noteLineHeight,
    titleLines, addressLines, coordsLines, timeLines, footerLines
  } = layout;

  ctx.save();
  ctx.textAlign = isRtl ? 'right' : 'left';
  ctx.textBaseline = 'top';

  let cursorY = cardY + innerPadding;

  // Title — SF Pro Display 600
  ctx.fillStyle = COLOR_INK;
  ctx.font = `600 ${titleSize}px ${FONT_DISPLAY}`;
  cursorY = drawTextLines(ctx, titleLines, textAnchorX, cursorY, titleLineHeight);

  // Address — SF Pro Text 400, ink-muted-80
  ctx.fillStyle = COLOR_INK_MUTED_80;
  ctx.font = `400 ${bodySize}px ${FONT_TEXT}`;
  if (addressLines.length > 0) {
    cursorY += bodySize * 0.4;
    cursorY = drawTextLines(ctx, addressLines, textAnchorX, cursorY, bodyLineHeight);
  }

  // Coordinates — same body weight, primary blue accent for the link feel
  ctx.fillStyle = COLOR_PRIMARY;
  ctx.font = `400 ${bodySize}px ${FONT_TEXT}`;
  if (coordsLines.length > 0) {
    cursorY += bodySize * 0.25;
    cursorY = drawTextLines(ctx, coordsLines, textAnchorX, cursorY, bodyLineHeight);
  }

  // Timestamp + footer — caption, ink-muted-48
  ctx.fillStyle = COLOR_INK_MUTED_48;
  ctx.font = `400 ${noteSize}px ${FONT_TEXT}`;
  if (timeLines.length > 0) {
    cursorY += noteSize * 0.3;
    cursorY = drawTextLines(ctx, timeLines, textAnchorX, cursorY, noteLineHeight);
  }
  if (footerLines.length > 0) {
    cursorY += noteSize * 0.3;
    drawTextLines(ctx, footerLines, textAnchorX, cursorY, noteLineHeight);
  }
  ctx.restore();

  // Use the unused param to keep ESLint quiet on minimal builds.
  void COLOR_PRIMARY_ON_DARK;
}

export function drawReportOverlay(ctx, canvas, _logoOk = false) {
  const text = getCaptureText();
  const layout = computeReportLayout(ctx, canvas, text);

  drawReportCardBackground(ctx, canvas, layout);
  drawMiniMapTile(ctx, layout.mapX, layout.mapY, layout.mapSize, 8);
  drawReportTextBlock(ctx, layout);
}
