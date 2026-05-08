import { state } from '../state.js';
import { sleep, downloadBlob, shareBlob, buildPhotoShareData, notifyPhotosChanged } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { dbDeletePhoto, dbGetPhoto } from '../storage/photoDb.js';
import { dropFromState, exitSelectMode, renderGallery, updateGalleryUI } from './render.js';

const DOWNLOAD_GAP_MS = 250;

export function getPhotoFilename(photoMeta) {
  const iso = String(photoMeta.timestamp || new Date().toISOString()).replace(/[:.]/g, '-');
  const projectPrefix = photoMeta.projectName
    ? String(photoMeta.projectName).replace(/\s+/g, '_') + '_'
    : '';
  return `${projectPrefix}Survey_${iso}.jpg`;
}

function findPhotoMeta(id) {
  return state.photos.find((p) => p.id === id) || { id, timestamp: new Date().toISOString() };
}

async function collectShareableFiles() {
  const files = [];
  const shareBlocks = [];
  let firstUrl = '';
  const detailPrefix = `${t('shareText')}\n\n`;

  for (const id of state.selectedPhotos) {
    const record = await dbGetPhoto(id);
    if (!record?.blob) continue;
    const meta = findPhotoMeta(id);
    const filename = getPhotoFilename(meta);
    files.push(new File([record.blob], filename, { type: record.blob.type || 'image/jpeg' }));

    const { text, url } = buildPhotoShareData(meta, { t });
    const detailBlock = text.startsWith(detailPrefix) ? text.slice(detailPrefix.length).trim() : '';
    if (detailBlock) shareBlocks.push(detailBlock);
    if (!firstUrl && url) firstUrl = url;
  }

  return { files, shareBlocks, firstUrl };
}

export async function shareSelectedPhotos(dom, { showStatus } = {}) {
  const { files, shareBlocks, firstUrl } = await collectShareableFiles();

  if (files.length === 0) return showStatus?.('❌ No valid photos', 2500);
  if (!navigator.share) return showStatus?.('❌ Sharing not supported. Use Save.', 3000);
  if (navigator.canShare && !navigator.canShare({ files })) {
    return showStatus?.('❌ Sharing not available. Use Save.', 3000);
  }

  try {
    const shareText = shareBlocks.length > 0
      ? `${t('shareText')}\n\n${shareBlocks.join('\n\n')}`
      : t('shareText');
    await navigator.share({ files, title: `${files.length} photo(s)`, text: shareText, url: firstUrl });
    showStatus?.('✓ Shared', 2000);
    exitSelectMode(dom);
  } catch (e) {
    if (e?.name !== 'AbortError') console.warn('shareSelectedPhotos failed', e);
  }
}

export async function downloadSelectedPhotos(dom, { showStatus } = {}) {
  for (const id of state.selectedPhotos) {
    const record = await dbGetPhoto(id);
    if (!record?.blob) continue;
    const meta = findPhotoMeta(id);
    downloadBlob(record.blob, getPhotoFilename(meta), { showStatus });
    await sleep(DOWNLOAD_GAP_MS);
  }
  const isArabic = state.currentLang === 'ar';
  showStatus?.(
    isArabic ? `✓ تم حفظ ${state.selectedPhotos.size} صورة` : `✓ Saved ${state.selectedPhotos.size} photo(s)`,
    2000
  );
  exitSelectMode(dom);
}

export async function deleteSelectedPhotos(dom, { showStatus } = {}, galleryObserver) {
  if (state.selectedPhotos.size === 0) return;
  const isArabic = state.currentLang === 'ar';
  const prompt = isArabic
    ? `حذف ${state.selectedPhotos.size} صورة؟`
    : `Delete ${state.selectedPhotos.size} photo(s)?`;
  if (!confirm(prompt)) return;

  const ids = Array.from(state.selectedPhotos);
  let deleted = 0;
  for (const id of ids) {
    try {
      const numericId = typeof id === 'number' ? id : Number(id);
      if (!Number.isFinite(numericId)) continue;
      await dbDeletePhoto(numericId);
      dropFromState(numericId);
      deleted++;
    } catch (e) {
      console.warn('deleteSelected failed', id, e);
    }
  }

  if (deleted > 0) notifyPhotosChanged();
  updateGalleryUI(dom);
  renderGallery(dom, galleryObserver, { showStatus });
  exitSelectMode(dom);
  showStatus?.(deleted > 0 ? `✓ Deleted ${deleted} photo(s)` : '❌ Delete failed', 2500);
}

export async function shareLastCapturedPhoto({ showStatus } = {}) {
  try {
    const record = await dbGetPhoto(state.lastCapturedPhotoId);
    if (!record?.blob) {
      state.lastCapturedPhotoId = null;
      showStatus?.(t('photoMissing'), 2500);
      return;
    }

    const meta = state.photos.find((p) => p.id === state.lastCapturedPhotoId) || {
      id: state.lastCapturedPhotoId,
      timestamp: new Date().toISOString(),
      projectName: state.settings.projectName
    };
    const filename = getPhotoFilename(meta);

    const shared = await shareBlob(record.blob, filename, { t, photoMeta: meta });
    if (shared) {
      showStatus?.('✓ Shared', 2000);
    } else {
      downloadBlob(record.blob, filename, { showStatus });
      showStatus?.('✓ Saved', 2000);
    }
  } catch (e) {
    console.warn('shareLastCapturedPhoto failed', e);
    showStatus?.('❌ Share failed', 2500);
  }
}
