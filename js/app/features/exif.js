import { APP_VERSION } from '../../version.js';
import { hasGpsCoordinates } from '../core/utils.js';

/**
 * EXIF geotag embedding.
 *
 * Canvas-produced JPEGs carry no EXIF, so downloaded/shared photos lose their
 * GPS fix the moment they leave the app. This module builds a minimal,
 * spec-compliant EXIF APP1 segment (TIFF big-endian) with capture time, GPS
 * coordinates, altitude and compass heading, and splices it into the JPEG
 * right after the SOI marker — no external library needed.
 *
 * The embedded values are taken from the same metadata object that feeds the
 * photo-code hash, so EXIF, watermark and IndexedDB always agree.
 */

// TIFF field types and their byte widths.
const TYPE_BYTE = 1;
const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;
const TYPE_SIZES = { [TYPE_BYTE]: 1, [TYPE_ASCII]: 1, [TYPE_SHORT]: 2, [TYPE_LONG]: 4, [TYPE_RATIONAL]: 8 };

// 0th IFD tags
const TAG_MAKE = 0x010F;
const TAG_SOFTWARE = 0x0131;
const TAG_DATETIME = 0x0132;
const TAG_ORIENTATION = 0x0112;
const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_GPS_IFD_POINTER = 0x8825;

// Exif IFD tags
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;

// GPS IFD tags
const TAG_GPS_VERSION_ID = 0x0000;
const TAG_GPS_LATITUDE_REF = 0x0001;
const TAG_GPS_LATITUDE = 0x0002;
const TAG_GPS_LONGITUDE_REF = 0x0003;
const TAG_GPS_LONGITUDE = 0x0004;
const TAG_GPS_ALTITUDE_REF = 0x0005;
const TAG_GPS_ALTITUDE = 0x0006;
const TAG_GPS_TIMESTAMP = 0x0007;
const TAG_GPS_IMG_DIRECTION_REF = 0x0010;
const TAG_GPS_IMG_DIRECTION = 0x0011;
const TAG_GPS_DATESTAMP = 0x001D;

const JPEG_SOI = 0xFFD8;
const APP1_MARKER = 0xFFE1;
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

const pad2 = (n) => String(n).padStart(2, '0');

// "YYYY:MM:DD HH:MM:SS" in local time, per the EXIF DateTime convention.
function exifDateTime(date) {
  return `${date.getFullYear()}:${pad2(date.getMonth() + 1)}:${pad2(date.getDate())} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

// Degrees → [deg, min, sec] rationals; seconds keep 4 decimal places (~3mm).
function degreesToDmsRationals(degrees) {
  const abs = Math.abs(degrees);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 10000);
  return [[deg, 1], [min, 1], [sec, 10000]];
}

/**
 * One image file directory. Entries hold raw JS values; `byteLength`/`writeTo`
 * handle the inline-vs-offset encoding rules (values wider than 4 bytes are
 * stored after the entry table and referenced by offset).
 */
class IfdBuilder {
  constructor() {
    this.entries = [];
  }

  ascii(tag, text) {
    const bytes = [];
    for (let i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i) & 0x7F);
    bytes.push(0); // NUL terminator required by the spec
    this.entries.push({ tag, type: TYPE_ASCII, count: bytes.length, values: bytes });
  }

  bytes(tag, values) {
    this.entries.push({ tag, type: TYPE_BYTE, count: values.length, values });
  }

  short(tag, value) {
    this.entries.push({ tag, type: TYPE_SHORT, count: 1, values: [value] });
  }

  long(tag, value) {
    this.entries.push({ tag, type: TYPE_LONG, count: 1, values: [value] });
  }

  // values: array of [numerator, denominator] pairs
  rationals(tag, values) {
    this.entries.push({ tag, type: TYPE_RATIONAL, count: values.length, values });
  }

  setLong(tag, value) {
    const entry = this.entries.find((e) => e.tag === tag);
    if (entry) entry.values = [value];
  }

  // Total serialized size: count + entry table + next-IFD pointer + overflow data.
  byteLength() {
    let size = 2 + this.entries.length * 12 + 4;
    for (const e of this.entries) {
      const dataLen = TYPE_SIZES[e.type] * e.count;
      if (dataLen > 4) size += dataLen + (dataLen % 2); // keep word alignment
    }
    return size;
  }

  writeTo(view, ifdOffset) {
    const sorted = [...this.entries].sort((a, b) => a.tag - b.tag);
    let entryPtr = ifdOffset + 2;
    let dataPtr = ifdOffset + 2 + sorted.length * 12 + 4;

    view.setUint16(ifdOffset, sorted.length);

    for (const e of sorted) {
      view.setUint16(entryPtr, e.tag);
      view.setUint16(entryPtr + 2, e.type);
      view.setUint32(entryPtr + 4, e.count);

      const dataLen = TYPE_SIZES[e.type] * e.count;
      const writeAt = dataLen > 4 ? dataPtr : entryPtr + 8;
      if (dataLen > 4) view.setUint32(entryPtr + 8, dataPtr);
      else view.setUint32(entryPtr + 8, 0); // zero-fill before writing inline value

      let p = writeAt;
      for (const v of e.values) {
        switch (e.type) {
          case TYPE_BYTE:
          case TYPE_ASCII:
            view.setUint8(p, v);
            p += 1;
            break;
          case TYPE_SHORT:
            view.setUint16(p, v);
            p += 2;
            break;
          case TYPE_LONG:
            view.setUint32(p, v);
            p += 4;
            break;
          case TYPE_RATIONAL:
            view.setUint32(p, v[0]);
            view.setUint32(p + 4, v[1]);
            p += 8;
            break;
        }
      }

      if (dataLen > 4) dataPtr += dataLen + (dataLen % 2);
      entryPtr += 12;
    }

    view.setUint32(entryPtr, 0); // next-IFD pointer: none
  }
}

function buildGpsIfd(meta, capturedAt) {
  const gps = new IfdBuilder();
  const lat = Number(meta.lat);
  const lon = Number(meta.lon);

  gps.bytes(TAG_GPS_VERSION_ID, [2, 3, 0, 0]);
  gps.ascii(TAG_GPS_LATITUDE_REF, lat >= 0 ? 'N' : 'S');
  gps.rationals(TAG_GPS_LATITUDE, degreesToDmsRationals(lat));
  gps.ascii(TAG_GPS_LONGITUDE_REF, lon >= 0 ? 'E' : 'W');
  gps.rationals(TAG_GPS_LONGITUDE, degreesToDmsRationals(lon));

  const alt = Number(meta.alt);
  if (Number.isFinite(alt) && alt !== 0) {
    gps.bytes(TAG_GPS_ALTITUDE_REF, [alt < 0 ? 1 : 0]);
    gps.rationals(TAG_GPS_ALTITUDE, [[Math.round(Math.abs(alt) * 100), 100]]);
  }

  const heading = Number(meta.heading);
  if (Number.isFinite(heading) && heading > 0) {
    gps.ascii(TAG_GPS_IMG_DIRECTION_REF, 'T'); // true north
    gps.rationals(TAG_GPS_IMG_DIRECTION, [[Math.round((heading % 360) * 100), 100]]);
  }

  // GPS time/date stamps are UTC by definition.
  gps.rationals(TAG_GPS_TIMESTAMP, [
    [capturedAt.getUTCHours(), 1],
    [capturedAt.getUTCMinutes(), 1],
    [capturedAt.getUTCSeconds(), 1]
  ]);
  gps.ascii(
    TAG_GPS_DATESTAMP,
    `${capturedAt.getUTCFullYear()}:${pad2(capturedAt.getUTCMonth() + 1)}:${pad2(capturedAt.getUTCDate())}`
  );

  return gps;
}

/**
 * Builds the complete EXIF APP1 payload (TIFF structure, big-endian).
 */
function buildExifSegment(meta) {
  const capturedAt = meta?.timestamp ? new Date(meta.timestamp) : new Date();
  const dateTimeStr = exifDateTime(Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt);

  const zeroth = new IfdBuilder();
  zeroth.ascii(TAG_MAKE, 'Lens Light');
  zeroth.short(TAG_ORIENTATION, 1);
  zeroth.ascii(TAG_SOFTWARE, `Lens Light v${APP_VERSION}`);
  zeroth.ascii(TAG_DATETIME, dateTimeStr);
  zeroth.long(TAG_EXIF_IFD_POINTER, 0); // patched below

  const exifIfd = new IfdBuilder();
  exifIfd.ascii(TAG_DATETIME_ORIGINAL, dateTimeStr);
  exifIfd.ascii(TAG_DATETIME_DIGITIZED, dateTimeStr);

  const gpsIfd = hasGpsCoordinates(meta?.lat, meta?.lon) ? buildGpsIfd(meta, capturedAt) : null;
  if (gpsIfd) zeroth.long(TAG_GPS_IFD_POINTER, 0); // patched below

  // IFD sizes only depend on entry shapes, so offsets can be resolved now.
  const zerothOffset = 8; // right after the TIFF header
  const exifOffset = zerothOffset + zeroth.byteLength();
  const gpsOffset = exifOffset + exifIfd.byteLength();
  zeroth.setLong(TAG_EXIF_IFD_POINTER, exifOffset);
  if (gpsIfd) zeroth.setLong(TAG_GPS_IFD_POINTER, gpsOffset);

  const tiffLength = gpsIfd ? gpsOffset + gpsIfd.byteLength() : gpsOffset;
  const buffer = new ArrayBuffer(tiffLength);
  const view = new DataView(buffer);

  // TIFF header: big-endian ("MM"), magic 42, first IFD at offset 8.
  view.setUint16(0, 0x4D4D);
  view.setUint16(2, 0x002A);
  view.setUint32(4, 8);

  zeroth.writeTo(view, zerothOffset);
  exifIfd.writeTo(view, exifOffset);
  if (gpsIfd) gpsIfd.writeTo(view, gpsOffset);

  return new Uint8Array(buffer);
}

/**
 * Returns a new JPEG blob with the EXIF APP1 segment inserted after SOI.
 * Falls back to the original blob for non-JPEG input or if one is already
 * present (re-encoding paths should never double-stamp).
 */
export async function embedPhotoExif(blob, meta) {
  if (!blob || !/jpe?g/i.test(blob.type || '')) return blob;

  const original = new Uint8Array(await blob.arrayBuffer());
  if (original.length < 4 || ((original[0] << 8) | original[1]) !== JPEG_SOI) return blob;
  if (original[2] === 0xFF && original[3] === 0xE1) return blob; // already has APP1

  const tiff = buildExifSegment(meta);
  const segmentLength = EXIF_HEADER.length + tiff.length + 2; // +2 for the length field itself

  const out = new Uint8Array(original.length + 4 + EXIF_HEADER.length + tiff.length);
  let p = 0;
  out[p++] = 0xFF;
  out[p++] = 0xD8;
  out[p++] = (APP1_MARKER >> 8) & 0xFF;
  out[p++] = APP1_MARKER & 0xFF;
  out[p++] = (segmentLength >> 8) & 0xFF;
  out[p++] = segmentLength & 0xFF;
  out.set(EXIF_HEADER, p);
  p += EXIF_HEADER.length;
  out.set(tiff, p);
  p += tiff.length;
  out.set(original.subarray(2), p);

  return new Blob([out], { type: 'image/jpeg' });
}
