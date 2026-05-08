import { state } from '../state.js';
import { t } from '../core/i18n.js';
import { dbGetPhoto, dbPutPhoto } from '../storage/photoDb.js';

function setCommentDisplay(commentEl, text) {
  if (!commentEl) return;
  const trimmed = String(text || '').trim();
  if (trimmed) {
    commentEl.textContent = trimmed;
    commentEl.style.display = 'block';
  } else {
    commentEl.textContent = '';
    commentEl.style.display = 'none';
  }
}

function clearViewedObjectUrl() {
  if (!state.viewedPhotoUrl) return;
  try { URL.revokeObjectURL(state.viewedPhotoUrl); } catch {}
  state.viewedPhotoUrl = null;
}

export function closePhotoViewer(dom) {
  if (dom?.photoViewer) {
    dom.photoViewer.classList.remove('open');
    dom.photoViewer.setAttribute('aria-hidden', 'true');
  }
  state.viewedPhotoId = null;
  clearViewedObjectUrl();
  if (dom?.photoViewerImg) dom.photoViewerImg.removeAttribute('src');
  if (dom?.photoViewerBgImg) dom.photoViewerBgImg.removeAttribute('src');
  setCommentDisplay(dom?.photoViewerComment, '');
  // Return focus to the gallery dialog if present.
  dom?.closeGalleryBtn?.focus?.();
}

export async function openPhotoViewer(photoId, dom, { showStatus } = {}) {
  try {
    const record = await dbGetPhoto(photoId);
    if (!record?.blob) {
      showStatus?.(t('photoMissing'), 2500);
      return;
    }

    clearViewedObjectUrl();
    state.viewedPhotoId = photoId;
    state.viewedPhotoUrl = URL.createObjectURL(record.blob);
    if (dom?.photoViewerImg) dom.photoViewerImg.src = state.viewedPhotoUrl;
    if (dom?.photoViewerBgImg) dom.photoViewerBgImg.src = state.viewedPhotoUrl;
    setCommentDisplay(dom?.photoViewerComment, record.comment);

    if (dom?.photoViewer) {
      dom.photoViewer.classList.add('open');
      dom.photoViewer.setAttribute('aria-hidden', 'false');
    }
    dom?.closePhotoViewerBtn?.focus?.();
  } catch (e) {
    console.error('openPhotoViewer failed', e);
    showStatus?.(t('couldNotOpenPhoto'), 2500);
  }
}

export async function updatePhotoComment(photoId, dom, { showStatus } = {}) {
  const record = await dbGetPhoto(photoId);
  if (!record) return showStatus?.(t('photoMissing'), 2500);

  const existing = String(record.comment || '').trim();
  const next = prompt(t('commentPrompt'), existing);
  if (next === null) return;

  record.comment = String(next).trim();
  await dbPutPhoto(record);

  const idx = state.photos.findIndex((p) => p.id === photoId);
  if (idx >= 0) state.photos[idx].comment = record.comment;

  setCommentDisplay(dom?.photoViewerComment, record.comment);
  showStatus?.(t('commentSaved'), 1500);
}
