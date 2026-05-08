import { state } from '../state.js';
import { t } from '../core/i18n.js';
import { notifyPhotosChanged } from '../core/utils.js';
import { dbDeletePhoto, dbGetPhoto } from '../storage/photoDb.js';

const TRANSPARENT_GIF_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const normalizeProjectName = (value) => String(value || '').trim();

export const getActiveProjectName = () => normalizeProjectName(state.settings.projectName);

export function getGalleryPhotos() {
  const activeProject = getActiveProjectName();
  if (!activeProject) return state.photos;
  return state.photos.filter((photo) => normalizeProjectName(photo.projectName) === activeProject);
}

export function getProjectPhotoCount(projectName) {
  const target = normalizeProjectName(projectName);
  if (!target) return 0;
  return state.photos.filter((photo) => normalizeProjectName(photo.projectName) === target).length;
}

export function updateGalleryUI(dom) {
  const activeProject = getActiveProjectName();
  const count = getGalleryPhotos().length;
  if (dom?.galleryCountEl) dom.galleryCountEl.textContent = String(count);
  if (dom?.galleryTitleText) {
    dom.galleryTitleText.textContent = activeProject ? `🗂️ ${activeProject}` : '📷 Gallery';
  }

  if (dom?.photoCountEl) {
    if (count > 0) {
      dom.photoCountEl.style.display = 'flex';
      dom.photoCountEl.textContent = String(count);
    } else {
      dom.photoCountEl.style.display = 'none';
      dom.photoCountEl.textContent = '0';
    }
  }
}

function getSelectAllLabel(allSelected) {
  const isArabic = state.currentLang === 'ar';
  if (allSelected) return isArabic ? 'إلغاء تحديد الكل' : 'Unselect All';
  return isArabic ? 'تحديد الكل' : 'Select All';
}

export function updateSelectAllButton(dom) {
  if (!dom?.selectAllBtn) return;
  if (!state.isSelectMode) {
    dom.selectAllBtn.textContent = state.currentLang === 'ar' ? 'تحديد الكل' : 'Select All';
    return;
  }

  const allIds = getGalleryPhotos().map((p) => p.id);
  const isAllSelected = allIds.length > 0 && allIds.every((id) => state.selectedPhotos.has(id));
  dom.selectAllBtn.textContent = getSelectAllLabel(isAllSelected);
}

export function revokeAllPhotoObjectUrls() {
  for (const url of state.photoObjectUrls.values()) {
    try { URL.revokeObjectURL(url); } catch {}
  }
  state.photoObjectUrls.clear();
}

export function createGalleryObserver(dom) {
  return new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        const photoId = Number(img.dataset.photoId);
        observer.unobserve(img);

        (async () => {
          try {
            if (state.photoObjectUrls.has(photoId)) {
              img.src = state.photoObjectUrls.get(photoId);
              img.classList.add('loaded');
              return;
            }

            const record = await dbGetPhoto(photoId);
            if (!record?.blob) return;

            const url = URL.createObjectURL(record.blob);
            state.photoObjectUrls.set(photoId, url);
            img.src = url;
            img.classList.add('loaded');
          } catch (e) {
            console.warn('thumbnail load failed', e);
          }
        })();
      });
    },
    { root: dom?.galleryGrid || null, rootMargin: '200px', threshold: 0.1 }
  );
}

function renderEmptyState(galleryGrid, activeProject) {
  const emptyMessage = activeProject
    ? state.currentLang === 'ar'
      ? `لا توجد صور في مشروع ${activeProject} بعد.`
      : `No photos in ${activeProject} yet.`
    : t('noPhotos');
  galleryGrid.innerHTML = `<div class="empty-gallery-state">${emptyMessage}</div>`;
}

function makeItemClickHandler(photo, dom, env, item, checkbox) {
  return async () => {
    if (state.isSelectMode) {
      const next = !state.selectedPhotos.has(photo.id);
      if (next) state.selectedPhotos.add(photo.id);
      else state.selectedPhotos.delete(photo.id);
      item.classList.toggle('selected', next);
      checkbox.checked = next;
      updateSelectAllButton(dom);
      try {
        const { updateComparisonButton } = await import('../features/comparison.js');
        updateComparisonButton();
      } catch {
        // Module not loaded yet — comparison button will sync on next render.
      }
      return;
    }

    const { openPhotoViewer } = await import('./viewer.js');
    openPhotoViewer(photo.id, dom, env);
  };
}

function buildGalleryItem(photo, dom, env, galleryObserver) {
  const item = document.createElement('div');
  item.className = 'gallery-item';
  item.dataset.photoId = String(photo.id);

  if (state.isSelectMode) {
    item.classList.add('select-mode');
    if (state.selectedPhotos.has(photo.id)) item.classList.add('selected');
  }

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'gallery-item-checkbox';
  checkbox.checked = state.selectedPhotos.has(photo.id);

  const img = document.createElement('img');
  img.alt = 'Survey photo';
  img.dataset.photoId = String(photo.id);
  img.src = TRANSPARENT_GIF_PLACEHOLDER;
  galleryObserver?.observe(img);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'gallery-item-delete';
  deleteBtn.textContent = '×';
  deleteBtn.type = 'button';
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    if (state.isSelectMode) return;
    deletePhoto(photo.id, dom, env, galleryObserver);
  };

  item.onclick = makeItemClickHandler(photo, dom, env, item, checkbox);

  item.appendChild(checkbox);
  item.appendChild(img);
  if (!state.isSelectMode) item.appendChild(deleteBtn);
  return item;
}

export function renderGallery(dom, galleryObserver, env = {}) {
  if (!dom?.galleryGrid) return;
  dom.galleryGrid.innerHTML = '';
  updateGalleryUI(dom);

  const visiblePhotos = getGalleryPhotos();
  const activeProject = getActiveProjectName();

  if (visiblePhotos.length === 0) {
    if (dom?.selectModeBtn) dom.selectModeBtn.style.display = 'none';
    renderEmptyState(dom.galleryGrid, activeProject);
    return;
  }

  const fragment = document.createDocumentFragment();
  const reversed = visiblePhotos.slice().reverse();
  for (const photo of reversed) {
    fragment.appendChild(buildGalleryItem(photo, dom, env, galleryObserver));
  }

  dom.galleryGrid.appendChild(fragment);
}

export function enterSelectMode(dom) {
  state.isSelectMode = true;
  state.selectedPhotos.clear();
  if (dom?.galleryActionsDiv) dom.galleryActionsDiv.style.display = 'flex';
  if (dom?.selectModeBtn) dom.selectModeBtn.style.display = 'none';
  document.querySelectorAll('.gallery-item').forEach((el) => el.classList.add('select-mode'));
  updateSelectAllButton(dom);
}

export function exitSelectMode(dom) {
  state.isSelectMode = false;
  state.selectedPhotos.clear();
  if (dom?.galleryActionsDiv) dom.galleryActionsDiv.style.display = 'none';
  if (getGalleryPhotos().length > 0 && dom?.selectModeBtn) dom.selectModeBtn.style.display = 'block';
  document.querySelectorAll('.gallery-item').forEach((el) => el.classList.remove('select-mode', 'selected'));
  updateSelectAllButton(dom);
}

/**
 * Removes one photo's metadata + cached object URL from `state`.
 * Lives here (instead of bulk-actions.js) so render.js → bulk-actions.js
 * doesn't form an import cycle: render.js owns single-item ops, bulk-actions.js
 * imports from render.js for the multi-item flows.
 */
export function dropFromState(numericId) {
  state.photos = state.photos.filter((p) => p.id !== numericId);
  if (state.lastCapturedPhotoId === numericId) state.lastCapturedPhotoId = null;
  const url = state.photoObjectUrls.get(numericId);
  if (url) {
    URL.revokeObjectURL(url);
    state.photoObjectUrls.delete(numericId);
  }
}

export async function deletePhoto(id, dom, { showStatus } = {}, galleryObserver) {
  if (!confirm(t('deleteThisPhoto'))) return;

  try {
    const numericId = typeof id === 'number' ? id : Number(id);
    if (!Number.isFinite(numericId)) throw new Error('Invalid id');
    await dbDeletePhoto(numericId);
    dropFromState(numericId);

    notifyPhotosChanged();
    updateGalleryUI(dom);
    renderGallery(dom, galleryObserver, { showStatus });
    showStatus?.(state.currentLang === 'ar' ? '✓ تم حذف الصورة' : '✓ Photo deleted', 1500);
  } catch (e) {
    console.error('deletePhoto failed', e);
    showStatus?.('❌ Delete failed', 2000);
  }
}
