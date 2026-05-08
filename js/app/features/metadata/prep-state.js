import { state } from '../../state.js';
import { escapeHtml, formatDateTime, normalizeText } from './format.js';
import {
  getSelectedExportItems,
  getSourcePhotos,
  normalizeExportItems,
  resetExportPrepItems,
  revokeExportPrepUrls
} from './source.js';

export const DEFAULT_EXPORT_OPTIONS = Object.freeze({
  includeLogo: true,
  includeImages: true,
  includeNotes: true,
  includeTags: true,
  includeMetadata: true,
  includeMapsLinks: true,
  reportTitle: 'Lens Light Report',
  organization: '',
  preparedBy: ''
});

export function getExportDom() {
  return {
    triggerBtn: document.getElementById('export-metadata-btn'),
    modal: document.getElementById('export-prep-modal'),
    closeBtn: document.getElementById('close-export-prep'),
    cancelBtn: document.getElementById('export-prep-cancel-btn'),
    summary: document.getElementById('export-prep-summary'),
    source: document.getElementById('export-prep-source'),
    status: document.getElementById('export-prep-status'),
    empty: document.getElementById('export-prep-empty'),
    list: document.getElementById('export-prep-list'),
    selectAllBtn: document.getElementById('export-prep-select-all'),
    clearAllBtn: document.getElementById('export-prep-clear-all'),
    pdfBtn: document.getElementById('export-prep-pdf-btn'),
    excelBtn: document.getElementById('export-prep-excel-btn'),
    optionLogo: document.getElementById('export-option-logo'),
    optionImages: document.getElementById('export-option-images'),
    optionNotes: document.getElementById('export-option-notes'),
    optionTags: document.getElementById('export-option-tags'),
    optionMetadata: document.getElementById('export-option-metadata'),
    optionMapsLinks: document.getElementById('export-option-maps'),
    varTitle: document.getElementById('export-var-title'),
    varOrg: document.getElementById('export-var-org'),
    varPrepared: document.getElementById('export-var-prepared')
  };
}

export function ensureExportPrepState() {
  if (!state.exportPrep) {
    state.exportPrep = {
      open: false,
      source: 'gallery',
      sourceLabel: 'Current gallery results',
      items: [],
      dragId: null,
      options: { ...DEFAULT_EXPORT_OPTIONS }
    };
  }

  state.exportPrep.options = {
    ...DEFAULT_EXPORT_OPTIONS,
    ...(state.exportPrep.options || {})
  };
}

export function syncOptionInputs() {
  const dom = getExportDom();
  const { options } = state.exportPrep;

  if (dom.optionLogo) dom.optionLogo.checked = options.includeLogo !== false;
  if (dom.optionImages) dom.optionImages.checked = Boolean(options.includeImages);
  if (dom.optionNotes) dom.optionNotes.checked = Boolean(options.includeNotes);
  if (dom.optionTags) dom.optionTags.checked = Boolean(options.includeTags);
  if (dom.optionMetadata) dom.optionMetadata.checked = Boolean(options.includeMetadata);
  if (dom.optionMapsLinks) dom.optionMapsLinks.checked = Boolean(options.includeMapsLinks);
  if (dom.varTitle) dom.varTitle.value = options.reportTitle || '';
  if (dom.varOrg) dom.varOrg.value = options.organization || '';
  if (dom.varPrepared) dom.varPrepared.value = options.preparedBy || '';
}

export function readOptionInputs() {
  const dom = getExportDom();
  state.exportPrep.options = {
    includeLogo: Boolean(dom.optionLogo?.checked),
    includeImages: Boolean(dom.optionImages?.checked),
    includeNotes: Boolean(dom.optionNotes?.checked),
    includeTags: Boolean(dom.optionTags?.checked),
    includeMetadata: Boolean(dom.optionMetadata?.checked),
    includeMapsLinks: Boolean(dom.optionMapsLinks?.checked),
    reportTitle: dom.varTitle?.value || '',
    organization: dom.varOrg?.value || '',
    preparedBy: dom.varPrepared?.value || ''
  };
}

function renderItemRow(item) {
  const orderLabel = item.exportOrder ? String(item.exportOrder) : '&mdash;';
  const projectText = normalizeText(item.projectName, 'No project');
  const locationText = normalizeText(item.location || item.checkpoint || item.zone, 'No location');
  const noteText = item.comment ? escapeHtml(item.comment) : 'No notes';
  const thumbMarkup = item.previewUrl
    ? `<img src="${item.previewUrl}" alt="${escapeHtml(item.filename)}">`
    : `<div class="export-prep-thumb-fallback">No preview</div>`;

  return `
    <div class="export-prep-item${item.selected ? '' : ' is-unselected'}" data-photo-id="${item.id}" draggable="true" role="listitem">
      <input class="export-prep-check" data-action="toggle-selected" type="checkbox" ${item.selected ? 'checked' : ''} aria-label="Select ${escapeHtml(item.filename)} for export">
      <div class="export-prep-order">${orderLabel}</div>
      <div class="export-prep-thumb">${thumbMarkup}</div>
      <div class="export-prep-body">
        <div class="export-prep-title-row">
          <button class="export-prep-handle" type="button" aria-label="Drag to reorder">⋮⋮</button>
          <div class="export-prep-filename">${escapeHtml(item.filename)}</div>
        </div>
        <div class="export-prep-meta">Project: ${escapeHtml(projectText)}</div>
        <div class="export-prep-meta">Location: ${escapeHtml(locationText)}</div>
        <div class="export-prep-meta">Date: ${escapeHtml(formatDateTime(item.timestamp))}</div>
        <div class="export-prep-meta">Notes: ${noteText}</div>
      </div>
      <div class="export-prep-controls">
        <button class="export-prep-move" data-action="move-top" type="button" title="Move to top">⇤</button>
        <button class="export-prep-move" data-action="move-up" type="button" title="Move up">↑</button>
        <button class="export-prep-move" data-action="move-down" type="button" title="Move down">↓</button>
        <button class="export-prep-move" data-action="move-bottom" type="button" title="Move to bottom">⇥</button>
      </div>
    </div>
  `;
}

export function renderExportPrep() {
  const dom = getExportDom();
  if (!dom.modal || !dom.list) return;

  syncOptionInputs();

  const items = state.exportPrep.items || [];
  const selectedCount = getSelectedExportItems().length;
  const totalCount = items.length;
  const allSelected = totalCount > 0 && selectedCount === totalCount;

  dom.summary.textContent = totalCount > 0
    ? `${selectedCount} of ${totalCount} record(s) selected. Export follows the order shown.`
    : 'No records available for this export source.';
  dom.source.textContent = `Source: ${state.exportPrep.sourceLabel || 'Current filtered gallery results'}`;
  dom.status.textContent = selectedCount > 0
    ? `${selectedCount} record(s) ready. PDF and Excel will use this exact order.`
    : 'Select at least one record to enable export.';
  dom.selectAllBtn.textContent = allSelected ? 'Deselect All' : 'Select All';
  dom.empty.hidden = totalCount > 0;
  dom.list.hidden = totalCount === 0;
  dom.pdfBtn.disabled = selectedCount === 0;
  dom.excelBtn.disabled = selectedCount === 0;

  dom.list.innerHTML = totalCount === 0 ? '' : items.map(renderItemRow).join('');
}

export function moveExportItem(fromIndex, toIndex) {
  const items = state.exportPrep.items.slice();
  if (
    fromIndex < 0 || toIndex < 0 ||
    fromIndex >= items.length || toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return;
  }

  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  resetExportPrepItems(items);
  renderExportPrep();
}

export function closeExportPrep() {
  const dom = getExportDom();
  revokeExportPrepUrls();
  state.exportPrep.open = false;
  state.exportPrep.dragId = null;
  state.exportPrep.items = [];
  if (dom.modal) {
    dom.modal.classList.remove('open');
    dom.modal.setAttribute('aria-hidden', 'true');
  }
}

export async function openExportPrep({ ids = null, showStatus } = {}) {
  ensureExportPrepState();
  const dom = getExportDom();
  if (!dom.modal) return;

  const source = getSourcePhotos(ids);
  if (source.photos.length === 0) {
    showStatus?.('⚠️ No records available to export', 2500);
    return;
  }

  revokeExportPrepUrls();
  state.exportPrep.open = true;
  state.exportPrep.source = source.source;
  state.exportPrep.sourceLabel = source.sourceLabel;
  state.exportPrep.items = [];
  dom.modal.classList.add('open');
  dom.modal.setAttribute('aria-hidden', 'false');
  dom.summary.textContent = 'Preparing export records...';
  dom.source.textContent = `Source: ${source.sourceLabel}`;
  dom.status.textContent = 'Loading thumbnails and metadata...';
  dom.list.innerHTML = '';
  dom.empty.hidden = true;
  syncOptionInputs();

  const items = await normalizeExportItems(source.photos);
  resetExportPrepItems(items);
  renderExportPrep();
}

export function buildPreparedPayload() {
  readOptionInputs();
  const items = getSelectedExportItems();

  return {
    source: state.exportPrep.source,
    sourceLabel: state.exportPrep.sourceLabel,
    generatedAt: new Date().toISOString(),
    options: { ...state.exportPrep.options },
    totalIncluded: items.length,
    items
  };
}

const externalScriptPromises = new Map();

export function loadExternalScript(key, src, getGlobal) {
  const existing = getGlobal();
  if (existing) return Promise.resolve(existing);
  if (externalScriptPromises.has(key)) return externalScriptPromises.get(key);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      const loadedGlobal = getGlobal();
      if (loadedGlobal) resolve(loadedGlobal);
      else reject(new Error(`Script loaded but ${key} global is unavailable`));
    };
    script.onerror = () => reject(new Error(`Failed to load ${key} from ${src}`));
    document.head.appendChild(script);
  });

  externalScriptPromises.set(key, promise);
  promise.catch(() => externalScriptPromises.delete(key));
  return promise;
}
