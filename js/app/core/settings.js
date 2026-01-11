import { state } from '../state.js';
import { sanitizeInput } from './utils.js';
import { setLanguage, t } from './i18n.js';

export function saveSettings() {
  try {
    localStorage.setItem(state.SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (e) {
    console.warn('saveSettings failed', e);
  }
}

export function loadSettings(dom) {
  try {
    const raw = localStorage.getItem(state.SETTINGS_KEY);
    if (raw) state.settings = { ...state.settings, ...JSON.parse(raw) };
  } catch (e) {
    console.warn('loadSettings failed', e);
  }

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

  setLanguage(state.settings.language || 'en', dom);

  if (dom?.compassContainer) dom.compassContainer.style.display = state.settings.showCompass ? 'flex' : 'none';
  if (dom?.dataContainer) dom.dataContainer.style.display = state.settings.showData ? 'block' : 'none';

  if (state.settings.customLocation && dom?.locationNameEl) {
    dom.locationNameEl.textContent = state.currentLang === 'ar'
      ? `الموقع: ${state.settings.customLocation}`
      : `Location: ${state.settings.customLocation}`;
  }
}

export function bindSettingsUi(dom, { showStatus, updateWeatherDisplay, renderGallery, revokeAllPhotoObjectUrls, clearAllPhotos, updateGalleryUI, loadSettings: reloadSettings } = {}) {
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
    // Reload sensors if needed to apply battery mode (update gps interval)
    // We can't cleanly restart sensors from here easily without importing from sensors.js which might cause cycle.
    // However, sensors.js checks state.settings.batteryMode on next watch, but watchPosition interval is fixed.
    // For now, simpler is to let it apply on next app restart or sensor restart.
    // Ideally we should emit an event or call functionality to restart sensors.
    saveSettings();
    // Prompt user to restart if they want immediate effect is the easy way
    // or just let it be.
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
