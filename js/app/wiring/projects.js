import { state } from '../state.js';
import { t, tFmt } from '../core/i18n.js';
import { saveSettings } from '../core/settings.js';
import { isTouchPrimaryInput, sanitizeInput, createShortAddress, PHOTOS_CHANGED_EVENT } from '../core/utils.js';
import {
  exitSelectMode,
  getActiveProjectName,
  getGalleryPhotos,
  getProjectPhotoCount,
  loadPhotos,
  renderGallery,
  updateGalleryUI
} from '../gallery/gallery.js';
import { dbPutPhoto } from '../storage/photoDb.js';

function getProjectFiles() {
  const seen = new Set();
  const files = [];
  const add = (value) => {
    const name = sanitizeInput(value).trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    files.push(name);
  };

  if (Array.isArray(state.settings.savedProjects)) state.settings.savedProjects.forEach(add);
  state.photos.forEach((photo) => add(photo.projectName));
  add(state.settings.projectName);

  return files.sort((a, b) =>
    a.localeCompare(b, state.currentLang === 'ar' ? 'ar' : 'en', { sensitivity: 'base' })
  );
}

function syncSavedProjectFiles({ persist = true } = {}) {
  const next = getProjectFiles();
  const current = Array.isArray(state.settings.savedProjects) ? state.settings.savedProjects : [];
  const changed = next.length !== current.length || next.some((name, index) => name !== current[index]);
  if (changed) {
    state.settings.savedProjects = next;
    if (persist) saveSettings();
  }
  return next;
}

function syncProjectInputs(dom, projectName = state.settings.projectName || '') {
  if (dom.projectNameInput) dom.projectNameInput.value = projectName;
  if (dom.projectPanelNameInput) dom.projectPanelNameInput.value = projectName;
  dom.projectBtn?.classList.toggle('active', Boolean(projectName));
}

function applyProjectUiText(dom) {
  const activeProject = getActiveProjectName();
  const buttonLabel = t('projectButtonLabel');
  const closeLabel = t('projectClose');

  if (dom.projectBtn) {
    dom.projectBtn.title = buttonLabel;
    dom.projectBtn.setAttribute('aria-label', buttonLabel);
  }

  if (dom.projectPanelTitle) dom.projectPanelTitle.textContent = t('projectPanelTitle');
  if (dom.projectPanelNameLabel) dom.projectPanelNameLabel.textContent = t('projectNameLabel');
  if (dom.projectPanelNameInput) dom.projectPanelNameInput.placeholder = t('projectPlaceholder');
  if (dom.projectPanelCopy) dom.projectPanelCopy.textContent = t('projectCopy');
  if (dom.projectCurrentLabel) dom.projectCurrentLabel.textContent = activeProject ? t('projectActiveLabel') : t('projectNoneOpen');
  if (dom.projectCurrentName) dom.projectCurrentName.textContent = activeProject || t('projectNoneHint');
  if (dom.openProjectBtn) dom.openProjectBtn.textContent = t('projectOpenAction');
  if (dom.takeProjectPhotoBtn) dom.takeProjectPhotoBtn.textContent = t('projectTakePhoto');
  if (dom.openProjectGalleryBtn) dom.openProjectGalleryBtn.textContent = t('projectOpenPhotos');
  if (dom.addProjectPhotoBtn) dom.addProjectPhotoBtn.textContent = t('projectAddPhotos');
  if (dom.closeActiveProjectBtn) dom.closeActiveProjectBtn.textContent = t('projectCloseAction');
  if (dom.projectListTitle) dom.projectListTitle.textContent = t('projectFiles');
  if (dom.closeProjectPanelBtn) {
    dom.closeProjectPanelBtn.textContent = closeLabel;
    dom.closeProjectPanelBtn.setAttribute('aria-label', closeLabel);
  }
}

function updateActiveProjectBadge(dom) {
  const activeProject = getActiveProjectName();
  if (!dom.activeProjectBadge) return;

  if (!activeProject) {
    dom.activeProjectBadge.style.display = 'none';
    dom.activeProjectBadge.textContent = '';
    return;
  }

  dom.activeProjectBadge.style.display = 'inline-flex';
  dom.activeProjectBadge.textContent = activeProject;
  dom.activeProjectBadge.setAttribute('aria-label', activeProject);
}

function renderProjectFiles(dom) {
  if (!dom.projectList) return;

  const files = syncSavedProjectFiles({ persist: false });
  const activeProject = getActiveProjectName();
  dom.projectList.innerHTML = '';

  if (files.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'project-list-empty';
    empty.textContent = t('projectNoSaved');
    dom.projectList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const name of files) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'project-file';
    if (name === activeProject) item.classList.add('active');
    item.dataset.projectName = name;

    const icon = document.createElement('span');
    icon.className = 'project-file-icon';
    icon.textContent = '🗂️';

    const body = document.createElement('span');
    body.className = 'project-file-body';

    const title = document.createElement('span');
    title.className = 'project-file-name';
    title.textContent = name;

    const meta = document.createElement('span');
    meta.className = 'project-file-meta';
    meta.textContent = tFmt('projectFileMeta', { count: getProjectPhotoCount(name) });

    body.appendChild(title);
    body.appendChild(meta);
    item.appendChild(icon);
    item.appendChild(body);
    fragment.appendChild(item);
  }

  dom.projectList.appendChild(fragment);
}

export function refreshProjectManagerUi(dom) {
  syncSavedProjectFiles({ persist: true });
  syncProjectInputs(dom, state.settings.projectName || '');
  applyProjectUiText(dom);
  updateActiveProjectBadge(dom);
  renderProjectFiles(dom);
  updateGalleryUI(dom);
}

function openProjectPanel(dom) {
  refreshProjectManagerUi(dom);
  dom.projectPanelBackdrop?.classList.add('active');
  dom.projectPanel?.classList.add('open');
  dom.projectPanel?.setAttribute('aria-hidden', 'false');
  if (!isTouchPrimaryInput()) {
    dom.projectPanelNameInput?.focus?.();
    dom.projectPanelNameInput?.select?.();
  }
}

function closeProjectPanel(dom) {
  dom.projectPanelNameInput?.blur?.();
  dom.projectPanelBackdrop?.classList.remove('active');
  dom.projectPanel?.classList.remove('open');
  dom.projectPanel?.setAttribute('aria-hidden', 'true');
  if (!isTouchPrimaryInput()) dom.projectBtn?.focus?.();
}

function openProjectFile(dom, env, projectName, { announce = true, closePanelAfter = false } = {}) {
  const { showStatus, galleryObserver } = env;
  const nextProject = sanitizeInput(projectName).trim();
  if (!nextProject) {
    showStatus(t('projectNameRequired'), 2200);
    dom.projectPanelNameInput?.focus?.();
    return null;
  }

  state.settings.projectName = nextProject;
  state.settings.savedProjects = getProjectFiles();
  saveSettings();
  refreshProjectManagerUi(dom);

  if (dom.galleryModal?.classList.contains('open')) {
    exitSelectMode(dom);
    renderGallery(dom, galleryObserver, { showStatus });
  }

  if (announce) showStatus(tFmt('projectOpened', { name: nextProject }), 1800);
  if (closePanelAfter) closeProjectPanel(dom);
  return nextProject;
}

function closeProjectFile(dom, env, { announce = true } = {}) {
  const { showStatus, galleryObserver } = env;
  if (!getActiveProjectName()) return;

  state.settings.projectName = '';
  saveSettings();
  refreshProjectManagerUi(dom);

  if (dom.galleryModal?.classList.contains('open')) {
    exitSelectMode(dom);
    renderGallery(dom, galleryObserver, { showStatus });
  }

  if (announce) showStatus(t('projectClosed'), 1800);
}

function openActiveProjectGallery(dom, env) {
  const { showStatus, galleryObserver } = env;
  const activeProject = openProjectFile(dom, env, dom.projectPanelNameInput?.value ?? state.settings.projectName, {
    announce: false, closePanelAfter: false
  });
  if (!activeProject) return;

  dom.galleryModal?.classList.add('open');
  dom.galleryModal?.setAttribute('aria-hidden', 'false');
  renderGallery(dom, galleryObserver, { showStatus });
  if (getGalleryPhotos().length > 0 && dom.selectModeBtn) dom.selectModeBtn.classList.remove('is-hidden');
  if (!isTouchPrimaryInput()) dom.closeGalleryBtn?.focus?.();
  closeProjectPanel(dom);
}

function armActiveProjectForCapture(dom, env) {
  const { showStatus } = env;
  const activeProject = openProjectFile(dom, env, dom.projectPanelNameInput?.value ?? state.settings.projectName, {
    announce: false, closePanelAfter: true
  });
  if (!activeProject) return;
  showStatus(tFmt('projectReadyForCapture', { name: activeProject }), 1800);
  if (!isTouchPrimaryInput()) dom.shutterBtn?.focus?.();
}

async function importIntoActiveProject(dom, env, fileList) {
  const { showStatus, galleryObserver } = env;
  const files = Array.from(fileList || []).filter((file) => file && String(file.type || '').startsWith('image/'));
  if (files.length === 0) {
    showStatus(t('projectNoImagesSelected'), 2200);
    return;
  }

  const activeProject = openProjectFile(dom, env, dom.projectPanelNameInput?.value ?? state.settings.projectName, {
    announce: false, closePanelAfter: false
  });

  if (!activeProject) {
    if (dom.projectPhotoInput) dom.projectPhotoInput.value = '';
    return;
  }

  let importedCount = 0;
  let lastImportedId = null;
  const baseId = Date.now();

  for (const [index, file] of files.entries()) {
    const photoId = baseId + index;
    const timestampSeed = Number.isFinite(file.lastModified) && file.lastModified > 0
      ? file.lastModified
      : Date.now() + index;

    try {
      await dbPutPhoto({
        id: photoId,
        timestamp: new Date(timestampSeed).toISOString(),
        lat: state.currentLat,
        lon: state.currentLon,
        alt: state.currentAlt,
        heading: state.currentHeading,
        shortAddress: state.currentShortAddress || createShortAddress(state.currentLat, state.currentLon),
        projectName: activeProject,
        location: state.settings.customLocation,
        comment: '',
        mime: file.type || 'image/jpeg',
        filter: 'normal',
        blob: file
      });
      importedCount += 1;
      lastImportedId = photoId;
    } catch (error) {
      console.error('Project photo import failed', file?.name, error);
    }
  }

  if (dom.projectPhotoInput) dom.projectPhotoInput.value = '';

  if (!importedCount) {
    showStatus(t('projectImportFailed'), 3000);
    return;
  }

  if (lastImportedId) state.lastCapturedPhotoId = lastImportedId;

  await loadPhotos(dom);
  state.settings.savedProjects = getProjectFiles();
  saveSettings();
  refreshProjectManagerUi(dom);

  if (dom.galleryModal?.classList.contains('open')) {
    renderGallery(dom, galleryObserver, { showStatus });
  }

  showStatus(tFmt('projectAddedCount', { count: importedCount }), 2200);
}

export function bindProjectEvents(dom, env) {
  window.addEventListener(PHOTOS_CHANGED_EVENT, () => refreshProjectManagerUi(dom));

  dom.projectBtn?.addEventListener('click', () => openProjectPanel(dom));
  dom.projectPanelBackdrop?.addEventListener('click', () => closeProjectPanel(dom));
  dom.closeProjectPanelBtn?.addEventListener('click', () => closeProjectPanel(dom));

  const openFromInput = ({ closePanelAfter = false } = {}) => openProjectFile(
    dom, env,
    dom.projectPanelNameInput?.value ?? state.settings.projectName,
    { announce: true, closePanelAfter }
  );

  dom.openProjectBtn?.addEventListener('click', () => openFromInput());
  dom.projectPanelNameInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    openFromInput();
  });

  dom.takeProjectPhotoBtn?.addEventListener('click', () => armActiveProjectForCapture(dom, env));
  dom.openProjectGalleryBtn?.addEventListener('click', () => openActiveProjectGallery(dom, env));

  dom.addProjectPhotoBtn?.addEventListener('click', () => {
    const projectName = openProjectFile(dom, env, dom.projectPanelNameInput?.value ?? state.settings.projectName, {
      announce: false, closePanelAfter: false
    });
    if (!projectName) return;
    dom.projectPhotoInput?.click();
  });

  dom.closeActiveProjectBtn?.addEventListener('click', () => closeProjectFile(dom, env, { announce: true }));

  dom.projectList?.addEventListener('click', (event) => {
    const button = event.target.closest('.project-file');
    if (!button) return;
    openProjectFile(dom, env, button.dataset.projectName || '', { announce: true, closePanelAfter: false });
  });

  dom.projectPhotoInput?.addEventListener('change', (event) => importIntoActiveProject(dom, env, event.target.files));
}
