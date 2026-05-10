import { state } from '../state.js';
import { t } from '../core/i18n.js';
import { isTouchPrimaryInput } from '../core/utils.js';
import {
  closePhotoViewer,
  deleteSelectedPhotos,
  downloadSelectedPhotos,
  enterSelectMode,
  exitSelectMode,
  getGalleryPhotos,
  getPhotoFilename,
  renderGallery,
  revokeAllPhotoObjectUrls,
  shareLastCapturedPhoto,
  shareSelectedPhotos,
  updatePhotoComment,
  updateSelectAllButton
} from '../gallery/gallery.js';
import { dbGetPhoto } from '../storage/photoDb.js';
import { updateComparisonButton } from '../features/comparison.js';

function openGalleryModal(dom, env) {
  const { showStatus, galleryObserver } = env;
  dom.galleryModal?.classList.add('open');
  dom.galleryModal?.setAttribute('aria-hidden', 'false');
  renderGallery(dom, galleryObserver, { showStatus });
  if (getGalleryPhotos().length > 0 && dom.selectModeBtn) dom.selectModeBtn.classList.remove('is-hidden');
  if (!isTouchPrimaryInput()) dom.closeGalleryBtn?.focus?.();
}

function bindGalleryModal(dom, env) {
  dom.galleryBtn?.addEventListener('click', () => openGalleryModal(dom, env));

  dom.closeGalleryBtn?.addEventListener('click', () => {
    exitSelectMode(dom);
    closePhotoViewer(dom);
    revokeAllPhotoObjectUrls();
    dom.galleryModal?.classList.remove('open');
    if (!isTouchPrimaryInput()) dom.galleryBtn?.focus?.();
    dom.galleryModal?.setAttribute('aria-hidden', 'true');
  });
}

function bindSelectionControls(dom, env) {
  const { showStatus, galleryObserver } = env;

  dom.selectModeBtn?.addEventListener('click', () => {
    enterSelectMode(dom);
    renderGallery(dom, galleryObserver, { showStatus });
  });

  dom.cancelSelectBtn?.addEventListener('click', () => {
    exitSelectMode(dom);
    renderGallery(dom, galleryObserver, { showStatus });
  });

  dom.selectAllBtn?.addEventListener('click', () => {
    if (!state.isSelectMode) return;
    const allIds = getGalleryPhotos().map((p) => p.id);
    const isAllSelected = allIds.length > 0 && allIds.every((id) => state.selectedPhotos.has(id));
    state.selectedPhotos = isAllSelected ? new Set() : new Set(allIds);

    document.querySelectorAll('.gallery-item').forEach((item) => {
      const id = Number(item.dataset.photoId);
      const checked = state.selectedPhotos.has(id);
      item.classList.toggle('selected', checked);
      const cb = item.querySelector('.gallery-item-checkbox');
      if (cb) cb.checked = checked;
    });

    updateSelectAllButton(dom);
    updateComparisonButton();
  });
}

function bindBulkActions(dom, env) {
  const { showStatus, galleryObserver } = env;
  const requireSelection = () => {
    if (state.selectedPhotos.size === 0) {
      showStatus('⚠️ No photos selected', 2000);
      return false;
    }
    return true;
  };

  dom.shareSelectedBtn?.addEventListener('click', () => {
    if (requireSelection()) shareSelectedPhotos(dom, { showStatus });
  });
  dom.downloadSelectedBtn?.addEventListener('click', () => {
    if (requireSelection()) downloadSelectedPhotos(dom, { showStatus });
  });
  dom.deleteSelectedBtn?.addEventListener('click', () => {
    if (requireSelection()) deleteSelectedPhotos(dom, { showStatus }, galleryObserver);
  });
}

async function getViewedPhotoMeta(viewedId) {
  return state.photos.find((p) => p.id === viewedId) || {
    id: viewedId,
    timestamp: new Date().toISOString(),
    projectName: state.settings.projectName
  };
}

function bindPhotoViewer(dom, env) {
  const { showStatus, galleryObserver } = env;

  dom.closePhotoViewerBtn?.addEventListener('click', () => closePhotoViewer(dom));

  dom.viewerShareBtn?.addEventListener('click', async () => {
    if (!state.viewedPhotoId) return;
    const record = await dbGetPhoto(state.viewedPhotoId);
    if (!record?.blob) return showStatus(t('photoMissing'), 2500);

    const meta = await getViewedPhotoMeta(state.viewedPhotoId);
    const { shareBlob, downloadBlob } = await import('../core/utils.js');
    const shared = await shareBlob(record.blob, getPhotoFilename(meta), { t, photoMeta: meta });
    if (shared) {
      showStatus('✓ Shared', 2000);
    } else {
      downloadBlob(record.blob, getPhotoFilename(meta), { showStatus });
      showStatus('✓ Saved', 2000);
    }
  });

  dom.viewerSaveBtn?.addEventListener('click', async () => {
    if (!state.viewedPhotoId) return;
    const record = await dbGetPhoto(state.viewedPhotoId);
    if (!record?.blob) return showStatus(t('photoMissing'), 2500);

    const meta = await getViewedPhotoMeta(state.viewedPhotoId);
    const { downloadBlob } = await import('../core/utils.js');
    downloadBlob(record.blob, getPhotoFilename(meta), { showStatus });
    showStatus('✓ Saved', 1500);
  });

  dom.viewerCommentBtn?.addEventListener('click', async () => {
    if (!state.viewedPhotoId) return;
    await updatePhotoComment(state.viewedPhotoId, dom, { showStatus });
  });

  dom.viewerDeleteBtn?.addEventListener('click', async () => {
    if (!state.viewedPhotoId) return;
    if (!confirm(t('deleteThisPhoto'))) return;
    const id = state.viewedPhotoId;
    closePhotoViewer(dom);
    const { deletePhoto } = await import('../gallery/gallery.js');
    await deletePhoto(id, dom, { showStatus }, galleryObserver);
    renderGallery(dom, galleryObserver, { showStatus });
  });
}

function bindShareEntryPoint(dom, env) {
  const { showStatus } = env;

  dom.shareBtn?.addEventListener('click', () => {
    if (state.lastCapturedPhotoId) {
      shareLastCapturedPhoto({ showStatus });
      return;
    }

    if (state.photos.length > 0) {
      openGalleryModal(dom, env);
      const isArabic = state.currentLang === 'ar';
      const hasGalleryPhotos = getGalleryPhotos().length > 0;
      showStatus(
        hasGalleryPhotos
          ? (isArabic ? 'اختر صورة للمشاركة/الحفظ' : 'Select a photo to share/save')
          : (isArabic ? 'لا توجد صور في المشروع المفتوح بعد' : 'No photos in the open project yet'),
        2000
      );
      return;
    }

    dom.fileInput?.click();
  });

  dom.fileInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!navigator.share) {
      showStatus('❌ Sharing not supported', 3000);
      dom.fileInput.value = '';
      return;
    }

    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      showStatus('❌ Sharing not available for this file', 3000);
      dom.fileInput.value = '';
      return;
    }

    try {
      await navigator.share({ files: [file], title: t('shareTitle'), text: t('shareText') });
      showStatus('✓ Shared', 2000);
    } catch (e) {
      if (e?.name !== 'AbortError') showStatus('❌ Share failed', 3000);
    }

    dom.fileInput.value = '';
  });
}

export function bindGalleryEvents(dom, env) {
  bindGalleryModal(dom, env);
  bindSelectionControls(dom, env);
  bindBulkActions(dom, env);
  bindPhotoViewer(dom, env);
  bindShareEntryPoint(dom, env);
}
