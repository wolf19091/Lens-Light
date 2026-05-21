import { state } from '../../state.js';
import { getGalleryPhotos, getPhotoFilename } from '../../gallery/gallery.js';
import { dbGetPhoto } from '../../storage/photoDb.js';
import { createShortAddress } from '../../core/utils.js';
import { normalizeText } from './format.js';

const FALLBACK_DIMS = { width: 4, height: 3 };

// Sensible defaults: PDF needs ~1600px wide for sharp 120mm A4 prints; Excel only
// displays images up to 320px wide. Either way, sending phone-native 4000px+ JPEGs
// through the export pipeline burns hundreds of MB of base64 string memory per
// batch, which is what crashes browsers on 30+ photo exports.
const DEFAULT_EXPORT_MAX_DIMENSION = 1600;
const DEFAULT_EXPORT_QUALITY = 0.82;

export function measureImageSource(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve({ ...FALLBACK_DIMS });
      return;
    }

    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth || FALLBACK_DIMS.width,
      height: image.naturalHeight || FALLBACK_DIMS.height
    });
    image.onerror = () => resolve({ ...FALLBACK_DIMS });
    image.src = src;
  });
}

export function blobToDataUrl(blob) {
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

/**
 * Decodes `blob`, downscales it so the longest edge is at most `maxDimension`,
 * then encodes as a JPEG `data:` URL. Each step releases intermediates so the
 * caller never holds the original full-res pixels in memory after this returns.
 * Falls back to the raw blob data URL if anything goes wrong.
 */
async function downscaleBlobToDataUrl(blob, maxDimension, quality) {
  if (!blob) return { src: '', width: FALLBACK_DIMS.width, height: FALLBACK_DIMS.height };

  let objectUrl = '';
  let image = null;
  try {
    objectUrl = URL.createObjectURL(blob);
    image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = objectUrl;
    });

    const naturalWidth = image.naturalWidth || FALLBACK_DIMS.width;
    const naturalHeight = image.naturalHeight || FALLBACK_DIMS.height;
    const longestEdge = Math.max(naturalWidth, naturalHeight);
    const scale = longestEdge > maxDimension ? maxDimension / longestEdge : 1;
    const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const src = canvas.toDataURL('image/jpeg', quality);
    // Drop the canvas pixel buffer ASAP — keeping it alive across the next
    // hydration iteration is what causes the heap to balloon.
    canvas.width = 0;
    canvas.height = 0;

    return { src, width: targetWidth, height: targetHeight };
  } catch (err) {
    // Last-resort fallback: ship the original bytes so the export still produces
    // *something* rather than an empty image cell.
    const src = await blobToDataUrl(blob);
    return { src, width: FALLBACK_DIMS.width, height: FALLBACK_DIMS.height };
  } finally {
    if (image) {
      image.onload = null;
      image.onerror = null;
      image.src = '';
    }
    if (objectUrl) {
      try { URL.revokeObjectURL(objectUrl); } catch {}
    }
  }
}

/**
 * Resolves which photos feed the export, in priority order:
 *   1. Explicit `ids` (single-photo export from a record menu)
 *   2. Gallery selection
 *   3. Active project (label only — full visible gallery)
 *   4. Plain visible gallery
 */
export function getSourcePhotos(ids = null) {
  const visiblePhotos = getGalleryPhotos().slice().reverse();

  if (Array.isArray(ids) && ids.length > 0) {
    const ordered = ids
      .map((id) => state.photos.find((photo) => photo.id === id))
      .filter(Boolean);
    return { source: 'custom', sourceLabel: 'Custom export set', photos: ordered };
  }

  if (state.selectedPhotos.size > 0) {
    const selected = visiblePhotos.filter((photo) => state.selectedPhotos.has(photo.id));
    return { source: 'selected', sourceLabel: 'Selected gallery records', photos: selected };
  }

  const activeProject = String(state.settings.projectName || '').trim();
  if (activeProject) {
    return { source: 'project', sourceLabel: `Project records: ${activeProject}`, photos: visiblePhotos };
  }

  return { source: 'gallery', sourceLabel: 'Current filtered gallery results', photos: visiblePhotos };
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
    location: record?.location || photoMeta.location || '',
    shortAddress: record?.shortAddress || photoMeta.shortAddress || createShortAddress(record?.lat ?? photoMeta.lat, record?.lon ?? photoMeta.lon),
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

export function normalizeExportItems(photos) {
  return Promise.all(photos.map((photo, index) => normalizeExportItem(photo, index)));
}

/**
 * Materialises export-ready `data:` URLs for each item.
 *
 * Runs **sequentially** on purpose: parallel `Promise.all` over 30+ multi-MB
 * blobs is what used to OOM-crash the app, because every reader/canvas/data-URL
 * was live in the heap at the same time. Sequential processing keeps peak
 * memory at roughly one decoded image plus the accumulated downscaled outputs.
 *
 * @param {Object} [options]
 * @param {number} [options.maxDimension] longest edge of each downscaled image
 * @param {number} [options.quality]      JPEG quality (0..1) for the data URL
 * @param {(done:number,total:number)=>void} [options.onProgress]
 */
export async function hydrateExportImages(items, includeImages, options = {}) {
  if (!includeImages) {
    return items.map((item) => ({
      ...item,
      exportImageSrc: '',
      imageWidth: FALLBACK_DIMS.width,
      imageHeight: FALLBACK_DIMS.height
    }));
  }

  const maxDimension = Math.max(64, options.maxDimension || DEFAULT_EXPORT_MAX_DIMENSION);
  const quality = Math.min(1, Math.max(0.4, options.quality || DEFAULT_EXPORT_QUALITY));
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const total = items.length;
  const hydrated = new Array(total);

  for (let i = 0; i < total; i += 1) {
    const item = items[i];
    const { src, width, height } = await downscaleBlobToDataUrl(item.blob, maxDimension, quality);
    hydrated[i] = {
      ...item,
      exportImageSrc: src,
      imageWidth: width || FALLBACK_DIMS.width,
      imageHeight: height || FALLBACK_DIMS.height
    };
    onProgress?.(i + 1, total);
    // Yield to the event loop so the status text can paint and the browser
    // can reclaim the canvas/image we just dropped before we allocate again.
    if (i + 1 < total) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return hydrated;
}

export function revokeExportPrepUrls(items = state.exportPrep?.items || []) {
  for (const item of items) {
    if (!item?.previewUrl) continue;
    try { URL.revokeObjectURL(item.previewUrl); } catch {}
  }
}

export function resetExportPrepItems(items) {
  let selectedOrder = 0;
  state.exportPrep.items = items.map((item) => ({
    ...item,
    exportOrder: item.selected ? ++selectedOrder : null
  }));
}

export function getSelectedExportItems() {
  return state.exportPrep.items
    .filter((item) => item.selected)
    .map((item, index) => ({ ...item, exportOrder: index + 1 }));
}
