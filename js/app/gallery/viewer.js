import { state } from '../state.js';
import { t } from '../core/i18n.js';
import { dbGetPhoto, dbPutPhoto } from '../storage/photoDb.js';
import { verifyPhotoCode } from '../features/photocode.js';

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
    updateNavButtons(dom);
    dom?.closePhotoViewerBtn?.focus?.();
  } catch (e) {
    console.error('openPhotoViewer failed', e);
    showStatus?.(t('couldNotOpenPhoto'), 2500);
  }
}

/**
 * Recomputes the photo code from the saved metadata and compares it to the
 * stamp written at capture time. Surfaces a status toast with the verdict.
 * Used by the viewer's "Verify Code" action.
 */
export async function verifyViewedPhotoCode(photoId, { showStatus } = {}) {
  const record = await dbGetPhoto(photoId);
  if (!record) {
    showStatus?.(t('photoMissing'), 2500);
    return;
  }
  const result = await verifyPhotoCode(record);
  switch (result.status) {
    case 'match':
      showStatus?.(t('codeVerified'), 3000);
      return;
    case 'mismatch':
      // Stay on screen longer so the user can read both codes.
      showStatus?.(`${t('codeMismatch')}  (${result.actual} ≠ ${result.expected})`, 6000);
      return;
    case 'no-code':
      showStatus?.(t('codeMissing'), 3000);
      return;
    default:
      showStatus?.(t('codeVerifyError'), 3000);
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


function updateNavButtons(dom) {
  if (!dom?.viewerPrevBtn || !dom?.viewerNextBtn) return;
  if (!state.photos || state.photos.length <= 1) {
    dom.viewerPrevBtn.disabled = true;
    dom.viewerNextBtn.disabled = true;
    dom.viewerPrevBtn.style.display = 'none';
    dom.viewerNextBtn.style.display = 'none';
    return;
  }
  const currentIndex = state.photos.findIndex(p => p.id === state.viewedPhotoId);
  dom.viewerPrevBtn.style.display = 'flex';
  dom.viewerNextBtn.style.display = 'flex';
  dom.viewerPrevBtn.disabled = currentIndex <= 0;
  dom.viewerNextBtn.disabled = currentIndex >= state.photos.length - 1;
}

export async function navigatePhoto(direction, dom, env) {
  if (!state.viewedPhotoId || !state.photos || state.photos.length === 0) return;
  const currentIndex = state.photos.findIndex(p => p.id === state.viewedPhotoId);
  if (currentIndex === -1) return;
  const newIndex = currentIndex + direction;
  if (newIndex >= 0 && newIndex < state.photos.length) {
    await openPhotoViewer(state.photos[newIndex].id, dom, env);
  }
}
