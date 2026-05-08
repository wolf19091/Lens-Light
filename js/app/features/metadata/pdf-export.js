import { createGoogleMapsUrl, createShortAddress } from '../../core/utils.js';
import {
  escapeHtml,
  formatAltitude,
  formatCoordinate,
  formatDateTime,
  formatHeading,
  getExportTimestamp,
  getPdfImageFormat,
  normalizeText
} from './format.js';
import { hydrateExportImages, measureImageSource } from './source.js';
import { LOGO_PUBLIC_URL, loadLogoForExport } from './logo.js';
import { buildPreparedPayload, closeExportPrep, loadExternalScript, renderExportPrep } from './prep-state.js';

const JSPDF_CDN = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';

const PAGE_MARGIN_MM = 14;
const HEADER_TOP_Y = 16;
const TITLE_FONT_SIZE = 18;
const META_FONT_SIZE = 10;
const RECORD_TITLE_FONT_SIZE = 14;
const SUBTITLE_FONT_SIZE = 9;
const BODY_FONT_SIZE = 10;
const IMAGE_MAX_HEIGHT_MM = 120;
const HEADER_LOGO_HEIGHT_MM = 14;

const COLOR_DARK_SLATE = [15, 23, 42];
const COLOR_GRAY = [71, 85, 105];
const COLOR_LIGHT_SLATE = [226, 232, 240];
const COLOR_SUBTITLE = [100, 116, 139];
const COLOR_IMAGE_BG = [248, 250, 252];

function buildMetadataBlock(item, options) {
  if (!options.includeMetadata) return '';

  return `
    <div class="export-metadata-grid">
      <div><strong>Order</strong><span>${item.exportOrder}</span></div>
      <div><strong>Project</strong><span>${escapeHtml(normalizeText(item.projectName))}</span></div>
      <div><strong>Location</strong><span>${escapeHtml(normalizeText(item.location || item.checkpoint || item.zone))}</span></div>
      <div><strong>Short Address</strong><span>${escapeHtml(item.shortAddress || createShortAddress(item.lat, item.lon))}</span></div>
      <div><strong>Date</strong><span>${escapeHtml(formatDateTime(item.timestamp))}</span></div>
      <div><strong>Latitude</strong><span>${formatCoordinate(item.lat)}</span></div>
      <div><strong>Longitude</strong><span>${formatCoordinate(item.lon)}</span></div>
      <div><strong>Altitude</strong><span>${escapeHtml(formatAltitude(item.alt))}</span></div>
      <div><strong>Heading</strong><span>${escapeHtml(formatHeading(item.heading))}</span></div>
    </div>
  `;
}

function buildPdfHtml(payload) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(payload.options.reportTitle || 'Lens Light Export')}</title>
        <style>
          @page { size: A4; margin: 14mm; }
          body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; }
          .export-page { page-break-after: always; }
          .export-page:last-child { page-break-after: auto; }
          .export-shell { border: 1px solid #dbe2ea; border-radius: 16px; padding: 18px; }
          .report-header { margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #e2e8f0; display: flex; align-items: center; gap: 14px; }
          .report-logo { height: 48px; width: auto; flex-shrink: 0; }
          .report-header-text { display: flex; flex-direction: column; gap: 4px; }
          .report-title { font-size: 24px; font-weight: bold; color: #0f172a; margin-bottom: 4px; }
          .report-meta { font-size: 13px; color: #475569; display: flex; gap: 16px; }
          .export-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
          .export-title { font-size: 20px; font-weight: 700; color: #1e293b; }
          .export-subtitle { color: #64748b; font-size: 13px; }
          .export-image { width: 100%; max-height: 150mm; object-fit: contain; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; margin-bottom: 14px; }
          .export-section { margin-top: 14px; }
          .export-section h3 { margin: 0 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
          .export-metadata-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
          .export-metadata-grid div { border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; }
          .export-metadata-grid strong { font-size: 11px; color: #64748b; text-transform: uppercase; }
          .export-metadata-grid span { font-size: 13px; color: #0f172a; word-break: break-word; }
          .export-note, .export-tags, .export-map { border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; background: #f8fafc; font-size: 13px; }
          .export-map a { color: #0f766e; text-decoration: none; }
        </style>
      </head>
      <body>
        ${payload.items.map((item) => {
          const mapsUrl = createGoogleMapsUrl(item.lat, item.lon);
          const noteMarkup = payload.options.includeNotes
            ? `<div class="export-section"><h3>Notes</h3><div class="export-note">${escapeHtml(normalizeText(item.comment, 'No notes'))}</div></div>`
            : '';
          const tagsMarkup = payload.options.includeTags
            ? `<div class="export-section"><h3>Tags</h3><div class="export-tags">${escapeHtml(item.tags.length > 0 ? item.tags.join(', ') : 'No tags')}</div></div>`
            : '';
          const mapMarkup = payload.options.includeMapsLinks && mapsUrl
            ? `<div class="export-section"><h3>Google Maps</h3><div class="export-map"><a href="${mapsUrl}">${mapsUrl}</a></div></div>`
            : '';

          const showHeader = payload.options.reportTitle || payload.options.organization || payload.options.preparedBy || payload.options.includeLogo;
          const logoMarkup = payload.options.includeLogo
            ? `<img class="report-logo" src="${LOGO_PUBLIC_URL}" alt="Lens Light">`
            : '';
          const reportHeaderMarkup = showHeader
            ? `<div class="report-header">
                 ${logoMarkup}
                 <div class="report-header-text">
                   ${payload.options.reportTitle ? `<div class="report-title">${escapeHtml(payload.options.reportTitle)}</div>` : ''}
                   <div class="report-meta">
                     ${payload.options.organization ? `<span>Org: ${escapeHtml(payload.options.organization)}</span>` : ''}
                     ${payload.options.preparedBy ? `<span>Prep: ${escapeHtml(payload.options.preparedBy)}</span>` : ''}
                   </div>
                 </div>
               </div>`
            : '';

          return `
            <section class="export-page">
              <div class="export-shell">
                ${reportHeaderMarkup}
                <div class="export-header">
                  <div>
                    <div class="export-title">${escapeHtml(item.filename)}</div>
                    <div class="export-subtitle">${escapeHtml(payload.sourceLabel)}  •  Record ${item.exportOrder} of ${payload.totalIncluded}</div>
                  </div>
                  <div class="export-subtitle">${escapeHtml(formatDateTime(item.timestamp))}</div>
                </div>
                ${payload.options.includeImages && item.exportImageSrc ? `<img class="export-image" src="${item.exportImageSrc}" alt="${escapeHtml(item.filename)}">` : ''}
                ${buildMetadataBlock(item, payload.options)}
                ${noteMarkup}
                ${tagsMarkup}
                ${mapMarkup}
              </div>
            </section>
          `;
        }).join('')}
        <script>
          window.onload = function () {
            setTimeout(function () { window.print(); }, 250);
          };
        </script>
      </body>
    </html>
  `;
}

function getPdfTextBlocks(item, payload) {
  const blocks = [];

  if (payload.options.includeMetadata) {
    blocks.push(`Order: ${item.exportOrder}`);
    blocks.push(`Project: ${normalizeText(item.projectName)}`);
    blocks.push(`Location: ${normalizeText(item.location || item.checkpoint || item.zone)}`);
    blocks.push(`Short Address: ${item.shortAddress || createShortAddress(item.lat, item.lon)}`);
    blocks.push(`Date: ${formatDateTime(item.timestamp)}`);
    blocks.push(`Latitude: ${formatCoordinate(item.lat)}`);
    blocks.push(`Longitude: ${formatCoordinate(item.lon)}`);
    blocks.push(`Altitude: ${formatAltitude(item.alt)}`);
    blocks.push(`Heading: ${formatHeading(item.heading)}`);
  }

  if (payload.options.includeNotes) blocks.push(`Notes: ${normalizeText(item.comment, 'No notes')}`);
  if (payload.options.includeTags) blocks.push(`Tags: ${item.tags.length > 0 ? item.tags.join(', ') : 'No tags'}`);
  if (payload.options.includeMapsLinks) {
    const mapsUrl = createGoogleMapsUrl(item.lat, item.lon);
    if (mapsUrl) blocks.push(`Google Maps: ${mapsUrl}`);
  }

  return blocks;
}

function drawHeaderBand(pdf, options, pageWidth, logo) {
  const hasLogo = options.includeLogo && logo?.dataUrl;
  if (!options.reportTitle && !options.organization && !options.preparedBy && !hasLogo) {
    return HEADER_TOP_Y;
  }

  let y = HEADER_TOP_Y;
  let textX = PAGE_MARGIN_MM;
  let logoBottomY = y;

  if (hasLogo) {
    const logoWidth = HEADER_LOGO_HEIGHT_MM * (logo.width / Math.max(logo.height, 1));
    pdf.addImage(logo.dataUrl, 'PNG', PAGE_MARGIN_MM, y - 4, logoWidth, HEADER_LOGO_HEIGHT_MM);
    textX = PAGE_MARGIN_MM + logoWidth + 4;
    logoBottomY = y - 4 + HEADER_LOGO_HEIGHT_MM;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(TITLE_FONT_SIZE);
  pdf.setTextColor(...COLOR_DARK_SLATE);
  if (options.reportTitle) {
    pdf.text(options.reportTitle, textX, y);
    y += 7;
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(META_FONT_SIZE);
  pdf.setTextColor(...COLOR_GRAY);
  const headerDetails = [];
  if (options.organization) headerDetails.push(`Org: ${options.organization}`);
  if (options.preparedBy) headerDetails.push(`Prep: ${options.preparedBy}`);
  if (headerDetails.length > 0) {
    pdf.text(headerDetails.join('   |   '), textX, y);
    y += 6;
  }

  // Pull the divider below the logo if title text alone wouldn't reach it.
  y = Math.max(y, logoBottomY + 2);

  pdf.setDrawColor(...COLOR_LIGHT_SLATE);
  pdf.setLineWidth(0.5);
  pdf.line(PAGE_MARGIN_MM, y, pageWidth - PAGE_MARGIN_MM, y);
  return y + 10;
}

function drawRecordHeader(pdf, item, payload, pageWidth, startY) {
  let y = startY;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(RECORD_TITLE_FONT_SIZE);
  pdf.setTextColor(...COLOR_DARK_SLATE);
  pdf.text(item.filename, PAGE_MARGIN_MM, y, { maxWidth: pageWidth - PAGE_MARGIN_MM * 2 });
  y += 6;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(SUBTITLE_FONT_SIZE);
  pdf.setTextColor(...COLOR_SUBTITLE);
  pdf.text(
    `${payload.sourceLabel}  •  Record ${item.exportOrder} of ${payload.totalIncluded}  •  ${formatDateTime(item.timestamp)}`,
    PAGE_MARGIN_MM, y
  );
  return y + 8;
}

async function drawRecordImage(pdf, item, pageWidth, startY) {
  const size = await measureImageSource(item.exportImageSrc);
  const maxWidth = pageWidth - PAGE_MARGIN_MM * 2;
  const scale = Math.min(maxWidth / size.width, IMAGE_MAX_HEIGHT_MM / size.height, 1);
  const imageWidth = size.width * scale;
  const imageHeight = size.height * scale;

  pdf.setFillColor(...COLOR_IMAGE_BG);
  pdf.setDrawColor(...COLOR_LIGHT_SLATE);
  pdf.roundedRect(PAGE_MARGIN_MM, startY, imageWidth, imageHeight, 2, 2, 'FD');

  pdf.addImage(
    item.exportImageSrc, getPdfImageFormat(item.exportImageSrc),
    PAGE_MARGIN_MM, startY, imageWidth, imageHeight
  );

  return startY + imageHeight + 10;
}

function drawTextBlocks(pdf, item, payload, pageWidth, pageHeight, startY) {
  let y = startY;
  pdf.setFontSize(BODY_FONT_SIZE);
  pdf.setTextColor(...COLOR_DARK_SLATE);

  for (const block of getPdfTextBlocks(item, payload)) {
    const lines = pdf.splitTextToSize(block, pageWidth - PAGE_MARGIN_MM * 2);
    if (y + lines.length * 5 > pageHeight - 16) {
      pdf.addPage();
      y = HEADER_TOP_Y;
    }
    pdf.text(lines, PAGE_MARGIN_MM, y);
    y += lines.length * 5 + 2;
  }
  return y;
}

async function renderRecordPage(pdf, item, payload, pageWidth, pageHeight, isFirst, logo) {
  if (!isFirst) pdf.addPage();

  let y = drawHeaderBand(pdf, payload.options, pageWidth, logo);
  y = drawRecordHeader(pdf, item, payload, pageWidth, y);

  if (payload.options.includeImages && item.exportImageSrc) {
    y = await drawRecordImage(pdf, item, pageWidth, y);
  }

  drawTextBlocks(pdf, item, payload, pageWidth, pageHeight, y);
}

async function renderJsPdfDocument(payload) {
  const jsPDFCtor = await loadExternalScript('jspdf', JSPDF_CDN, () => window.jspdf?.jsPDF);
  const pdf = new jsPDFCtor({ unit: 'mm', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const logo = payload.options.includeLogo ? await loadLogoForExport() : null;

  for (let index = 0; index < payload.items.length; index += 1) {
    await renderRecordPage(pdf, payload.items[index], payload, pageWidth, pageHeight, index === 0, logo);
  }

  pdf.save(`lenslight_export_${getExportTimestamp()}.pdf`);
}

function renderHtmlPrintFallback(printWindow, payload) {
  printWindow.document.open();
  printWindow.document.write(buildPdfHtml(payload));
  printWindow.document.close();
}

export async function exportPreparedPdf({ showStatus } = {}) {
  const payload = buildPreparedPayload();
  if (payload.totalIncluded === 0) {
    renderExportPrep();
    showStatus?.('⚠️ No records selected for export', 2000);
    return;
  }

  // Open the print window synchronously so popup blockers allow it.
  const fallbackWindow = window.open('', '_blank');
  if (fallbackWindow) {
    fallbackWindow.document.write('<!doctype html><html><body style="font-family:Arial;padding:24px;">Preparing PDF export...</body></html>');
    fallbackWindow.document.close();
  }

  const items = await hydrateExportImages(payload.items, payload.options.includeImages);
  const hydratedPayload = { ...payload, items };

  try {
    await renderJsPdfDocument(hydratedPayload);
    if (fallbackWindow && !fallbackWindow.closed) fallbackWindow.close();
    showStatus?.('PDF export downloaded in the prepared order.', 2500);
    closeExportPrep();
    return;
  } catch (error) {
    console.warn('Direct PDF export failed, falling back to print flow.', error);
  }

  if (!fallbackWindow) {
    showStatus?.('⚠️ Popup blocked. Allow popups to print as PDF.', 3500);
    return;
  }

  renderHtmlPrintFallback(fallbackWindow, hydratedPayload);
  showStatus?.('PDF opened in print preview as a fallback. Use Save as PDF.', 3500);
  closeExportPrep();
}
