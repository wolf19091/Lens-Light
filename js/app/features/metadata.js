import { state } from '../state.js';
import { getGalleryPhotos, getPhotoFilename } from '../gallery/gallery.js';
import { dbGetPhoto } from '../storage/photoDb.js';
import { createGoogleMapsUrl, downloadBlob } from '../core/utils.js';

const DEFAULT_EXPORT_OPTIONS = {
  includeLogo: true,
  includeImages: true,
  includeNotes: true,
  includeTags: true,
  includeMetadata: true,
  includeMapsLinks: true,
  reportTitle: 'Lens Light Report',
  organization: '',
  preparedBy: ''
};

const externalScriptPromises = new Map();

function loadExternalScript(key, src, getGlobal) {
  const existing = getGlobal();
  if (existing) return Promise.resolve(existing);
  if (externalScriptPromises.has(key)) return externalScriptPromises.get(key);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      const loadedGlobal = getGlobal();
      if (loadedGlobal) resolve(loadedGlobal);
      else reject(new Error(`Script loaded but ${key} global is unavailable`));
    };
    script.onerror = () => reject(new Error(`Failed to load ${key} from ${src}`));
    document.head.appendChild(script);
  });

  externalScriptPromises.set(key, promise);
  promise.catch(() => {
    externalScriptPromises.delete(key);
  });
  return promise;
}

function detectDataUrlExtension(value) {
  const match = /^data:image\/([a-zA-Z0-9+.-]+);/i.exec(String(value || ''));
  const extension = (match?.[1] || 'jpeg').toLowerCase();
  if (extension === 'jpg') return 'jpeg';
  if (extension === 'png') return 'png';
  return 'jpeg';
}

function getPdfImageFormat(value) {
  return detectDataUrlExtension(value) === 'png' ? 'PNG' : 'JPEG';
}

function measureImageSource(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve({ width: 4, height: 3 });
      return;
    }

    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth || 4,
      height: image.naturalHeight || 3
    });
    image.onerror = () => resolve({ width: 4, height: 3 });
    image.src = src;
  });
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildExcelColumns(options) {
  const columns = [
    { header: 'Order', key: 'order', width: 10 },
    { header: 'Filename', key: 'filename', width: 34 }
  ];

  if (options.includeImages) {
    columns.push({ header: 'Image', key: 'image', width: 16 });
  }

  if (options.includeMetadata) {
    columns.push(
      { header: 'Project', key: 'project', width: 20 },
      { header: 'Location', key: 'location', width: 26 },
      { header: 'Date/Time', key: 'dateTime', width: 22 },
      { header: 'Latitude', key: 'lat', width: 14 },
      { header: 'Longitude', key: 'lon', width: 14 },
      { header: 'Altitude', key: 'alt', width: 12 },
      { header: 'Heading', key: 'heading', width: 12 }
    );
  }

  if (options.includeNotes) {
    columns.push({ header: 'Notes', key: 'notes', width: 28 });
  }

  if (options.includeTags) {
    columns.push({ header: 'Tags', key: 'tags', width: 20 });
  }

  if (options.includeMapsLinks) {
    columns.push({ header: 'Google Maps', key: 'maps', width: 38 });
  }

  return columns;
}

function buildExcelRowData(item, options) {
  const row = {
    order: item.exportOrder,
    filename: item.filename
  };

  if (options.includeImages) {
    row.image = '';
  }

  if (options.includeMetadata) {
    row.project = normalizeText(item.projectName);
    row.location = normalizeText(item.location || item.checkpoint || item.zone);
    row.dateTime = formatDateTime(item.timestamp);
    row.lat = formatCoordinate(item.lat);
    row.lon = formatCoordinate(item.lon);
    row.alt = formatAltitude(item.alt);
    row.heading = formatHeading(item.heading);
  }

  if (options.includeNotes) {
    row.notes = normalizeText(item.comment, '');
  }

  if (options.includeTags) {
    row.tags = item.tags.join(', ');
  }

  if (options.includeMapsLinks) {
    row.maps = createGoogleMapsUrl(item.lat, item.lon);
  }

  return row;
}

function columnNumberToName(columnNumber) {
  let current = Number(columnNumber) || 1;
  let label = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return label || 'A';
}

function buildXlsxCell(ref, value) {
  if (value === null || value === undefined || value === '') {
    return `<c r="${ref}"/>`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }

  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function buildXlsxRow(rowIndex, values, { customHeight = null } = {}) {
  const cellsXml = values
    .map((value, index) => buildXlsxCell(`${columnNumberToName(index + 1)}${rowIndex}`, value))
    .join('');

  const heightAttr = Number.isFinite(customHeight)
    ? ` ht="${customHeight}" customHeight="1"`
    : '';

  return `<row r="${rowIndex}"${heightAttr}>${cellsXml}</row>`;
}

function dataUrlToImageAsset(dataUrl, fallbackName = 'image') {
  const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ''));
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const base64 = match[2].replace(/\s+/g, '');
  const extension = detectDataUrlExtension(dataUrl);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return {
    name: `${fallbackName}.${extension}`,
    extension,
    mimeType,
    bytes
  };
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[index] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function createStoredZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = file.bytes instanceof Uint8Array
      ? file.bytes
      : new Uint8Array(file.bytes);
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirectory = concatUint8Arrays(centralParts);
  const centralOffset = offset;
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);

  return concatUint8Arrays([...localParts, centralDirectory, endRecord]);
}

function buildXlsxBlob(payload) {
  const encoder = new TextEncoder();
  const columns = buildExcelColumns(payload.options);
  const imageColumnIndex = payload.options.includeImages
    ? columns.findIndex((column) => column.key === 'image') + 1
    : -1;
  const imageEntries = [];
  const dataStartRow = 7;

  const rowsXml = [
    buildXlsxRow(1, ['Lens Light Export']),
    buildXlsxRow(2, [`Source: ${payload.sourceLabel}`]),
    buildXlsxRow(3, [`Included records: ${payload.totalIncluded}`]),
    buildXlsxRow(4, [`Generated: ${formatDateTime(payload.generatedAt)}`]),
    buildXlsxRow(6, columns.map((column) => column.header), { customHeight: 24 })
  ];

  payload.items.forEach((item, itemIndex) => {
    const rowIndex = dataStartRow + itemIndex;
    const rowData = buildExcelRowData(item, payload.options);
    const rowValues = columns.map((column) => rowData[column.key] ?? '');
    rowsXml.push(buildXlsxRow(
      rowIndex,
      rowValues,
      { customHeight: payload.options.includeImages ? 60 : 22 }
    ));

    if (payload.options.includeImages && item.exportImageSrc && imageColumnIndex > 0) {
      const asset = dataUrlToImageAsset(item.exportImageSrc, `image${itemIndex + 1}`);
      if (asset) {
        imageEntries.push({
          ...asset,
          rowIndex,
          columnIndex: imageColumnIndex
        });
      }
    }
  });

  const lastColumnName = columnNumberToName(columns.length);
  const lastRowNumber = Math.max(6, dataStartRow + payload.items.length - 1);
  const colsXml = columns
    .map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`)
    .join('');

  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastColumnName}${lastRowNumber}"/>
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml.join('')}</sheetData>
  ${imageEntries.length > 0 ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;

  const drawingXml = imageEntries.length > 0
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${imageEntries.map((entry, index) => {
    const imageId = index + 1;
    const anchorWidth = 72 * 9525;
    const anchorHeight = 72 * 9525;
    return `
      <xdr:oneCellAnchor>
        <xdr:from>
          <xdr:col>${entry.columnIndex - 1}</xdr:col>
          <xdr:colOff>57150</xdr:colOff>
          <xdr:row>${entry.rowIndex - 1}</xdr:row>
          <xdr:rowOff>57150</xdr:rowOff>
        </xdr:from>
        <xdr:ext cx="${anchorWidth}" cy="${anchorHeight}"/>
        <xdr:pic>
          <xdr:nvPicPr>
            <xdr:cNvPr id="${imageId}" name="Image ${imageId}"/>
            <xdr:cNvPicPr/>
          </xdr:nvPicPr>
          <xdr:blipFill>
            <a:blip r:embed="rId${imageId}"/>
            <a:stretch><a:fillRect/></a:stretch>
          </xdr:blipFill>
          <xdr:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="${anchorWidth}" cy="${anchorHeight}"/>
            </a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          </xdr:spPr>
        </xdr:pic>
        <xdr:clientData/>
      </xdr:oneCellAnchor>
    `;
  }).join('')}
</xdr:wsDr>`
    : '';

  const drawingRelsXml = imageEntries.length > 0
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${imageEntries.map((entry, index) => `
    <Relationship
      Id="rId${index + 1}"
      Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
      Target="../media/${entry.name}"/>
  `).join('')}
</Relationships>`
    : '';

  const sheetRelsXml = imageEntries.length > 0
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`
    : '';

  const contentTypeDefaults = new Set([
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>'
  ]);

  for (const entry of imageEntries) {
    contentTypeDefaults.add(`<Default Extension="${entry.extension}" ContentType="${entry.mimeType}"/>`);
  }

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  ${Array.from(contentTypeDefaults).join('')}
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  ${imageEntries.length > 0 ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Lens Light Export" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1">
    <font>
      <sz val="11"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Lens Light</Application>
</Properties>`;

  const generatedIso = new Date(payload.generatedAt).toISOString();
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Lens Light Export</dc:title>
  <dc:creator>Lens Light</dc:creator>
  <cp:lastModifiedBy>Lens Light</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${generatedIso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${generatedIso}</dcterms:modified>
</cp:coreProperties>`;

  const files = [
    { name: '[Content_Types].xml', bytes: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', bytes: encoder.encode(rootRelsXml) },
    { name: 'docProps/app.xml', bytes: encoder.encode(appXml) },
    { name: 'docProps/core.xml', bytes: encoder.encode(coreXml) },
    { name: 'xl/workbook.xml', bytes: encoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', bytes: encoder.encode(workbookRelsXml) },
    { name: 'xl/styles.xml', bytes: encoder.encode(stylesXml) },
    { name: 'xl/worksheets/sheet1.xml', bytes: encoder.encode(worksheetXml) }
  ];

  if (imageEntries.length > 0) {
    files.push(
      { name: 'xl/worksheets/_rels/sheet1.xml.rels', bytes: encoder.encode(sheetRelsXml) },
      { name: 'xl/drawings/drawing1.xml', bytes: encoder.encode(drawingXml) },
      { name: 'xl/drawings/_rels/drawing1.xml.rels', bytes: encoder.encode(drawingRelsXml) }
    );

    imageEntries.forEach((entry) => {
      files.push({
        name: `xl/media/${entry.name}`,
        bytes: entry.bytes
      });
    });
  }

  const zipBytes = createStoredZip(files);
  return new Blob(
    [zipBytes],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  );
}

function getExportDom() {
  return {
    triggerBtn: document.getElementById('export-metadata-btn'),
    modal: document.getElementById('export-prep-modal'),
    closeBtn: document.getElementById('close-export-prep'),
    cancelBtn: document.getElementById('export-prep-cancel-btn'),
    summary: document.getElementById('export-prep-summary'),
    source: document.getElementById('export-prep-source'),
    status: document.getElementById('export-prep-status'),
    empty: document.getElementById('export-prep-empty'),
    list: document.getElementById('export-prep-list'),
    selectAllBtn: document.getElementById('export-prep-select-all'),
    clearAllBtn: document.getElementById('export-prep-clear-all'),
    pdfBtn: document.getElementById('export-prep-pdf-btn'),
    excelBtn: document.getElementById('export-prep-excel-btn'),
    optionLogo: document.getElementById('export-option-logo'),
    optionImages: document.getElementById('export-option-images'),
    optionNotes: document.getElementById('export-option-notes'),
    optionTags: document.getElementById('export-option-tags'),
    optionMetadata: document.getElementById('export-option-metadata'),
    optionMapsLinks: document.getElementById('export-option-maps'),
    varTitle: document.getElementById('export-var-title'),
    varOrg: document.getElementById('export-var-org'),
    varPrepared: document.getElementById('export-var-prepared')
  };
}

function ensureExportPrepState() {
  if (!state.exportPrep) {
    state.exportPrep = {
      open: false,
      source: 'gallery',
      sourceLabel: 'Current gallery results',
      items: [],
      dragId: null,
      options: { ...DEFAULT_EXPORT_OPTIONS }
    };
  }

  state.exportPrep.options = {
    ...DEFAULT_EXPORT_OPTIONS,
    ...(state.exportPrep.options || {})
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';

  return new Intl.DateTimeFormat(state.currentLang === 'ar' ? 'ar-SA' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(6) : '—';
}

function formatHeading(value) {
  return Number.isFinite(value) ? `${Math.round(value)}°` : '—';
}

function formatAltitude(value) {
  return Number.isFinite(value) ? `${Math.round(value)} m` : '—';
}

function normalizeText(value, fallback = '—') {
  const clean = String(value || '').trim();
  return clean || fallback;
}

function getExportTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

function revokeExportPrepUrls(items = state.exportPrep?.items || []) {
  for (const item of items) {
    if (!item?.previewUrl) continue;
    try {
      URL.revokeObjectURL(item.previewUrl);
    } catch {}
  }
}

function resetExportPrepItems(items) {
  let selectedOrder = 0;
  state.exportPrep.items = items.map((item) => ({
    ...item,
    exportOrder: item.selected ? ++selectedOrder : null
  }));
}

function getSelectedExportItems() {
  return state.exportPrep.items
    .filter((item) => item.selected)
    .map((item, index) => ({
      ...item,
      exportOrder: index + 1
    }));
}

function getSourcePhotos(ids = null) {
  const visiblePhotos = getGalleryPhotos().slice().reverse();

  if (Array.isArray(ids) && ids.length > 0) {
    const ordered = ids
      .map((id) => state.photos.find((photo) => photo.id === id))
      .filter(Boolean);

    return {
      source: 'custom',
      sourceLabel: 'Custom export set',
      photos: ordered
    };
  }

  if (state.selectedPhotos.size > 0) {
    const selected = visiblePhotos.filter((photo) => state.selectedPhotos.has(photo.id));
    return {
      source: 'selected',
      sourceLabel: 'Selected gallery records',
      photos: selected
    };
  }

  const activeProject = String(state.settings.projectName || '').trim();
  if (activeProject) {
    return {
      source: 'project',
      sourceLabel: `Project records: ${activeProject}`,
      photos: visiblePhotos
    };
  }

  return {
    source: 'gallery',
    sourceLabel: 'Current filtered gallery results',
    photos: visiblePhotos
  };
}

async function normalizeExportItem(photoMeta, index) {
  const record = await dbGetPhoto(photoMeta.id);
  const blob = record?.blob || null;
  const timestamp = record?.timestamp || photoMeta.timestamp || new Date().toISOString();

  return {
    id: photoMeta.id,
    filename: getPhotoFilename({ ...photoMeta, timestamp }),
    blob,
    previewUrl: blob ? URL.createObjectURL(blob) : '',
    projectName: record?.projectName || photoMeta.projectName || '',
    mission: record?.mission || '',
    location: record?.location || photoMeta.location || '',
    checkpoint: record?.checkpoint || '',
    zone: record?.zone || '',
    lat: Number.isFinite(record?.lat) ? record.lat : photoMeta.lat,
    lon: Number.isFinite(record?.lon) ? record.lon : photoMeta.lon,
    alt: Number.isFinite(record?.alt) ? record.alt : photoMeta.alt,
    heading: Number.isFinite(record?.heading) ? record.heading : photoMeta.heading,
    timestamp,
    comment: normalizeText(record?.comment || photoMeta.comment || '', ''),
    tags: Array.isArray(record?.tags) ? record.tags : [],
    selected: true,
    exportOrder: index + 1
  };
}

async function normalizeExportItems(photos) {
  return Promise.all(photos.map((photo, index) => normalizeExportItem(photo, index)));
}

function syncOptionInputs() {
  const dom = getExportDom();
  if (dom.optionLogo) dom.optionLogo.checked = Boolean(state.exportPrep.options.includeLogo !== false);
  if (dom.optionImages) dom.optionImages.checked = Boolean(state.exportPrep.options.includeImages);
  if (dom.optionNotes) dom.optionNotes.checked = Boolean(state.exportPrep.options.includeNotes);
  if (dom.optionTags) dom.optionTags.checked = Boolean(state.exportPrep.options.includeTags);
  if (dom.optionMetadata) dom.optionMetadata.checked = Boolean(state.exportPrep.options.includeMetadata);
  if (dom.optionMapsLinks) dom.optionMapsLinks.checked = Boolean(state.exportPrep.options.includeMapsLinks);
  if (dom.varTitle) dom.varTitle.value = state.exportPrep.options.reportTitle || '';
  if (dom.varOrg) dom.varOrg.value = state.exportPrep.options.organization || '';
  if (dom.varPrepared) dom.varPrepared.value = state.exportPrep.options.preparedBy || '';
}

function readOptionInputs() {
  const dom = getExportDom();
  state.exportPrep.options = {
    includeLogo: Boolean(dom.optionLogo?.checked),
    includeImages: Boolean(dom.optionImages?.checked),
    includeNotes: Boolean(dom.optionNotes?.checked),
    includeTags: Boolean(dom.optionTags?.checked),
    includeMetadata: Boolean(dom.optionMetadata?.checked),
    includeMapsLinks: Boolean(dom.optionMapsLinks?.checked),
    reportTitle: dom.varTitle?.value || '',
    organization: dom.varOrg?.value || '',
    preparedBy: dom.varPrepared?.value || ''
  };
}

function renderExportPrep() {
  const dom = getExportDom();
  if (!dom.modal || !dom.list) return;

  syncOptionInputs();

  const items = state.exportPrep.items || [];
  const selectedItems = getSelectedExportItems();
  const selectedCount = selectedItems.length;
  const totalCount = items.length;
  const allSelected = totalCount > 0 && selectedCount === totalCount;

  dom.summary.textContent = totalCount > 0
    ? `${selectedCount} of ${totalCount} record(s) selected. Export follows the order shown.`
    : 'No records available for this export source.';
  dom.source.textContent = `Source: ${state.exportPrep.sourceLabel || 'Current filtered gallery results'}`;
  dom.status.textContent = selectedCount > 0
    ? `${selectedCount} record(s) ready. PDF and Excel will use this exact order.`
    : 'Select at least one record to enable export.';
  dom.selectAllBtn.textContent = allSelected ? 'Deselect All' : 'Select All';
  dom.empty.hidden = totalCount > 0;
  dom.list.hidden = totalCount === 0;
  dom.pdfBtn.disabled = selectedCount === 0;
  dom.excelBtn.disabled = selectedCount === 0;

  if (totalCount === 0) {
    dom.list.innerHTML = '';
    return;
  }

  dom.list.innerHTML = items.map((item) => {
    const orderLabel = item.exportOrder ? String(item.exportOrder) : '&mdash;';
    const projectText = normalizeText(item.projectName, 'No project');
    const locationText = normalizeText(item.location || item.checkpoint || item.zone, 'No location');
    const noteText = item.comment ? escapeHtml(item.comment) : 'No notes';
    const thumbMarkup = item.previewUrl
      ? `<img src="${item.previewUrl}" alt="${escapeHtml(item.filename)}">`
      : `<div class="export-prep-thumb-fallback">No preview</div>`;

    return `
      <div class="export-prep-item${item.selected ? '' : ' is-unselected'}" data-photo-id="${item.id}" draggable="true" role="listitem">
        <input class="export-prep-check" data-action="toggle-selected" type="checkbox" ${item.selected ? 'checked' : ''} aria-label="Select ${escapeHtml(item.filename)} for export">
        <div class="export-prep-order">${orderLabel}</div>
        <div class="export-prep-thumb">${thumbMarkup}</div>
        <div class="export-prep-body">
          <div class="export-prep-title-row">
            <button class="export-prep-handle" type="button" aria-label="Drag to reorder">⋮⋮</button>
            <div class="export-prep-filename">${escapeHtml(item.filename)}</div>
          </div>
          <div class="export-prep-meta">Project: ${escapeHtml(projectText)}</div>
          <div class="export-prep-meta">Location: ${escapeHtml(locationText)}</div>
          <div class="export-prep-meta">Date: ${escapeHtml(formatDateTime(item.timestamp))}</div>
          <div class="export-prep-meta">Notes: ${noteText}</div>
        </div>
        <div class="export-prep-controls">
          <button class="export-prep-move" data-action="move-top" type="button" title="Move to top">⇤</button>
          <button class="export-prep-move" data-action="move-up" type="button" title="Move up">↑</button>
          <button class="export-prep-move" data-action="move-down" type="button" title="Move down">↓</button>
          <button class="export-prep-move" data-action="move-bottom" type="button" title="Move to bottom">⇥</button>
        </div>
      </div>
    `;
  }).join('');
}

function moveExportItem(fromIndex, toIndex) {
  const items = state.exportPrep.items.slice();
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return;
  }

  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  resetExportPrepItems(items);
  renderExportPrep();
}

function closeExportPrep() {
  const dom = getExportDom();
  revokeExportPrepUrls();
  state.exportPrep.open = false;
  state.exportPrep.dragId = null;
  state.exportPrep.items = [];
  if (dom.modal) {
    dom.modal.classList.remove('open');
    dom.modal.setAttribute('aria-hidden', 'true');
  }
}

async function openExportPrep({ ids = null, showStatus } = {}) {
  ensureExportPrepState();
  const dom = getExportDom();
  if (!dom.modal) return;

  const source = getSourcePhotos(ids);
  if (source.photos.length === 0) {
    showStatus?.('⚠️ No records available to export', 2500);
    return;
  }

  revokeExportPrepUrls();
  state.exportPrep.open = true;
  state.exportPrep.source = source.source;
  state.exportPrep.sourceLabel = source.sourceLabel;
  state.exportPrep.items = [];
  dom.modal.classList.add('open');
  dom.modal.setAttribute('aria-hidden', 'false');
  dom.summary.textContent = 'Preparing export records...';
  dom.source.textContent = `Source: ${source.sourceLabel}`;
  dom.status.textContent = 'Loading thumbnails and metadata...';
  dom.list.innerHTML = '';
  dom.empty.hidden = true;
  syncOptionInputs();

  const items = await normalizeExportItems(source.photos);
  resetExportPrepItems(items);
  renderExportPrep();
}

function buildPreparedPayload() {
  readOptionInputs();
  const items = getSelectedExportItems();

  return {
    source: state.exportPrep.source,
    sourceLabel: state.exportPrep.sourceLabel,
    generatedAt: new Date().toISOString(),
    options: { ...state.exportPrep.options },
    totalIncluded: items.length,
    items
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    if (!blob) {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

async function hydrateExportImages(items, includeImages) {
  if (!includeImages) {
    return items.map((item) => ({ ...item, exportImageSrc: '', imageWidth: 4, imageHeight: 3 }));
  }

  const hydrated = await Promise.all(items.map(async (item) => {
    const src = await blobToDataUrl(item.blob);
    let width = 4, height = 3;
    if (src) {
      try {
        const dims = await measureImageSource(src);
        width = dims.width || 4;
        height = dims.height || 3;
      } catch (e) {}
    }
    return {
      ...item,
      exportImageSrc: src,
      imageWidth: width,
      imageHeight: height
    };
  }));

  return hydrated;
}

function buildMetadataBlock(item, options) {
  if (!options.includeMetadata) return '';

  return `
    <div class="export-metadata-grid">
      <div><strong>Order</strong><span>${item.exportOrder}</span></div>
      <div><strong>Project</strong><span>${escapeHtml(normalizeText(item.projectName))}</span></div>
      <div><strong>Location</strong><span>${escapeHtml(normalizeText(item.location || item.checkpoint || item.zone))}</span></div>
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
          .report-header { margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #e2e8f0; }
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
        ${payload.items.map((item, index) => {
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

          const reportHeaderMarkup = (payload.options.reportTitle || payload.options.organization || payload.options.preparedBy) 
            ? `<div class="report-header">
                 ${payload.options.reportTitle ? `<div class="report-title">${escapeHtml(payload.options.reportTitle)}</div>` : ''}
                 <div class="report-meta">
                   ${payload.options.organization ? `<span>Org: ${escapeHtml(payload.options.organization)}</span>` : ''}
                   ${payload.options.preparedBy ? `<span>Prep: ${escapeHtml(payload.options.preparedBy)}</span>` : ''}
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
    blocks.push(`Date: ${formatDateTime(item.timestamp)}`);
    blocks.push(`Latitude: ${formatCoordinate(item.lat)}`);
    blocks.push(`Longitude: ${formatCoordinate(item.lon)}`);
    blocks.push(`Altitude: ${formatAltitude(item.alt)}`);
    blocks.push(`Heading: ${formatHeading(item.heading)}`);
  }

  if (payload.options.includeNotes) {
    blocks.push(`Notes: ${normalizeText(item.comment, 'No notes')}`);
  }

  if (payload.options.includeTags) {
    blocks.push(`Tags: ${item.tags.length > 0 ? item.tags.join(', ') : 'No tags'}`);
  }

  if (payload.options.includeMapsLinks) {
    const mapsUrl = createGoogleMapsUrl(item.lat, item.lon);
    if (mapsUrl) blocks.push(`Google Maps: ${mapsUrl}`);
  }

  return blocks;
}

async function exportPreparedPdf({ showStatus } = {}) {
  const payload = buildPreparedPayload();
  if (payload.totalIncluded === 0) {
    renderExportPrep();
    showStatus?.('⚠️ No records selected for export', 2000);
    return;
  }

  const fallbackWindow = window.open('', '_blank');
  if (fallbackWindow) {
    fallbackWindow.document.write('<!doctype html><html><body style="font-family:Arial;padding:24px;">Preparing PDF export...</body></html>');
    fallbackWindow.document.close();
  }

  const items = await hydrateExportImages(payload.items, payload.options.includeImages);
  const hydratedPayload = { ...payload, items };

  try {
    const jsPDFCtor = await loadExternalScript(
      'jspdf',
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
      () => window.jspdf?.jsPDF
    );

    const pdf = new jsPDFCtor({ unit: 'mm', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (let index = 0; index < hydratedPayload.items.length; index += 1) {
      const item = hydratedPayload.items[index];
      if (index > 0) pdf.addPage();

      let y = 16;
      
      // Header Section
      if (hydratedPayload.options.reportTitle || hydratedPayload.options.organization || hydratedPayload.options.preparedBy) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(18);
        pdf.setTextColor(15, 23, 42); // dark slate
        if (hydratedPayload.options.reportTitle) {
          pdf.text(hydratedPayload.options.reportTitle, 14, y);
          y += 7;
        }
        
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(71, 85, 105); // gray
        let headerDetails = [];
        if (hydratedPayload.options.organization) headerDetails.push(`Org: ${hydratedPayload.options.organization}`);
        if (hydratedPayload.options.preparedBy) headerDetails.push(`Prep: ${hydratedPayload.options.preparedBy}`);
        if (headerDetails.length > 0) {
          pdf.text(headerDetails.join('   |   '), 14, y);
          y += 6;
        }
        
        pdf.setDrawColor(226, 232, 240); // light slate
        pdf.setLineWidth(0.5);
        pdf.line(14, y, pageWidth - 14, y);
        y += 10;
      }

      // Record Title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(15, 23, 42);
      pdf.text(item.filename, 14, y, { maxWidth: pageWidth - 28 });
      y += 6;

      // Subtitle
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`${hydratedPayload.sourceLabel}  •  Record ${item.exportOrder} of ${hydratedPayload.totalIncluded}  •  ${formatDateTime(item.timestamp)}`, 14, y);
      y += 8;

      // Image
      if (hydratedPayload.options.includeImages && item.exportImageSrc) {
        const size = await measureImageSource(item.exportImageSrc);
        const maxWidth = pageWidth - 28;
        const maxHeight = 120;
        const scale = Math.min(maxWidth / size.width, maxHeight / size.height, 1);
        const imageWidth = size.width * scale;
        const imageHeight = size.height * scale;

        // Image border/bg
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(226, 232, 240);
        pdf.roundedRect(14, y, imageWidth, imageHeight, 2, 2, 'FD');

        pdf.addImage(
          item.exportImageSrc,
          getPdfImageFormat(item.exportImageSrc),
          14,
          y,
          imageWidth,
          imageHeight
        );
        y += imageHeight + 10;
      }

      // Data grids/blocks
      pdf.setFontSize(10);
      pdf.setTextColor(15, 23, 42);
      const textBlocks = getPdfTextBlocks(item, hydratedPayload);
      for (const block of textBlocks) {
        const lines = pdf.splitTextToSize(block, pageWidth - 28);
        if (y + lines.length * 5 > pageHeight - 16) {
          pdf.addPage();
          y = 16;
        }
        // Block text
        pdf.text(lines, 14, y);
        y += lines.length * 5 + 2;
      }
    }

    pdf.save(`lenslight_export_${getExportTimestamp()}.pdf`);
    if (fallbackWindow && !fallbackWindow.closed) {
      fallbackWindow.close();
    }
    showStatus?.('PDF export downloaded in the prepared order.', 2500);
    closeExportPrep();
    return;
  } catch (error) {
    console.warn('Direct PDF export failed, falling back to print flow.', error);
  }

  const printWindow = fallbackWindow;
  if (!printWindow) {
    showStatus?.('⚠️ Popup blocked. Allow popups to print as PDF.', 3500);
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildPdfHtml(hydratedPayload));
  printWindow.document.close();

  showStatus?.('PDF opened in print preview as a fallback. Use Save as PDF.', 3500);
  closeExportPrep();
}

function buildExcelHtml(payload) {
  const imageHeader = payload.options.includeImages ? '<th>Image</th>' : '';
  const notesHeader = payload.options.includeNotes ? '<th>Notes</th>' : '';
  const tagsHeader = payload.options.includeTags ? '<th>Tags</th>' : '';
  const metadataHeaders = payload.options.includeMetadata
    ? '<th>Project</th><th>Location</th><th>Date/Time</th><th>Latitude</th><th>Longitude</th><th>Altitude</th><th>Heading</th>'
    : '';
  const mapsHeader = payload.options.includeMapsLinks ? '<th>Google Maps</th>' : '';

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
          .summary { margin-bottom: 12px; }
        </style>
      </head>
      <body>
        <div class="summary">
          <strong>Lens Light Export</strong><br>
          Source: ${escapeHtml(payload.sourceLabel)}<br>
          Included records: ${payload.totalIncluded}<br>
          Generated: ${escapeHtml(formatDateTime(payload.generatedAt))}
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

async function exportPreparedExcel({ showStatus } = {}) {
  const payload = buildPreparedPayload();
  if (payload.totalIncluded === 0) {
    renderExportPrep();
    showStatus?.('⚠️ No records selected for export', 2000);
    return;
  }

  const items = await hydrateExportImages(payload.items, payload.options.includeImages);
  const hydratedPayload = { ...payload, items };
  const columns = buildExcelColumns(hydratedPayload.options);

  try {
    const ExcelJS = await loadExternalScript(
      'exceljs',
      'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
      () => window.ExcelJS
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Lens Light Export');
    sheet.properties.defaultRowHeight = 20;

    sheet.getCell('A1').value = 'Lens Light Export';
    sheet.getCell('A1').font = { bold: true, size: 16 };
    sheet.getCell('A2').value = `Source: ${hydratedPayload.sourceLabel}`;
    sheet.getCell('A3').value = `Included records: ${hydratedPayload.totalIncluded}`;
    sheet.getCell('A4').value = `Generated: ${formatDateTime(hydratedPayload.generatedAt)}`;

    const headerRowIndex = 6;
    sheet.columns = columns;
    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.values = columns.map((column) => column.header);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    let excelRow = headerRowIndex + 1;
    const imageColumnIndex = hydratedPayload.options.includeImages
      ? columns.findIndex((column) => column.key === 'image') + 1
      : -1;

    for (const item of hydratedPayload.items) {
      const rowData = buildExcelRowData(item, hydratedPayload.options);
      const row = sheet.getRow(excelRow);
      columns.forEach((column, columnIndex) => {
        row.getCell(columnIndex + 1).value = rowData[column.key] ?? '';
      });
      row.alignment = { vertical: 'middle', wrapText: true };
      
      let targetWidth = 72;
      let targetHeight = 72;

      if (hydratedPayload.options.includeImages && item.exportImageSrc) {
         if (item.imageWidth && item.imageHeight) {
            const ratio = item.imageWidth / item.imageHeight;
            targetHeight = 120; // larger clear image
            targetWidth = targetHeight * ratio;
            if (targetWidth > 320) {
               targetWidth = 320;
               targetHeight = targetWidth / ratio;
            }
         }
      }

      row.height = hydratedPayload.options.includeImages ? (targetHeight * 0.75 + 15) : 22;

      if (hydratedPayload.options.includeImages && item.exportImageSrc && imageColumnIndex > 0) {
        const imageId = workbook.addImage({
          base64: item.exportImageSrc,
          extension: detectDataUrlExtension(item.exportImageSrc)
        });

        sheet.addImage(imageId, {
          tl: { col: imageColumnIndex - 1 + 0.12, row: excelRow - 1 + 0.12 },
          ext: { width: targetWidth, height: targetHeight }
        });
        
        const currentWidth = sheet.getColumn(imageColumnIndex).width || 16;
        const requiredColWidth = (targetWidth / 7.5) + 2;
        if (requiredColWidth > currentWidth) {
           sheet.getColumn(imageColumnIndex).width = requiredColWidth;
        }
      }

      excelRow += 1;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const xlsxBlob = new Blob(
      [buffer],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );

    downloadBlob(xlsxBlob, `lenslight_export_${getExportTimestamp()}.xlsx`, { showStatus });
    showStatus?.('Excel export downloaded with embedded photos.', 2500);
    closeExportPrep();
    return;
  } catch (error) {
    console.warn('ExcelJS export failed, falling back to local workbook builder.', error);
  }

  try {
    const workbookBlob = buildXlsxBlob(hydratedPayload);
    downloadBlob(workbookBlob, `lenslight_export_${getExportTimestamp()}.xlsx`, { showStatus });
    showStatus?.('Excel export downloaded with embedded photos.', 2500);
    closeExportPrep();
    return;
  } catch (error) {
    console.warn('Local XLSX export failed, falling back to compatibility workbook.', error);
  }

  const html = buildExcelHtml(hydratedPayload);
  const blob = new Blob([`\uFEFF${html}`], { type: 'application/vnd.ms-excel;charset=utf-8' });

  downloadBlob(blob, `lenslight_export_${getExportTimestamp()}.xls`, { showStatus });
  showStatus?.('Excel exported in compatibility mode. Images may be limited in some viewers.', 3200);
  closeExportPrep();
}

function bindPrepEvents({ showStatus } = {}) {
  const dom = getExportDom();
  if (!dom.modal || dom.modal.dataset.bound === 'true') return;

  dom.modal.dataset.bound = 'true';

  dom.closeBtn?.addEventListener('click', () => closeExportPrep());
  dom.cancelBtn?.addEventListener('click', () => closeExportPrep());
  dom.triggerBtn?.addEventListener('click', async () => openExportPrep({ showStatus }));

  dom.selectAllBtn?.addEventListener('click', () => {
    const shouldSelectAll = getSelectedExportItems().length !== state.exportPrep.items.length;
    resetExportPrepItems(state.exportPrep.items.map((item) => ({
      ...item,
      selected: shouldSelectAll
    })));
    renderExportPrep();
  });

  dom.clearAllBtn?.addEventListener('click', () => {
    resetExportPrepItems(state.exportPrep.items.map((item) => ({
      ...item,
      selected: false
    })));
    renderExportPrep();
  });

  [
    dom.optionImages,
    dom.optionNotes,
    dom.optionTags,
    dom.optionMetadata,
    dom.optionMapsLinks
  ].forEach((input) => {
    input?.addEventListener('change', () => readOptionInputs());
  });

  dom.pdfBtn?.addEventListener('click', () => {
    exportPreparedPdf({ showStatus });
  });

  dom.excelBtn?.addEventListener('click', () => {
    exportPreparedExcel({ showStatus });
  });

  dom.list?.addEventListener('click', (event) => {
    const itemEl = event.target.closest('.export-prep-item');
    if (!itemEl) return;
    const photoId = Number(itemEl.dataset.photoId);
    const itemIndex = state.exportPrep.items.findIndex((item) => item.id === photoId);
    if (itemIndex < 0) return;

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'toggle-selected') {
      const nextSelected = Boolean(event.target.checked);
      resetExportPrepItems(state.exportPrep.items.map((item, index) => (
        index === itemIndex ? { ...item, selected: nextSelected } : item
      )));
      renderExportPrep();
      return;
    }

    const lastIndex = state.exportPrep.items.length - 1;
    if (action === 'move-top') moveExportItem(itemIndex, 0);
    if (action === 'move-up') moveExportItem(itemIndex, Math.max(0, itemIndex - 1));
    if (action === 'move-down') moveExportItem(itemIndex, Math.min(lastIndex, itemIndex + 1));
    if (action === 'move-bottom') moveExportItem(itemIndex, lastIndex);
  });

  dom.list?.addEventListener('dragstart', (event) => {
    const itemEl = event.target.closest('.export-prep-item');
    if (!itemEl) return;
    state.exportPrep.dragId = Number(itemEl.dataset.photoId);
    event.dataTransfer.effectAllowed = 'move';
  });

  dom.list?.addEventListener('dragover', (event) => {
    const itemEl = event.target.closest('.export-prep-item');
    if (!itemEl) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dom.list.querySelectorAll('.export-prep-item.drag-over').forEach((el) => el.classList.remove('drag-over'));
    itemEl.classList.add('drag-over');
  });

  dom.list?.addEventListener('drop', (event) => {
    const itemEl = event.target.closest('.export-prep-item');
    if (!itemEl) return;
    event.preventDefault();

    const fromIndex = state.exportPrep.items.findIndex((item) => item.id === state.exportPrep.dragId);
    const toIndex = state.exportPrep.items.findIndex((item) => item.id === Number(itemEl.dataset.photoId));
    dom.list.querySelectorAll('.export-prep-item.drag-over').forEach((el) => el.classList.remove('drag-over'));
    state.exportPrep.dragId = null;
    moveExportItem(fromIndex, toIndex);
  });

  dom.list?.addEventListener('dragend', () => {
    state.exportPrep.dragId = null;
    dom.list.querySelectorAll('.export-prep-item.drag-over').forEach((el) => el.classList.remove('drag-over'));
  });
}

export function initMetadataExport(dom, { showStatus } = {}) {
  ensureExportPrepState();
  const exportDom = getExportDom();
  if (!exportDom.triggerBtn || !exportDom.modal) {
    console.warn('Export preparation UI not found');
    return;
  }

  bindPrepEvents({ showStatus });
}

export async function exportSinglePhotoMetadata(photoId, format = 'excel', { showStatus } = {}) {
  await openExportPrep({ ids: [photoId], showStatus });
  if (format === 'pdf') {
    await exportPreparedPdf({ showStatus });
  } else {
    await exportPreparedExcel({ showStatus });
  }
}
