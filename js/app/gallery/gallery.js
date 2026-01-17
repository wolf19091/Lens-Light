import { state } from '../state.js';
import { sleep, downloadBlob, shareBlob } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { dbGetAllPhotosMeta, dbGetPhoto, dbDeletePhoto, dbPutPhoto, openPhotoDb, migrateLegacyLocalStoragePhotos } from '../storage/photoDb.js';

export function getPhotoFilename(photoMeta) {
  const iso = String(photoMeta.timestamp || new Date().toISOString()).replace(/[:.]/g, '-');
  const projectPrefix = photoMeta.projectName ? String(photoMeta.projectName).replace(/\s+/g, '_') + '_' : '';
  return `${projectPrefix}Survey_${iso}.jpg`;
}

export function revokeAllPhotoObjectUrls() {
  for (const url of state.photoObjectUrls.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
  state.photoObjectUrls.clear();
}

export function updateGalleryUI(dom) {
  const count = state.photos.length;
  if (dom?.galleryCountEl) dom.galleryCountEl.textContent = String(count);

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

export function updateSelectAllButton(dom) {
  if (!dom?.selectAllBtn) return;
  if (!state.isSelectMode) {
    dom.selectAllBtn.textContent = state.currentLang === 'ar' ? 'تحديد الكل' : 'Select All';
    return;
  }

  const allIds = state.photos.map((p) => p.id);
  const isAllSelected = allIds.length > 0 && allIds.every((id) => state.selectedPhotos.has(id));
  dom.selectAllBtn.textContent = isAllSelected
    ? state.currentLang === 'ar'
      ? 'إلغاء تحديد الكل'
      : 'Unselect All'
    : state.currentLang === 'ar'
      ? 'تحديد الكل'
      : 'Select All';
}

export async function loadPhotos(dom) {
  await openPhotoDb();
  await migrateLegacyLocalStoragePhotos();

  const records = await dbGetAllPhotosMeta();
  state.photos = records
    .map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      lat: r.lat,
      lon: r.lon,
      alt: r.alt,
      heading: r.heading,
      projectName: r.projectName,
      location: r.location,
      comment: r.comment || '',
      mime: r.mime || 'image/jpeg',
      filter: r.filter || 'normal'
    }))
    .sort((a, b) => (a.id > b.id ? 1 : -1));

  updateGalleryUI(dom);
}

export function closePhotoViewer(dom) {
  if (dom?.photoViewer) {
    dom.photoViewer.classList.remove('open');
    dom.photoViewer.setAttribute('aria-hidden', 'true');
  }
  state.viewedPhotoId = null;
  if (state.viewedPhotoUrl) {
    try {
      URL.revokeObjectURL(state.viewedPhotoUrl);
    } catch {}
    state.viewedPhotoUrl = null;
  }
  if (dom?.photoViewerImg) dom.photoViewerImg.removeAttribute('src');
  if (dom?.photoViewerComment) {
    dom.photoViewerComment.style.display = 'none';
    dom.photoViewerComment.textContent = '';
  }

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

    if (state.viewedPhotoUrl) {
      try {
        URL.revokeObjectURL(state.viewedPhotoUrl);
      } catch {}
      state.viewedPhotoUrl = null;
    }

    state.viewedPhotoId = photoId;
    state.viewedPhotoUrl = URL.createObjectURL(record.blob);
    if (dom?.photoViewerImg) dom.photoViewerImg.src = state.viewedPhotoUrl;

    if (dom?.photoViewerComment) {
      const comment = String(record.comment || '').trim();
      if (comment) {
        dom.photoViewerComment.textContent = comment;
        dom.photoViewerComment.style.display = 'block';
      } else {
        dom.photoViewerComment.textContent = '';
        dom.photoViewerComment.style.display = 'none';
      }
    }

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

export function renderGallery(dom, galleryObserver, { showStatus } = {}) {
  if (!dom?.galleryGrid) return;
  dom.galleryGrid.innerHTML = '';

  if (state.photos.length === 0) {
    if (dom?.selectModeBtn) dom.selectModeBtn.style.display = 'none';
    dom.galleryGrid.innerHTML = `<div class="empty-gallery-state">${t('noPhotos')}</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  const reversed = state.photos.slice().reverse();
  for (const photo of reversed) {
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
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    galleryObserver?.observe(img);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'gallery-item-delete';
    deleteBtn.textContent = '×';
    deleteBtn.type = 'button';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (!state.isSelectMode) deletePhoto(photo.id, dom, { showStatus }, galleryObserver);
    };

    item.onclick = async () => {
      if (state.isSelectMode) {
        const next = !state.selectedPhotos.has(photo.id);
        if (next) state.selectedPhotos.add(photo.id);
        else state.selectedPhotos.delete(photo.id);

        item.classList.toggle('selected', next);
        checkbox.checked = next;
        updateSelectAllButton(dom);
        
        // Update comparison button
        try {
          const { updateComparisonButton } = await import('../features/comparison.js');
          updateComparisonButton();
        } catch (e) {
          // Module not loaded yet
        }
        
        return;
      }
      openPhotoViewer(photo.id, dom, { showStatus });
    };

    item.appendChild(checkbox);
    item.appendChild(img);
    if (!state.isSelectMode) item.appendChild(deleteBtn);
    fragment.appendChild(item);
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
  if (state.photos.length > 0 && dom?.selectModeBtn) dom.selectModeBtn.style.display = 'block';
  document.querySelectorAll('.gallery-item').forEach((el) => el.classList.remove('select-mode', 'selected'));
  updateSelectAllButton(dom);
}

export async function deletePhoto(id, dom, { showStatus } = {}, galleryObserver) {
  if (!confirm(t('deleteThisPhoto'))) return;

  try {
    const numericId = typeof id === 'number' ? id : Number(id);
    if (!Number.isFinite(numericId)) throw new Error('Invalid id');
    await dbDeletePhoto(numericId);
    state.photos = state.photos.filter((p) => p.id !== numericId);

    if (state.lastCapturedPhotoId === numericId) state.lastCapturedPhotoId = null;
    const url = state.photoObjectUrls.get(numericId);
    if (url) {
      URL.revokeObjectURL(url);
      state.photoObjectUrls.delete(numericId);
    }

    updateGalleryUI(dom);
    renderGallery(dom, galleryObserver, { showStatus });
    showStatus?.(state.currentLang === 'ar' ? '✓ تم حذف الصورة' : '✓ Photo deleted', 1500);
  } catch (e) {
    console.error('deletePhoto failed', e);
    showStatus?.('❌ Delete failed', 2000);
  }
}

export async function shareSelectedPhotos(dom, { showStatus } = {}) {
  const files = [];
  const locations = [];
  
  for (const id of state.selectedPhotos) {
    const record = await dbGetPhoto(id);
    if (!record?.blob) continue;
    const meta = state.photos.find((p) => p.id === id) || { id, timestamp: new Date().toISOString() };
    const filename = getPhotoFilename(meta);
    files.push(new File([record.blob], filename, { type: record.blob.type || 'image/jpeg' }));
    
    // Collect location data
    if (meta.lat && meta.lon) {
      const { createGoogleMapsLink } = await import('../core/utils.js');
      locations.push(createGoogleMapsLink(meta.lat, meta.lon, meta.location));
    }
  }

  if (files.length === 0) {
    showStatus?.('❌ No valid photos', 2500);
    return;
  }

  if (!navigator.share) {
    showStatus?.('❌ Sharing not supported. Use Save.', 3000);
    return;
  }

  if (navigator.canShare && !navigator.canShare({ files })) {
    showStatus?.('❌ Sharing not available. Use Save.', 3000);
    return;
  }

  try {
    // Include locations in share text
    let shareText = t('shareText');
    if (locations.length > 0) {
      shareText = shareText + '\n\n' + locations.join('\n\n');
    }
    
    await navigator.share({ files, title: `${files.length} photo(s)`, text: shareText });
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
    const meta = state.photos.find((p) => p.id === id) || { id, timestamp: new Date().toISOString() };
    downloadBlob(record.blob, getPhotoFilename(meta), { showStatus });
    await sleep(250);
  }
  showStatus?.(state.currentLang === 'ar' ? `✓ تم حفظ ${state.selectedPhotos.size} صورة` : `✓ Saved ${state.selectedPhotos.size} photo(s)`, 2000);
  exitSelectMode(dom);
}

export async function deleteSelectedPhotos(dom, { showStatus } = {}, galleryObserver) {
  if (state.selectedPhotos.size === 0) return;
  if (!confirm(state.currentLang === 'ar' ? `حذف ${state.selectedPhotos.size} صورة؟` : `Delete ${state.selectedPhotos.size} photo(s)?`)) return;

  const ids = Array.from(state.selectedPhotos);
  let deleted = 0;
  for (const id of ids) {
    try {
      const numericId = typeof id === 'number' ? id : Number(id);
      if (!Number.isFinite(numericId)) continue;
      await dbDeletePhoto(numericId);
      state.photos = state.photos.filter((p) => p.id !== numericId);
      const url = state.photoObjectUrls.get(numericId);
      if (url) {
        URL.revokeObjectURL(url);
        state.photoObjectUrls.delete(numericId);
      }
      deleted++;
    } catch (e) {
      console.warn('deleteSelected failed', id, e);
    }
  }

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
    if (shared) showStatus?.('✓ Shared', 2000);
    else {
      downloadBlob(record.blob, filename, { showStatus });
      showStatus?.('✓ Saved', 2000);
    }
  } catch (e) {
    console.warn('shareLastCapturedPhoto failed', e);
    showStatus?.('❌ Share failed', 2500);
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

  if (dom?.photoViewerComment) {
    if (record.comment) {
      dom.photoViewerComment.textContent = record.comment;
      dom.photoViewerComment.style.display = 'block';
    } else {
      dom.photoViewerComment.textContent = '';
      dom.photoViewerComment.style.display = 'none';
    }
  }

  showStatus?.(t('commentSaved'), 1500);
}
