import { createGoogleMapsUrl, createShortAddress, downloadBlob } from '../../core/utils.js';
import {
  detectDataUrlExtension,
  escapeHtml,
  formatAltitude,
  formatCoordinate,
  formatDateTime,
  formatHeading,
  getExportTimestamp,
  normalizeText
} from './format.js';
import { hydrateExportImages } from './source.js';
import { LOGO_PUBLIC_URL, loadLogoForExport } from './logo.js';
import { buildPreparedPayload, closeExportPrep, loadExternalScript, renderExportPrep } from './prep-state.js';
import { buildExcelColumns, buildExcelRowData, buildXlsxBlob } from './xlsx-builder.js';

const EXCELJS_CDN = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel;charset=utf-8';

const HEADER_ROW_INDEX = 6;
const DEFAULT_IMAGE_BOX = 72;
const TARGET_IMAGE_HEIGHT = 120;
const MAX_IMAGE_WIDTH = 320;
const IMAGE_ROW_HEIGHT_FACTOR = 0.75;
const IMAGE_ROW_HEIGHT_PAD = 15;
const NON_IMAGE_ROW_HEIGHT = 22;
const COL_WIDTH_PER_PIXEL = 7.5;
const COL_WIDTH_PADDING = 2;

function computeImageBox(item) {
  let targetWidth = DEFAULT_IMAGE_BOX;
  let targetHeight = DEFAULT_IMAGE_BOX;

  if (item.imageWidth && item.imageHeight) {
    const ratio = item.imageWidth / item.imageHeight;
    targetHeight = TARGET_IMAGE_HEIGHT;
    targetWidth = targetHeight * ratio;
    if (targetWidth > MAX_IMAGE_WIDTH) {
      targetWidth = MAX_IMAGE_WIDTH;
      targetHeight = targetWidth / ratio;
    }
  }

  return { targetWidth, targetHeight };
}

function writeSheetHeader(sheet, payload) {
  sheet.getCell('A1').value = 'Lens Light Export';
  sheet.getCell('A1').font = { bold: true, size: 16 };
  sheet.getCell('A2').value = `Source: ${payload.sourceLabel}`;
  sheet.getCell('A3').value = `Included records: ${payload.totalIncluded}`;
  sheet.getCell('A4').value = `Generated: ${formatDateTime(payload.generatedAt)}`;
}

function writeColumnHeaders(sheet, columns) {
  const headerRow = sheet.getRow(HEADER_ROW_INDEX);
  headerRow.values = columns.map((column) => column.header);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;
}

function writeDataRow(sheet, workbook, item, payload, columns, excelRow, imageColumnIndex) {
  const rowData = buildExcelRowData(item, payload.options);
  const row = sheet.getRow(excelRow);
  columns.forEach((column, columnIndex) => {
    row.getCell(columnIndex + 1).value = rowData[column.key] ?? '';
  });
  row.alignment = { vertical: 'middle', wrapText: true };

  const { targetWidth, targetHeight } = payload.options.includeImages && item.exportImageSrc
    ? computeImageBox(item)
    : { targetWidth: DEFAULT_IMAGE_BOX, targetHeight: DEFAULT_IMAGE_BOX };

  row.height = payload.options.includeImages
    ? targetHeight * IMAGE_ROW_HEIGHT_FACTOR + IMAGE_ROW_HEIGHT_PAD
    : NON_IMAGE_ROW_HEIGHT;

  if (payload.options.includeImages && item.exportImageSrc && imageColumnIndex > 0) {
    const imageId = workbook.addImage({
      base64: item.exportImageSrc,
      extension: detectDataUrlExtension(item.exportImageSrc)
    });

    sheet.addImage(imageId, {
      tl: { col: imageColumnIndex - 1 + 0.12, row: excelRow - 1 + 0.12 },
      ext: { width: targetWidth, height: targetHeight }
    });

    const currentWidth = sheet.getColumn(imageColumnIndex).width || 16;
    const requiredColWidth = (targetWidth / COL_WIDTH_PER_PIXEL) + COL_WIDTH_PADDING;
    if (requiredColWidth > currentWidth) {
      sheet.getColumn(imageColumnIndex).width = requiredColWidth;
    }
  }
}

async function embedSummaryLogo(workbook, sheet, payload) {
  if (!payload.options.includeLogo) return;
  const logo = await loadLogoForExport({ targetHeightPx: 64 });
  if (!logo.dataUrl) return;

  const imageId = workbook.addImage({ base64: logo.dataUrl, extension: 'png' });
  // Anchor in column F, rows 1-4 — clear of the four summary lines in column A.
  sheet.addImage(imageId, {
    tl: { col: 5, row: 0 },
    ext: { width: logo.width, height: logo.height }
  });
}

async function buildExcelJsBlob(payload) {
  const ExcelJS = await loadExternalScript('exceljs', EXCELJS_CDN, () => window.ExcelJS);
  const columns = buildExcelColumns(payload.options);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Lens Light Export');
  sheet.properties.defaultRowHeight = 20;

  writeSheetHeader(sheet, payload);
  await embedSummaryLogo(workbook, sheet, payload);
  sheet.columns = columns;
  writeColumnHeaders(sheet, columns);

  const imageColumnIndex = payload.options.includeImages
    ? columns.findIndex((column) => column.key === 'image') + 1
    : -1;

  let excelRow = HEADER_ROW_INDEX + 1;
  for (const item of payload.items) {
    writeDataRow(sheet, workbook, item, payload, columns, excelRow, imageColumnIndex);
    excelRow += 1;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}

function buildExcelHtml(payload) {
  const imageHeader = payload.options.includeImages ? '<th>Image</th>' : '';
  const notesHeader = payload.options.includeNotes ? '<th>Notes</th>' : '';
  const tagsHeader = payload.options.includeTags ? '<th>Tags</th>' : '';
  const metadataHeaders = payload.options.includeMetadata
    ? '<th>Project</th><th>Location</th><th>Short Address</th><th>Date/Time</th><th>Latitude</th><th>Longitude</th><th>Altitude</th><th>Heading</th>'
    : '';
  const mapsHeader = payload.options.includeMapsLinks ? '<th>Google Maps</th>' : '';

  const summaryLogo = payload.options.includeLogo
    ? `<img class="summary-logo" src="${LOGO_PUBLIC_URL}" alt="Lens Light">`
    : '';

  return `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
          th { background: #e2e8f0; font-weight: 700; }
          img { width: 88px; height: 88px; object-fit: cover; border-radius: 8px; }
          .summary { margin-bottom: 12px; display: flex; align-items: center; gap: 14px; }
          .summary-logo { width: 56px; height: 56px; object-fit: contain; border-radius: 0; }
          .summary-text { display: flex; flex-direction: column; }
        </style>
      </head>
      <body>
        <div class="summary">
          ${summaryLogo}
          <div class="summary-text">
            <strong>Lens Light Export</strong>
            <span>Source: ${escapeHtml(payload.sourceLabel)}</span>
            <span>Included records: ${payload.totalIncluded}</span>
            <span>Generated: ${escapeHtml(formatDateTime(payload.generatedAt))}</span>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Filename</th>
              ${imageHeader}
              ${metadataHeaders}
              ${notesHeader}
              ${tagsHeader}
              ${mapsHeader}
            </tr>
          </thead>
          <tbody>
            ${payload.items.map((item) => {
              const mapsUrl = createGoogleMapsUrl(item.lat, item.lon);
              const imageCell = payload.options.includeImages
                ? `<td>${item.exportImageSrc ? `<img src="${item.exportImageSrc}" alt="${escapeHtml(item.filename)}">` : 'No image'}</td>`
                : '';
              const metadataCells = payload.options.includeMetadata
                ? `
                  <td>${escapeHtml(normalizeText(item.projectName))}</td>
                  <td>${escapeHtml(normalizeText(item.location || item.checkpoint || item.zone))}</td>
                  <td>${escapeHtml(item.shortAddress || createShortAddress(item.lat, item.lon))}</td>
                  <td>${escapeHtml(formatDateTime(item.timestamp))}</td>
                  <td>${formatCoordinate(item.lat)}</td>
                  <td>${formatCoordinate(item.lon)}</td>
                  <td>${escapeHtml(formatAltitude(item.alt))}</td>
                  <td>${escapeHtml(formatHeading(item.heading))}</td>
                `
                : '';
              const notesCell = payload.options.includeNotes
                ? `<td>${escapeHtml(normalizeText(item.comment, ''))}</td>`
                : '';
              const tagsCell = payload.options.includeTags
                ? `<td>${escapeHtml(item.tags.join(', '))}</td>`
                : '';
              const mapsCell = payload.options.includeMapsLinks
                ? `<td>${mapsUrl ? `<a href="${mapsUrl}">${mapsUrl}</a>` : ''}</td>`
                : '';

              return `
                <tr>
                  <td>${item.exportOrder}</td>
                  <td>${escapeHtml(item.filename)}</td>
                  ${imageCell}
                  ${metadataCells}
                  ${notesCell}
                  ${tagsCell}
                  ${mapsCell}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

/**
 * Three-tier Excel export with progressive fallback:
 *   1. ExcelJS (CDN script) — best fidelity, embeds images
 *   2. Local self-rolled OOXML (`xlsx-builder.js`) — embeds images, no external dep
 *   3. HTML masquerading as `.xls` — limited image support, last resort
 */
export async function exportPreparedExcel({ showStatus } = {}) {
  const payload = buildPreparedPayload();
  if (payload.totalIncluded === 0) {
    renderExportPrep();
    showStatus?.('⚠️ No records selected for export', 2000);
    return;
  }

  const items = await hydrateExportImages(payload.items, payload.options.includeImages);
  const hydratedPayload = { ...payload, items };
  const filenameBase = `lenslight_export_${getExportTimestamp()}`;

  try {
    const blob = await buildExcelJsBlob(hydratedPayload);
    downloadBlob(blob, `${filenameBase}.xlsx`, { showStatus });
    showStatus?.('Excel export downloaded with embedded photos.', 2500);
    closeExportPrep();
    return;
  } catch (error) {
    console.warn('ExcelJS export failed, falling back to local workbook builder.', error);
  }

  try {
    const workbookBlob = buildXlsxBlob(hydratedPayload);
    downloadBlob(workbookBlob, `${filenameBase}.xlsx`, { showStatus });
    showStatus?.('Excel export downloaded with embedded photos.', 2500);
    closeExportPrep();
    return;
  } catch (error) {
    console.warn('Local XLSX export failed, falling back to compatibility workbook.', error);
  }

  const html = buildExcelHtml(hydratedPayload);
  const blob = new Blob([`﻿${html}`], { type: XLS_MIME });
  downloadBlob(blob, `${filenameBase}.xls`, { showStatus });
  showStatus?.('Excel exported in compatibility mode. Images may be limited in some viewers.', 3200);
  closeExportPrep();
}
