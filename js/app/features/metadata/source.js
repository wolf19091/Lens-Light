import { state } from '../../state.js';
import { getGalleryPhotos, getPhotoFilename } from '../../gallery/gallery.js';
import { dbGetPhoto } from '../../storage/photoDb.js';
import { createShortAddress } from '../../core/utils.js';
import { normalizeText } from './format.js';

const FALLBACK_DIMS = { width: 4, height: 3 };

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

export async function hydrateExportImages(items, includeImages) {
  if (!includeImages) {
    return items.map((item) => ({
      ...item,
      exportImageSrc: '',
      imageWidth: FALLBACK_DIMS.width,
      imageHeight: FALLBACK_DIMS.height
    }));
  }

  return Promise.all(items.map(async (item) => {
    const src = await blobToDataUrl(item.blob);
    let width = FALLBACK_DIMS.width;
    let height = FALLBACK_DIMS.height;
    if (src) {
      try {
        const dims = await measureImageSource(src);
        width = dims.width || FALLBACK_DIMS.width;
        height = dims.height || FALLBACK_DIMS.height;
      } catch (e) {}
    }
    return { ...item, exportImageSrc: src, imageWidth: width, imageHeight: height };
  }));
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
