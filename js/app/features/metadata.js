import { state } from '../state.js';
import {
  closeExportPrep,
  ensureExportPrepState,
  getExportDom,
  moveExportItem,
  openExportPrep,
  readOptionInputs,
  renderExportPrep
} from './metadata/prep-state.js';
import {
  getSelectedExportItems,
  resetExportPrepItems
} from './metadata/source.js';
import { exportPreparedPdf } from './metadata/pdf-export.js';
import { exportPreparedExcel } from './metadata/excel-export.js';

function bindHeaderActions(dom, { showStatus }) {
  dom.closeBtn?.addEventListener('click', () => closeExportPrep());
  dom.cancelBtn?.addEventListener('click', () => closeExportPrep());
  dom.triggerBtn?.addEventListener('click', () => openExportPrep({ showStatus }));
}

function bindBulkSelection(dom) {
  dom.selectAllBtn?.addEventListener('click', () => {
    const shouldSelectAll = getSelectedExportItems().length !== state.exportPrep.items.length;
    resetExportPrepItems(state.exportPrep.items.map((item) => ({ ...item, selected: shouldSelectAll })));
    renderExportPrep();
  });

  dom.clearAllBtn?.addEventListener('click', () => {
    resetExportPrepItems(state.exportPrep.items.map((item) => ({ ...item, selected: false })));
    renderExportPrep();
  });
}

function bindOptionInputs(dom) {
  const optionInputs = [
    dom.optionImages, dom.optionNotes, dom.optionTags,
    dom.optionMetadata, dom.optionMapsLinks
  ];
  for (const input of optionInputs) {
    input?.addEventListener('change', () => readOptionInputs());
  }
}

function bindExportButtons(dom, { showStatus }) {
  dom.pdfBtn?.addEventListener('click', () => exportPreparedPdf({ showStatus }));
  dom.excelBtn?.addEventListener('click', () => exportPreparedExcel({ showStatus }));
}

function findItemAndIndex(target) {
  const itemEl = target.closest('.export-prep-item');
  if (!itemEl) return null;
  const photoId = Number(itemEl.dataset.photoId);
  const itemIndex = state.exportPrep.items.findIndex((item) => item.id === photoId);
  if (itemIndex < 0) return null;
  return { itemEl, photoId, itemIndex };
}

function bindListActions(dom) {
  dom.list?.addEventListener('click', (event) => {
    const located = findItemAndIndex(event.target);
    if (!located) return;
    const { itemIndex } = located;

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'toggle-selected') {
      const nextSelected = Boolean(event.target.checked);
      resetExportPrepItems(state.exportPrep.items.map((item, index) => (
        index === itemIndex ? { ...item, selected: nextSelected } : item
      )));
      renderExportPrep();
      return;
    }

    const lastIndex = state.exportPrep.items.length - 1;
    if (action === 'move-top') moveExportItem(itemIndex, 0);
    else if (action === 'move-up') moveExportItem(itemIndex, Math.max(0, itemIndex - 1));
    else if (action === 'move-down') moveExportItem(itemIndex, Math.min(lastIndex, itemIndex + 1));
    else if (action === 'move-bottom') moveExportItem(itemIndex, lastIndex);
  });
}

function bindDragAndDrop(dom) {
  dom.list?.addEventListener('dragstart', (event) => {
    const itemEl = event.target.closest('.export-prep-item');
    if (!itemEl) return;
    state.exportPrep.dragId = Number(itemEl.dataset.photoId);
    event.dataTransfer.effectAllowed = 'move';
  });

  dom.list?.addEventListener('dragover', (event) => {
    const itemEl = event.target.closest('.export-prep-item');
    if (!itemEl) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dom.list.querySelectorAll('.export-prep-item.drag-over').forEach((el) => el.classList.remove('drag-over'));
    itemEl.classList.add('drag-over');
  });

  dom.list?.addEventListener('drop', (event) => {
    const itemEl = event.target.closest('.export-prep-item');
    if (!itemEl) return;
    event.preventDefault();

    const fromIndex = state.exportPrep.items.findIndex((item) => item.id === state.exportPrep.dragId);
    const toIndex = state.exportPrep.items.findIndex((item) => item.id === Number(itemEl.dataset.photoId));
    dom.list.querySelectorAll('.export-prep-item.drag-over').forEach((el) => el.classList.remove('drag-over'));
    state.exportPrep.dragId = null;
    moveExportItem(fromIndex, toIndex);
  });

  dom.list?.addEventListener('dragend', () => {
    state.exportPrep.dragId = null;
    dom.list.querySelectorAll('.export-prep-item.drag-over').forEach((el) => el.classList.remove('drag-over'));
  });
}

function bindPrepEvents({ showStatus } = {}) {
  const dom = getExportDom();
  if (!dom.modal || dom.modal.dataset.bound === 'true') return;
  dom.modal.dataset.bound = 'true';

  bindHeaderActions(dom, { showStatus });
  bindBulkSelection(dom);
  bindOptionInputs(dom);
  bindExportButtons(dom, { showStatus });
  bindListActions(dom);
  bindDragAndDrop(dom);
}

export function initMetadataExport(dom, { showStatus } = {}) {
  ensureExportPrepState();
  const exportDom = getExportDom();
  if (!exportDom.triggerBtn || !exportDom.modal) {
    console.warn('Export preparation UI not found');
    return;
  }
  bindPrepEvents({ showStatus });
}

export async function exportSinglePhotoMetadata(photoId, format = 'excel', { showStatus } = {}) {
  await openExportPrep({ ids: [photoId], showStatus });
  if (format === 'pdf') {
    await exportPreparedPdf({ showStatus });
  } else {
    await exportPreparedExcel({ showStatus });
  }
}
