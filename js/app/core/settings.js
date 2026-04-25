import { state } from '../state.js';
import { sanitizeInput } from './utils.js';
import { setLanguage, t } from './i18n.js';
import { APP_VERSION } from '../../version.js';

export function saveSettings() {
  try {
    // HDR is owned by featureState.hdrMode (the runtime authority used by the
    // capture pipeline). We persist it alongside the user-facing settings so
    // the toggle is restored on reload, but we don't store it on `state.settings`.
    const persisted = { ...state.settings, hdrMode: Boolean(state.featureState.hdrMode) };
    localStorage.setItem(state.SETTINGS_KEY, JSON.stringify(persisted));
  } catch (e) {
    console.warn('saveSettings failed', e);
  }
}

export function loadSettings(dom) {
  try {
    const raw = localStorage.getItem(state.SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Restore HDR onto the runtime authority (featureState) and strip it from
      // the persisted-settings copy to avoid two sources of truth in memory.
      if (Object.prototype.hasOwnProperty.call(parsed, 'hdrMode')) {
        state.featureState.hdrMode = Boolean(parsed.hdrMode);
        delete parsed.hdrMode;
      }
      state.settings = { ...state.settings, ...parsed };
    }
  } catch (e) {
    console.warn('loadSettings failed', e);
  }

  if (!Array.isArray(state.settings.savedProjects)) state.settings.savedProjects = [];

  if (dom?.projectNameInput) dom.projectNameInput.value = state.settings.projectName || '';
  if (dom?.customLocationInput) dom.customLocationInput.value = state.settings.customLocation || '';
  if (dom?.unitsSelect) dom.unitsSelect.value = state.settings.units || 'metric';
  if (dom?.languageSelect) dom.languageSelect.value = state.settings.language || 'en';
  if (dom?.qualitySelect) dom.qualitySelect.value = String(state.settings.imageQuality ?? 1.0);
  if (dom?.toggleCompass) dom.toggleCompass.checked = Boolean(state.settings.showCompass);
  if (dom?.toggleData) dom.toggleData.checked = Boolean(state.settings.showData);
  if (dom?.toggleWatermark) dom.toggleWatermark.checked = Boolean(state.settings.watermark);
  if (dom?.toggleSound) dom.toggleSound.checked = state.settings.cameraSound !== false;
  
  if (dom?.toggleBattery) dom.toggleBattery.checked = Boolean(state.settings.batteryMode);
  if (dom?.batteryModeIndicator) dom.batteryModeIndicator.style.display = state.settings.batteryMode ? 'inline-flex' : 'none';

  // Populates version
  const versionEl = document.getElementById('settings-version-number');
  const headerVersionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = APP_VERSION;
  if (headerVersionEl) headerVersionEl.textContent = `v${APP_VERSION}`;

  // NEW SETTINGS
  const toggleHdr = document.getElementById('toggle-hdr');
  const toggleFocusAssist = document.getElementById('toggle-focus-assist');
  const toggleDebugMode = document.getElementById('toggle-debug-mode');
  const timestampFormat = document.getElementById('timestamp-format');
  
  if (toggleHdr) toggleHdr.checked = Boolean(state.featureState.hdrMode);
  if (toggleFocusAssist) toggleFocusAssist.checked = state.settings.focusAssist !== false;
  if (toggleDebugMode) toggleDebugMode.checked = localStorage.getItem('debug_mode') === 'true';
  if (timestampFormat) timestampFormat.value = state.settings.timestampFormat || 'iso';

  setLanguage(state.settings.language || 'en', dom);

  if (dom?.compassContainer) dom.compassContainer.style.display = state.settings.showCompass ? 'flex' : 'none';
  if (dom?.dataContainer) dom.dataContainer.style.display = state.settings.showData ? 'block' : 'none';

  if (state.settings.customLocation && dom?.locationNameEl) {
    dom.locationNameEl.textContent = state.currentLang === 'ar'
      ? `الموقع: ${state.settings.customLocation}`
      : `Location: ${state.settings.customLocation}`;
  }
}

export function bindSettingsUi(dom, { showStatus, updateWeatherDisplay, renderGallery, revokeAllPhotoObjectUrls, clearAllPhotos, updateGalleryUI, loadSettings: reloadSettings, syncProjectUi } = {}) {
  dom?.settingsBtn?.addEventListener('click', () => {
    dom.settingsPanel?.classList.add('open');
    dom.settingsPanel?.setAttribute('aria-hidden', 'false');
  });
  dom?.closeSettingsBtn?.addEventListener('click', () => {
    dom.settingsPanel?.classList.remove('open');
    dom.settingsPanel?.setAttribute('aria-hidden', 'true');
    saveSettings();
  });

  dom?.projectNameInput?.addEventListener('change', (e) => {
    state.settings.projectName = sanitizeInput(e.target.value);
    saveSettings();
    syncProjectUi?.();
  });

  dom?.customLocationInput?.addEventListener('change', (e) => {
    state.locationUserEdited = true;
    state.settings.customLocation = sanitizeInput(e.target.value);
    if (dom?.locationNameEl) {
      dom.locationNameEl.textContent = state.currentLang === 'ar'
        ? `الموقع: ${state.settings.customLocation}`
        : `Location: ${state.settings.customLocation}`;
    }
    saveSettings();
  });

  dom?.unitsSelect?.addEventListener('change', (e) => {
    state.settings.units = e.target.value;
    saveSettings();
    updateWeatherDisplay?.();
  });

  dom?.languageSelect?.addEventListener('change', (e) => {
    state.settings.language = e.target.value;
    saveSettings();
    setLanguage(state.settings.language, dom);
    renderGallery?.();
  });

  dom?.qualitySelect?.addEventListener('change', (e) => {
    state.settings.imageQuality = parseFloat(e.target.value);
    saveSettings();
  });

  dom?.toggleCompass?.addEventListener('change', (e) => {
    state.settings.showCompass = e.target.checked;
    if (dom?.compassContainer) dom.compassContainer.style.display = state.settings.showCompass ? 'flex' : 'none';
    saveSettings();
  });

  dom?.toggleData?.addEventListener('change', (e) => {
    state.settings.showData = e.target.checked;
    if (dom?.dataContainer) dom.dataContainer.style.display = state.settings.showData ? 'block' : 'none';
    saveSettings();
  });

  dom?.toggleWatermark?.addEventListener('change', (e) => {
    state.settings.watermark = e.target.checked;
    saveSettings();
  });

  dom?.toggleSound?.addEventListener('change', (e) => {
    state.settings.cameraSound = e.target.checked;
    saveSettings();
  });

  dom?.toggleBattery?.addEventListener('change', (e) => {
    state.settings.batteryMode = e.target.checked;
    if (dom?.batteryModeIndicator) {
        dom.batteryModeIndicator.style.display = state.settings.batteryMode ? 'inline-flex' : 'none';
    }
    saveSettings();
  });

  // NEW SETTINGS EVENT LISTENERS
  const toggleHdr = document.getElementById('toggle-hdr');
  const toggleFocusAssist = document.getElementById('toggle-focus-assist');
  const toggleDebugMode = document.getElementById('toggle-debug-mode');
  const timestampFormat = document.getElementById('timestamp-format');
  
  toggleHdr?.addEventListener('change', (e) => {
    state.featureState.hdrMode = e.target.checked;
    // Mirror to the bottom-bar HDR button so the two UI surfaces stay in sync.
    const hdrBtn = document.getElementById('hdr-btn');
    if (hdrBtn) {
      hdrBtn.classList.toggle('active', e.target.checked);
      hdrBtn.setAttribute('aria-pressed', String(e.target.checked));
    }
    saveSettings();
  });
  
  toggleFocusAssist?.addEventListener('change', (e) => {
    state.settings.focusAssist = e.target.checked;
    saveSettings();
  });
  
  toggleDebugMode?.addEventListener('change', (e) => {
    if (e.target.checked) {
      localStorage.setItem('debug_mode', 'true');
      console.log('🐛 Debug mode enabled');
      showStatus?.('🐛 Debug mode ON - check console', 2000);
    } else {
      localStorage.removeItem('debug_mode');
      console.log('Debug mode disabled');
      showStatus?.('Debug mode OFF', 1500);
    }
  });
  
  timestampFormat?.addEventListener('change', (e) => {
    state.settings.timestampFormat = e.target.value;
    saveSettings();
  });

  dom?.clearAllDataBtn?.addEventListener('click', async () => {
    if (!confirm(t('confirmClearAllData'))) return;

    try {
      await clearAllPhotos?.();
      state.photos = [];
      state.selectedPhotos.clear();
      revokeAllPhotoObjectUrls?.();

      localStorage.clear();

      state.settings = {
        ...state.settings,
        projectName: '',
        savedProjects: [],
        customLocation: '',
        units: 'metric',
        language: 'en',
        showCompass: true,
        showData: true,
        imageQuality: 1.0,
        watermark: false,
        cameraSound: true,
        cameraFacingMode: 'environment',
        batteryMode: false
      };

      reloadSettings?.(dom);
      syncProjectUi?.();
      updateGalleryUI?.();
      renderGallery?.();
      showStatus?.(t('dataCleared'), 2500);
      dom?.settingsPanel?.classList.remove('open');
    } catch (e) {
      console.error('clear all data failed', e);
      showStatus?.('❌ Failed to clear data', 3000);
    }
  });
}
