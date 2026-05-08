/**
 * Self-rolled OOXML/.xlsx writer used as the second-tier Excel fallback (after
 * the primary ExcelJS branch fails to load). Produces byte-equivalent output
 * to vanilla ExcelJS with embedded images.
 */

import { createGoogleMapsUrl, createShortAddress } from '../../core/utils.js';
import {
  detectDataUrlExtension,
  escapeXml,
  formatAltitude,
  formatCoordinate,
  formatDateTime,
  formatHeading,
  normalizeText
} from './format.js';

const HEADER_ROW = 6;
const DATA_START_ROW = 7;
const IMAGE_ANCHOR_EMU = 72 * 9525;

export function buildExcelColumns(options) {
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
      { header: 'Short Address', key: 'shortAddress', width: 16 },
      { header: 'Date/Time', key: 'dateTime', width: 22 },
      { header: 'Latitude', key: 'lat', width: 14 },
      { header: 'Longitude', key: 'lon', width: 14 },
      { header: 'Altitude', key: 'alt', width: 12 },
      { header: 'Heading', key: 'heading', width: 12 }
    );
  }

  if (options.includeNotes) columns.push({ header: 'Notes', key: 'notes', width: 28 });
  if (options.includeTags) columns.push({ header: 'Tags', key: 'tags', width: 20 });
  if (options.includeMapsLinks) columns.push({ header: 'Google Maps', key: 'maps', width: 38 });

  return columns;
}

export function buildExcelRowData(item, options) {
  const row = { order: item.exportOrder, filename: item.filename };

  if (options.includeImages) row.image = '';

  if (options.includeMetadata) {
    row.project = normalizeText(item.projectName);
    row.location = normalizeText(item.location || item.checkpoint || item.zone);
    row.shortAddress = item.shortAddress || createShortAddress(item.lat, item.lon);
    row.dateTime = formatDateTime(item.timestamp);
    row.lat = formatCoordinate(item.lat);
    row.lon = formatCoordinate(item.lon);
    row.alt = formatAltitude(item.alt);
    row.heading = formatHeading(item.heading);
  }

  if (options.includeNotes) row.notes = normalizeText(item.comment, '');
  if (options.includeTags) row.tags = item.tags.join(', ');
  if (options.includeMapsLinks) row.maps = createGoogleMapsUrl(item.lat, item.lon);

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
  const heightAttr = Number.isFinite(customHeight) ? ` ht="${customHeight}" customHeight="1"` : '';
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

  return { name: `${fallbackName}.${extension}`, extension, mimeType, bytes };
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

/** Builds a STORE-method (uncompressed) ZIP archive — sufficient for OOXML. */
function createStoredZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
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

function buildSummaryRows(payload) {
  return [
    buildXlsxRow(1, ['Lens Light Export']),
    buildXlsxRow(2, [`Source: ${payload.sourceLabel}`]),
    buildXlsxRow(3, [`Included records: ${payload.totalIncluded}`]),
    buildXlsxRow(4, [`Generated: ${formatDateTime(payload.generatedAt)}`])
  ];
}

function buildDataRows(payload, columns, imageColumnIndex, imageEntries) {
  const rows = [];
  payload.items.forEach((item, itemIndex) => {
    const rowIndex = DATA_START_ROW + itemIndex;
    const rowData = buildExcelRowData(item, payload.options);
    const rowValues = columns.map((column) => rowData[column.key] ?? '');
    rows.push(buildXlsxRow(
      rowIndex,
      rowValues,
      { customHeight: payload.options.includeImages ? 60 : 22 }
    ));

    if (payload.options.includeImages && item.exportImageSrc && imageColumnIndex > 0) {
      const asset = dataUrlToImageAsset(item.exportImageSrc, `image${itemIndex + 1}`);
      if (asset) {
        imageEntries.push({ ...asset, rowIndex, columnIndex: imageColumnIndex });
      }
    }
  });
  return rows;
}

function buildWorksheetXml(columns, rowsXml, lastColumnName, lastRowNumber, hasImages) {
  const colsXml = columns
    .map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastColumnName}${lastRowNumber}"/>
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml.join('')}</sheetData>
  ${hasImages ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
}

function buildDrawingXml(imageEntries) {
  if (imageEntries.length === 0) return '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${imageEntries.map((entry, index) => {
    const imageId = index + 1;
    return `
      <xdr:oneCellAnchor>
        <xdr:from>
          <xdr:col>${entry.columnIndex - 1}</xdr:col>
          <xdr:colOff>57150</xdr:colOff>
          <xdr:row>${entry.rowIndex - 1}</xdr:row>
          <xdr:rowOff>57150</xdr:rowOff>
        </xdr:from>
        <xdr:ext cx="${IMAGE_ANCHOR_EMU}" cy="${IMAGE_ANCHOR_EMU}"/>
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
              <a:ext cx="${IMAGE_ANCHOR_EMU}" cy="${IMAGE_ANCHOR_EMU}"/>
            </a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          </xdr:spPr>
        </xdr:pic>
        <xdr:clientData/>
      </xdr:oneCellAnchor>
    `;
  }).join('')}
</xdr:wsDr>`;
}

function buildContentTypesXml(imageEntries) {
  const defaults = new Set([
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>'
  ]);
  for (const entry of imageEntries) {
    defaults.add(`<Default Extension="${entry.extension}" ContentType="${entry.mimeType}"/>`);
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  ${Array.from(defaults).join('')}
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  ${imageEntries.length > 0 ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}
</Types>`;
}

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Lens Light Export" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Lens Light</Application>
</Properties>`;

function buildCoreXml(generatedAt) {
  const generatedIso = new Date(generatedAt).toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Lens Light Export</dc:title>
  <dc:creator>Lens Light</dc:creator>
  <cp:lastModifiedBy>Lens Light</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${generatedIso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${generatedIso}</dcterms:modified>
</cp:coreProperties>`;
}

function buildDrawingRelsXml(imageEntries) {
  if (imageEntries.length === 0) return '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${imageEntries.map((entry, index) => `
    <Relationship
      Id="rId${index + 1}"
      Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
      Target="../media/${entry.name}"/>
  `).join('')}
</Relationships>`;
}

const SHEET_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;

export function buildXlsxBlob(payload) {
  const encoder = new TextEncoder();
  const columns = buildExcelColumns(payload.options);
  const imageColumnIndex = payload.options.includeImages
    ? columns.findIndex((column) => column.key === 'image') + 1
    : -1;
  const imageEntries = [];

  const rowsXml = [
    ...buildSummaryRows(payload),
    buildXlsxRow(HEADER_ROW, columns.map((column) => column.header), { customHeight: 24 }),
    ...buildDataRows(payload, columns, imageColumnIndex, imageEntries)
  ];

  const lastColumnName = columnNumberToName(columns.length);
  const lastRowNumber = Math.max(HEADER_ROW, DATA_START_ROW + payload.items.length - 1);

  const worksheetXml = buildWorksheetXml(
    columns, rowsXml, lastColumnName, lastRowNumber, imageEntries.length > 0
  );

  const files = [
    { name: '[Content_Types].xml', bytes: encoder.encode(buildContentTypesXml(imageEntries)) },
    { name: '_rels/.rels', bytes: encoder.encode(ROOT_RELS_XML) },
    { name: 'docProps/app.xml', bytes: encoder.encode(APP_XML) },
    { name: 'docProps/core.xml', bytes: encoder.encode(buildCoreXml(payload.generatedAt)) },
    { name: 'xl/workbook.xml', bytes: encoder.encode(WORKBOOK_XML) },
    { name: 'xl/_rels/workbook.xml.rels', bytes: encoder.encode(WORKBOOK_RELS_XML) },
    { name: 'xl/styles.xml', bytes: encoder.encode(STYLES_XML) },
    { name: 'xl/worksheets/sheet1.xml', bytes: encoder.encode(worksheetXml) }
  ];

  if (imageEntries.length > 0) {
    files.push(
      { name: 'xl/worksheets/_rels/sheet1.xml.rels', bytes: encoder.encode(SHEET_RELS_XML) },
      { name: 'xl/drawings/drawing1.xml', bytes: encoder.encode(buildDrawingXml(imageEntries)) },
      { name: 'xl/drawings/_rels/drawing1.xml.rels', bytes: encoder.encode(buildDrawingRelsXml(imageEntries)) }
    );
    imageEntries.forEach((entry) => {
      files.push({ name: `xl/media/${entry.name}`, bytes: entry.bytes });
    });
  }

  return new Blob(
    [createStoredZip(files)],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  );
}
