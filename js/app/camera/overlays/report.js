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
  createSeededRandom,
  drawTextLines,
  fillRoundedRect,
  logoImg,
  traceRoundedRect,
  wrapTextIntoLines
} from './canvas-utils.js';

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

function drawMiniMapTile(ctx, x, y, size, cornerRadius) {
  const random = createSeededRandom(state.currentLat, state.currentLon);

  ctx.save();
  traceRoundedRect(ctx, x, y, size, size, cornerRadius);
  ctx.clip();

  const background = ctx.createLinearGradient(x, y, x + size, y + size);
  background.addColorStop(0, '#ccb98e');
  background.addColorStop(0.38, '#b7aa7f');
  background.addColorStop(0.72, '#8ca57a');
  background.addColorStop(1, '#5e7f68');
  ctx.fillStyle = background;
  ctx.fillRect(x, y, size, size);

  const fieldPalette = [
    'rgba(132, 152, 106, 0.34)',
    'rgba(109, 126, 91, 0.32)',
    'rgba(199, 178, 124, 0.28)',
    'rgba(157, 138, 102, 0.24)'
  ];

  for (let i = 0; i < 16; i += 1) {
    const fieldX = x + random() * size * 0.86;
    const fieldY = y + random() * size * 0.86;
    const fieldW = size * (0.08 + random() * 0.22);
    const fieldH = size * (0.08 + random() * 0.2);
    ctx.fillStyle = fieldPalette[Math.floor(random() * fieldPalette.length)];
    ctx.fillRect(fieldX, fieldY, fieldW, fieldH);
  }

  ctx.strokeStyle = 'rgba(224, 214, 186, 0.84)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i += 1) {
    ctx.lineWidth = size * (0.026 + random() * 0.018);
    ctx.beginPath();
    ctx.moveTo(x - size * 0.08, y + size * (0.12 + random() * 0.78));
    ctx.lineTo(x + size * 1.08, y + size * (0.12 + random() * 0.76));
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(62, 79, 95, 0.2)';
  for (let i = 0; i < 6; i += 1) {
    ctx.lineWidth = size * (0.012 + random() * 0.008);
    ctx.beginPath();
    ctx.moveTo(x + size * (0.1 + random() * 0.22), y - size * 0.05);
    ctx.lineTo(x + size * (0.78 + random() * 0.18), y + size * 1.05);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 10; i += 1) {
    const rowY = y + size * (0.08 + i * 0.085);
    ctx.beginPath();
    ctx.moveTo(x + size * 0.08, rowY);
    ctx.lineTo(x + size * 0.92, rowY + size * (0.03 + random() * 0.03));
    ctx.stroke();
  }

  const gloss = ctx.createLinearGradient(x, y, x, y + size);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
  gloss.addColorStop(0.4, 'rgba(255, 255, 255, 0)');
  gloss.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
  ctx.fillStyle = gloss;
  ctx.fillRect(x, y, size, size);

  if (hasGpsFix()) {
    const pinX = x + size * (0.2 + (Math.abs(state.currentLon * 10) % 1) * 0.58);
    const pinY = y + size * (0.18 + (Math.abs(state.currentLat * 10) % 1) * 0.5);
    const pinRadius = size * 0.085;

    ctx.save();
    ctx.shadowColor = 'rgba(97, 12, 18, 0.42)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ed4d4d';
    ctx.beginPath();
    ctx.arc(pinX, pinY, pinRadius, Math.PI, 0);
    ctx.quadraticCurveTo(pinX + pinRadius, pinY + pinRadius * 0.9, pinX, pinY + pinRadius * 2.25);
    ctx.quadraticCurveTo(pinX - pinRadius, pinY + pinRadius * 0.9, pinX - pinRadius, pinY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.beginPath();
    ctx.arc(pinX, pinY, pinRadius * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.font = `600 ${Math.max(size * 0.075, 11)}px 'Segoe UI', Tahoma, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.textAlign = 'center';
    ctx.fillText(getCaptureText().noMap, x + size / 2, y + size * 0.45);
  }

  ctx.restore();

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.46)';
  traceRoundedRect(ctx, x, y, size, size, cornerRadius);
  ctx.stroke();
  ctx.restore();
}

function drawOverlayBrandBadge(ctx, x, y, width, height, label, isRtl, logoOk) {
  ctx.save();
  const fill = ctx.createLinearGradient(x, y, x + width, y + height);
  fill.addColorStop(0, 'rgba(18, 48, 77, 0.92)');
  fill.addColorStop(1, 'rgba(6, 18, 31, 0.82)');
  fillRoundedRect(ctx, x, y, width, height, height / 2, fill);

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  traceRoundedRect(ctx, x, y, width, height, height / 2);
  ctx.stroke();

  const hasLogo = logoOk && logoImg.naturalWidth > 0;
  const iconSize = hasLogo ? height - 8 : height * 0.38;
  const sidePadding = height * 0.38;
  const gap = height * 0.22;
  const iconY = y + (height - iconSize) / 2;

  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(246, 249, 253, 0.96)';
  ctx.font = `700 ${Math.max(height * 0.4, 11)}px 'Segoe UI', Tahoma, sans-serif`;

  const drawIconAt = (iconX) => {
    if (hasLogo) {
      ctx.drawImage(logoImg, iconX, iconY, iconSize, iconSize);
    } else {
      fillRoundedRect(
        ctx, iconX, y + (height - iconSize) / 2, iconSize, iconSize,
        iconSize * 0.28, 'rgba(255, 196, 92, 0.9)'
      );
    }
  };

  if (isRtl) {
    let cursorX = x + width - sidePadding;
    drawIconAt(cursorX - iconSize);
    cursorX = cursorX - iconSize - gap;
    ctx.textAlign = 'right';
    ctx.fillText(label, cursorX, y + height / 2);
  } else {
    let cursorX = x + sidePadding;
    drawIconAt(cursorX);
    cursorX += iconSize + gap;
    ctx.textAlign = 'left';
    ctx.fillText(label, cursorX, y + height / 2);
  }

  ctx.restore();
}

export function addWatermarkToCanvas(ctx, width) {
  const badgeHeight = clamp(width * 0.075, 52, 82);
  const badgeWidth = clamp(width * 0.34, 210, 420);
  const margin = Math.max(width * 0.03, 22);
  const iconBox = badgeHeight - 14;
  const text = getCaptureText();

  ctx.save();
  ctx.shadowColor = 'rgba(5, 14, 28, 0.3)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;

  const badgeFill = ctx.createLinearGradient(margin, margin, margin + badgeWidth, margin + badgeHeight);
  badgeFill.addColorStop(0, 'rgba(8, 22, 40, 0.88)');
  badgeFill.addColorStop(1, 'rgba(18, 56, 92, 0.74)');
  fillRoundedRect(ctx, margin, margin, badgeWidth, badgeHeight, badgeHeight / 2, badgeFill);

  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  traceRoundedRect(ctx, margin, margin, badgeWidth, badgeHeight, badgeHeight / 2);
  ctx.stroke();
  ctx.restore();

  if (logoImg.naturalWidth > 0) {
    ctx.save();
    ctx.drawImage(logoImg, margin + 7, margin + 7, iconBox, iconBox);
    ctx.restore();
  }

  const textX = margin + iconBox + 18;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(247, 250, 255, 0.97)';
  ctx.font = `800 ${Math.max(badgeHeight * 0.28, 18)}px 'Segoe UI', Tahoma, sans-serif`;
  ctx.fillText('LENS LIGHT', textX, margin + badgeHeight * 0.5);
  ctx.fillStyle = 'rgba(197, 228, 255, 0.84)';
  ctx.font = `600 ${Math.max(badgeHeight * 0.18, 12)}px 'Segoe UI', Tahoma, sans-serif`;
  ctx.fillText(text.badgeSubtitle, textX, margin + badgeHeight * 0.78);
  ctx.restore();
}

function measureWrappedLines(ctx, font, text, width, maxLines) {
  ctx.save();
  ctx.font = font;
  const wrapped = wrapTextIntoLines(ctx, text, width, maxLines);
  ctx.restore();
  return wrapped;
}

function computeReportLayout(ctx, canvas, text, logoOk) {
  const isRtl = state.currentLang === 'ar';
  const portraitWeight = canvas.height / Math.max(canvas.width, 1);
  const compactMode = portraitWeight > 1.45;
  const margin = clamp(canvas.width * 0.018, 12, 28);
  const cardWidth = canvas.width - margin * 2;
  const innerPadding = clamp(canvas.width * (compactMode ? 0.024 : 0.02), 14, 24);
  const mapSize = clamp(
    Math.min(canvas.width * (compactMode ? 0.13 : 0.155), canvas.height * 0.14),
    compactMode ? 78 : 92,
    compactMode ? 118 : 144
  );
  const gap = clamp(cardWidth * 0.018, 12, 22);
  const cardX = margin;
  const mapX = isRtl ? cardX + cardWidth - innerPadding - mapSize : cardX + innerPadding;
  const textLeft = isRtl ? cardX + innerPadding : mapX + mapSize + gap;
  const textRight = isRtl ? mapX - gap : cardX + cardWidth - innerPadding;
  const textWidth = Math.max(96, textRight - textLeft);
  const textAnchorX = isRtl ? textRight : textLeft;

  const titleSize = clamp(canvas.width * (compactMode ? 0.042 : 0.038), 18, 34);
  const bodySize = clamp(canvas.width * 0.022, 12.5, 18);
  const noteSize = clamp(canvas.width * 0.019, 11.5, 15.5);
  const titleLineHeight = titleSize * 1.08;
  const bodyLineHeight = bodySize * 1.28;
  const noteLineHeight = noteSize * 1.24;

  const timestampText = formatOverlayTimestamp(new Date());
  const { title, address } = getOverlayLocationCopy(text);
  const coordinatesText = hasGpsFix()
    ? `${text.latLabel} ${state.currentLat.toFixed(6)}, ${text.longLabel} ${state.currentLon.toFixed(6)}${state.currentShortAddress ? ` | Short: ${state.currentShortAddress}` : ''}`
    : text.noMap;
  const footerText = buildOverlayFooterText(text);

  // Brand badge sizing depends on font metrics, so measure with the same font.
  ctx.save();
  ctx.font = `700 ${Math.max(bodySize * 0.98, 12)}px 'Segoe UI', Tahoma, sans-serif`;
  const brandIconSize = logoOk && logoImg.naturalWidth > 0
    ? Math.max(bodySize * 1.65, 18)
    : Math.max(bodySize * 0.8, 12);
  const brandBadgeHeight = Math.max(bodySize * 1.75, 22);
  const brandBadgeWidth = Math.min(
    textWidth * (compactMode ? 0.4 : 0.48),
    Math.max(ctx.measureText(text.brandLabel).width + brandIconSize + brandBadgeHeight, compactMode ? 92 : 104)
  );
  ctx.restore();

  const titleWidth = Math.max(108, textWidth - brandBadgeWidth - gap * 0.6);
  const titleLines = measureWrappedLines(
    ctx, `800 ${titleSize}px 'Segoe UI', Tahoma, sans-serif`,
    title, titleWidth, compactMode ? 1 : 2
  );
  const addressLines = address
    ? measureWrappedLines(ctx, `600 ${bodySize}px 'Segoe UI', Tahoma, sans-serif`, address, textWidth, compactMode ? 1 : 2)
    : [];
  const coordsLines = measureWrappedLines(
    ctx, `600 ${bodySize}px 'Segoe UI', Tahoma, sans-serif`,
    coordinatesText, textWidth, 1
  );
  const timeLines = measureWrappedLines(
    ctx, `600 ${noteSize}px 'Segoe UI', Tahoma, sans-serif`,
    timestampText, textWidth, 1
  );
  const footerLines = measureWrappedLines(
    ctx, `600 ${noteSize}px 'Segoe UI', Tahoma, sans-serif`,
    footerText, textWidth, compactMode ? 1 : 2
  );

  let textContentHeight = Math.max(brandBadgeHeight, titleLines.length * titleLineHeight);
  if (addressLines.length > 0) textContentHeight += bodySize * 0.35 + addressLines.length * bodyLineHeight;
  if (coordsLines.length > 0) textContentHeight += bodySize * 0.22 + coordsLines.length * bodyLineHeight;
  if (timeLines.length > 0) textContentHeight += noteSize * 0.24 + timeLines.length * noteLineHeight;
  if (footerLines.length > 0) textContentHeight += noteSize * 0.24 + footerLines.length * noteLineHeight;

  const cardHeight = clamp(
    innerPadding * 2 + Math.max(mapSize, textContentHeight),
    compactMode ? 124 : 142,
    compactMode ? canvas.height * 0.205 : canvas.height * 0.24
  );
  const cardY = canvas.height - cardHeight - margin;
  const mapY = cardY + (cardHeight - mapSize) / 2;

  return {
    isRtl, compactMode, margin, cardX, cardY, cardWidth, cardHeight, innerPadding,
    mapX, mapY, mapSize,
    textLeft, textRight, textAnchorX, textWidth,
    titleSize, bodySize, noteSize, titleLineHeight, bodyLineHeight, noteLineHeight,
    titleLines, addressLines, coordsLines, timeLines, footerLines,
    brandBadgeWidth, brandBadgeHeight
  };
}

function drawReportCardBackground(ctx, canvas, layout) {
  const { cardX, cardY, cardWidth, cardHeight } = layout;

  ctx.save();
  const glow = ctx.createLinearGradient(0, cardY - cardHeight * 0.55, 0, canvas.height);
  glow.addColorStop(0, 'rgba(5, 10, 18, 0)');
  glow.addColorStop(1, 'rgba(5, 10, 18, 0.34)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, cardY - cardHeight * 0.55, canvas.width, canvas.height - cardY + cardHeight * 0.55);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  const cardFill = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY + cardHeight);
  cardFill.addColorStop(0, 'rgba(10, 14, 21, 0.86)');
  cardFill.addColorStop(0.62, 'rgba(15, 22, 31, 0.8)');
  cardFill.addColorStop(1, 'rgba(21, 30, 42, 0.74)');
  fillRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 24, cardFill);
  ctx.restore();

  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  traceRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 24);
  ctx.stroke();
  ctx.restore();
}

function drawReportTextBlock(ctx, layout) {
  const {
    isRtl, cardY, innerPadding, textAnchorX,
    brandBadgeHeight,
    titleSize, bodySize, noteSize,
    titleLineHeight, bodyLineHeight, noteLineHeight,
    titleLines, addressLines, coordsLines, timeLines, footerLines
  } = layout;

  ctx.save();
  ctx.textAlign = isRtl ? 'right' : 'left';
  ctx.textBaseline = 'top';

  const contentTopY = cardY + innerPadding;
  const titleBlockHeight = Math.max(brandBadgeHeight, titleLines.length * titleLineHeight);
  let cursorY = contentTopY + Math.max(0, (brandBadgeHeight - titleLineHeight) * 0.2);

  ctx.fillStyle = 'rgba(247, 250, 255, 0.98)';
  ctx.font = `800 ${titleSize}px 'Segoe UI', Tahoma, sans-serif`;
  drawTextLines(ctx, titleLines, textAnchorX, cursorY, titleLineHeight);
  cursorY = contentTopY + titleBlockHeight;

  ctx.fillStyle = 'rgba(232, 237, 243, 0.95)';
  ctx.font = `600 ${bodySize}px 'Segoe UI', Tahoma, sans-serif`;
  if (addressLines.length > 0) {
    cursorY += bodySize * 0.35;
    cursorY = drawTextLines(ctx, addressLines, textAnchorX, cursorY, bodyLineHeight);
  }

  cursorY += bodySize * 0.22;
  cursorY = drawTextLines(ctx, coordsLines, textAnchorX, cursorY, bodyLineHeight);

  ctx.fillStyle = 'rgba(221, 228, 235, 0.9)';
  ctx.font = `600 ${noteSize}px 'Segoe UI', Tahoma, sans-serif`;
  cursorY += noteSize * 0.24;
  cursorY = drawTextLines(ctx, timeLines, textAnchorX, cursorY, noteLineHeight);

  ctx.fillStyle = 'rgba(205, 214, 223, 0.9)';
  cursorY += noteSize * 0.24;
  drawTextLines(ctx, footerLines, textAnchorX, cursorY, noteLineHeight);
  ctx.restore();
}

export function drawReportOverlay(ctx, canvas, logoOk = false) {
  const text = getCaptureText();
  const layout = computeReportLayout(ctx, canvas, text, logoOk);

  drawReportCardBackground(ctx, canvas, layout);
  drawMiniMapTile(ctx, layout.mapX, layout.mapY, layout.mapSize, 18);

  const brandBadgeX = layout.isRtl ? layout.textLeft : layout.textRight - layout.brandBadgeWidth;
  const brandBadgeY = layout.cardY + layout.innerPadding;
  drawOverlayBrandBadge(
    ctx, brandBadgeX, brandBadgeY,
    layout.brandBadgeWidth, layout.brandBadgeHeight,
    text.brandLabel, layout.isRtl, logoOk
  );

  drawReportTextBlock(ctx, layout);
}
