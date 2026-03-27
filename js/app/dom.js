// DOM helpers + element map

export const $ = (id) => document.getElementById(id);

export function getDom() {
  return {
    // core
    video: $('video'),
    canvas: $('hidden-canvas'),
    flash: $('flash'),
    statusMsg: $('status-msg'),

    // permissions + main
    permBtn: $('ios-perm-btn'),
    shutterBtn: $('shutter-btn'),
    flipCameraBtn: $('flip-camera-btn'),

    // overlays
    compassContainer: $('compass-container'),
    compassArrow: $('compass-arrow'),
    headingTextEl: $('heading-text'),
    dataContainer: $('data-container'),
    gpsCoordsEl: $('gps-coords'),
    locationNameEl: $('location-name'),
    altitudeEl: $('altitude'),
    gpsAccuracyEl: $('gps-accuracy'),
    dateTimeEl: $('date-time'),
    weatherInfoEl: $('weather-info'),
    activeProjectBadge: $('active-project-badge'),

    // zoom
    zoomInBtn: $('zoom-in'),
    zoomOutBtn: $('zoom-out'),

    // feature controls
    gridBtn: $('grid-btn'),
    gpsPrecisionBtn: $('gps-precision-btn'),
    gridOverlay: $('grid-overlay'),
    levelBtn: $('level-btn'),
    levelIndicator: $('level-indicator'),
    timerBtn: $('timer-btn'),
    timerMenu: $('timer-menu'),
    timerCountdown: $('timer-countdown'),
    flashlightBtn: $('flashlight-btn'),
    filterBtn: $('filter-btn'),
    filterMenu: $('filter-menu'),
    exposureBtn: $('exposure-btn'),
    exposureControl: $('exposure-control'),
    exposureSlider: $('exposure-slider'),
    burstBtn: $('burst-btn'),
    burstIndicator: $('burst-indicator'),

    // NEW FEATURES
    focusRing: $('focus-ring'),
    focusBtn: $('focus-btn'),
    wbControl: $('wb-control'),
    wbSlider: $('wb-slider'),
    wbBtn: $('wb-btn'),
    hdrBtn: $('hdr-btn'),
    qrBtn: $('qr-btn'),

    // main controls
    galleryBtn: $('gallery-btn'),
    projectBtn: $('project-btn'),
    settingsBtn: $('settings-btn'),
    shareBtn: $('share-btn'),
    fileInput: $('file-input'),
    projectPhotoInput: $('project-photo-input'),
    photoCountEl: $('photo-count'),

    // project panel
    projectPanelBackdrop: $('project-panel-backdrop'),
    projectPanel: $('project-panel'),
    closeProjectPanelBtn: $('close-project-panel'),
    projectPanelTitle: $('project-panel-title'),
    projectPanelNameInput: $('project-panel-name'),
    projectPanelNameLabel: $('label-project-panel-name'),
    projectPanelCopy: $('project-panel-copy'),
    projectCurrentLabel: $('project-current-label'),
    projectCurrentName: $('project-current-name'),
    openProjectBtn: $('open-project-btn'),
    takeProjectPhotoBtn: $('take-project-photo-btn'),
    openProjectGalleryBtn: $('open-project-gallery-btn'),
    addProjectPhotoBtn: $('add-project-photo-btn'),
    closeActiveProjectBtn: $('close-active-project-btn'),
    projectListTitle: $('project-list-title'),
    projectList: $('project-list'),

    // settings panel
    settingsPanel: $('settings-panel'),
    closeSettingsBtn: $('close-settings'),
    projectNameInput: $('project-name'),
    customLocationInput: $('custom-location'),
    unitsSelect: $('units-select'),
    languageSelect: $('language-select'),
    qualitySelect: $('quality-select'),
    toggleCompass: $('toggle-compass'),
    toggleData: $('toggle-data'),
    toggleWatermark: $('toggle-watermark'),
    toggleSound: $('toggle-sound'),
    toggleBattery: $('toggle-battery'),
    batteryModeIndicator: $('battery-mode-indicator'),
    clearAllDataBtn: $('clear-all-data-btn'),

    // gallery modal
    galleryModal: $('gallery-modal'),
    closeGalleryBtn: $('close-gallery'),
    galleryGrid: $('gallery-grid'),
    galleryTitleText: $('gallery-title-text'),
    galleryCountEl: $('gallery-count'),
    selectModeBtn: $('select-mode-btn'),
    galleryActionsDiv: $('gallery-actions'),
    selectAllBtn: $('select-all-btn'),
    shareSelectedBtn: $('share-selected-btn'),
    downloadSelectedBtn: $('download-selected-btn'),
    deleteSelectedBtn: $('delete-selected-btn'),
    cancelSelectBtn: $('cancel-select-btn'),

    // photo viewer
    photoViewer: $('photo-viewer'),
    closePhotoViewerBtn: $('close-photo-viewer'),
    photoViewerImg: $('photo-viewer-img'),
    photoViewerBgImg: $('photo-viewer-bg-img'),
    photoViewerComment: $('photo-viewer-comment'),
    viewerShareBtn: $('viewer-share-btn'),
    viewerSaveBtn: $('viewer-save-btn'),
    viewerCommentBtn: $('viewer-comment-btn'),
    viewerDeleteBtn: $('viewer-delete-btn')
  };
}
