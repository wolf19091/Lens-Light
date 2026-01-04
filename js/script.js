// Lens Light - refactored multi-file app logic
// Runs as an ES module (loaded via <script type="module" ...>)

// -----------------------------
// Helpers
// -----------------------------
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// -----------------------------
// DOM
// -----------------------------
const video = $('video');
const canvas = $('hidden-canvas');
const flash = $('flash');
const statusMsg = $('status-msg');

const permBtn = $('ios-perm-btn');
const shutterBtn = $('shutter-btn');
const flipCameraBtn = $('flip-camera-btn');

// Overlays
const compassContainer = $('compass-container');
const compassArrow = $('compass-arrow');
const headingTextEl = $('heading-text');
const dataContainer = $('data-container');
const gpsCoordsEl = $('gps-coords');
const locationNameEl = $('location-name');
const altitudeEl = $('altitude');
const gpsAccuracyEl = $('gps-accuracy');
const dateTimeEl = $('date-time');
const weatherInfoEl = $('weather-info');

// Zoom
const zoomInBtn = $('zoom-in');
const zoomOutBtn = $('zoom-out');

// Feature controls
const gridBtn = $('grid-btn');
const gridOverlay = $('grid-overlay');
const levelBtn = $('level-btn');
const levelIndicator = $('level-indicator');
const timerBtn = $('timer-btn');
const timerMenu = $('timer-menu');
const timerCountdown = $('timer-countdown');
const flashlightBtn = $('flashlight-btn');
const filterBtn = $('filter-btn');
const filterMenu = $('filter-menu');
const exposureBtn = $('exposure-btn');
const exposureControl = $('exposure-control');
const exposureSlider = $('exposure-slider');
const burstBtn = $('burst-btn');
const burstIndicator = $('burst-indicator');

// Main controls
const galleryBtn = $('gallery-btn');
const settingsBtn = $('settings-btn');
const shareBtn = $('share-btn');
const fileInput = $('file-input');
const photoCountEl = $('photo-count');

// Settings panel
const settingsPanel = $('settings-panel');
const closeSettingsBtn = $('close-settings');
const projectNameInput = $('project-name');
const customLocationInput = $('custom-location');
const unitsSelect = $('units-select');
const languageSelect = $('language-select');
const qualitySelect = $('quality-select');
const toggleCompass = $('toggle-compass');
const toggleData = $('toggle-data');
const toggleWatermark = $('toggle-watermark');
const toggleSound = $('toggle-sound');
const clearAllDataBtn = $('clear-all-data-btn');

// Gallery modal
const galleryModal = $('gallery-modal');
const closeGalleryBtn = $('close-gallery');
const galleryGrid = $('gallery-grid');
const galleryCountEl = $('gallery-count');
const selectModeBtn = $('select-mode-btn');
const galleryActionsDiv = $('gallery-actions');
const selectAllBtn = $('select-all-btn');
const shareSelectedBtn = $('share-selected-btn');
const downloadSelectedBtn = $('download-selected-btn');
const deleteSelectedBtn = $('delete-selected-btn');
const cancelSelectBtn = $('cancel-select-btn');

// Photo viewer
const photoViewer = $('photo-viewer');
const closePhotoViewerBtn = $('close-photo-viewer');
const photoViewerImg = $('photo-viewer-img');
const photoViewerComment = $('photo-viewer-comment');
const viewerShareBtn = $('viewer-share-btn');
const viewerSaveBtn = $('viewer-save-btn');
const viewerCommentBtn = $('viewer-comment-btn');
const viewerDeleteBtn = $('viewer-delete-btn');

// Canvas context (performance improvement: disable alpha)
const ctx = canvas.getContext('2d', { alpha: false });

// -----------------------------
// i18n (minimal but complete for UI)
// -----------------------------
const translations = {
    en: {
        enableCamera: '🎥 Enable Camera & Sensors',
        enableGPS: '📍 Enable GPS & Sensors',
        sensorsEnabled: '✓ Sensors enabled',
        cameraReady: '✓ Camera ready',
        permissionDenied: '❌ Permission denied',
        gpsNotSupported: '❌ GPS not supported',
        waitingGPS: 'WAITING FOR GPS...',
        locationUnknown: 'Location: Unknown',
        photoMissing: '❌ Photo missing',
        couldNotOpenPhoto: '❌ Could not open photo',
        deleteThisPhoto: 'Delete this photo?',
        commentPrompt: 'Add a comment for this photo:',
        commentSaved: '✓ Comment saved',
        photoCaptured: '✓ Photo captured',
        captureFailed: '❌ Capture failed',
        videoNotReady: 'Video stream not ready',
        storageFull: 'Storage almost full!',
        storageLow: 'Storage running low',
        shareTitle: 'Survey Photo',
        shareText: 'Photo from Lens Light.',
        burstComplete: 'Burst Complete!',
        noPhotos: 'No photos yet. Capture some!',
        confirmClearAllData: 'Are you sure you want to clear all data? This will delete all photos and settings. This action cannot be undone!',
        dataCleared: '✓ All data has been cleared successfully!'
    },
    ar: {
        enableCamera: '🎥 تفعيل الكاميرا والمستشعرات',
        enableGPS: '📍 تفعيل نظام تحديد المواقع',
        sensorsEnabled: '✓ تم تفعيل المستشعرات',
        cameraReady: '✓ الكاميرا جاهزة',
        permissionDenied: '❌ تم رفض الإذن',
        gpsNotSupported: '❌ نظام GPS غير مدعوم',
        waitingGPS: 'في انتظار GPS...',
        locationUnknown: 'الموقع: غير معروف',
        photoMissing: '❌ الصورة غير موجودة',
        couldNotOpenPhoto: '❌ تعذر فتح الصورة',
        deleteThisPhoto: 'هل تريد حذف هذه الصورة؟',
        commentPrompt: 'أضف تعليقًا لهذه الصورة:',
        commentSaved: '✓ تم حفظ التعليق',
        photoCaptured: '✓ تم التقاط الصورة',
        captureFailed: '❌ فشل الالتقاط',
        videoNotReady: 'بث الفيديو غير جاهز',
        storageFull: 'التخزين ممتلئ تقريبًا!',
        storageLow: 'التخزين ينفد',
        shareTitle: 'صورة المسح',
        shareText: 'صورة من لينس لايت.',
        burstComplete: 'اكتمل التصوير المتتابع!',
        noPhotos: 'لا توجد صور بعد. التقط البعض!',
        confirmClearAllData: 'هل أنت متأكد من رغبتك في مسح جميع البيانات؟ سيؤدي هذا إلى حذف جميع الصور والإعدادات. لا يمكن التراجع عن هذا الإجراء!',
        dataCleared: '✓ تم مسح جميع البيانات بنجاح!'
    }
};

let currentLang = 'en';
const t = (key) => (translations[currentLang] && translations[currentLang][key]) || (translations.en[key] || key);

function setLanguage(lang) {
    currentLang = lang === 'ar' ? 'ar' : 'en';
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';

    // Update permission button label depending on state
    const cameraGranted = localStorage.getItem('camera_granted') === 'true';
    permBtn.textContent = cameraGranted ? t('enableGPS') : t('enableCamera');

    // Update a few default overlay strings if they are still placeholders
    if (gpsCoordsEl && (/WAITING/i.test(gpsCoordsEl.textContent) || /انتظار/i.test(gpsCoordsEl.textContent))) {
        gpsCoordsEl.textContent = t('waitingGPS');
    }
    if (locationNameEl && (/Unknown/i.test(locationNameEl.textContent) || /غير معروف/.test(locationNameEl.textContent))) {
        locationNameEl.textContent = t('locationUnknown');
    }

    // Update action buttons in-place (keep emojis already in HTML)
    if (shareSelectedBtn) shareSelectedBtn.textContent = currentLang === 'ar' ? '📤 مشاركة المحدد' : '📤 Share Selected';
    if (downloadSelectedBtn) downloadSelectedBtn.textContent = currentLang === 'ar' ? '💾 حفظ المحدد' : '💾 Save Selected';
    if (deleteSelectedBtn) deleteSelectedBtn.textContent = currentLang === 'ar' ? '🗑️ حذف المحدد' : '🗑️ Delete Selected';
    if (cancelSelectBtn) cancelSelectBtn.textContent = currentLang === 'ar' ? 'إلغاء' : 'Cancel';
}

// -----------------------------
// Status toasts
// -----------------------------
let statusTimer = null;
function showStatus(message, duration = 2500) {
    if (!statusMsg) return;
    statusMsg.textContent = String(message);
    statusMsg.classList.add('show');
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => statusMsg.classList.remove('show'), duration);
}

// -----------------------------
// Settings
// -----------------------------
const SETTINGS_KEY = 'surveycam_settings';
let settings = {
    projectName: '',
    customLocation: 'Riyadh Province',
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

function sanitizeInput(value) {
    return String(value ?? '').replace(/[<>"']/g, '');
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn('saveSettings failed', e);
    }
}

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) settings = { ...settings, ...JSON.parse(raw) };
    } catch (e) {
        console.warn('loadSettings failed', e);
    }

    if (projectNameInput) projectNameInput.value = settings.projectName || '';
    if (customLocationInput) customLocationInput.value = settings.customLocation || '';
    if (unitsSelect) unitsSelect.value = settings.units || 'metric';
    if (languageSelect) languageSelect.value = settings.language || 'en';
    if (qualitySelect) qualitySelect.value = String(settings.imageQuality ?? 1.0);
    if (toggleCompass) toggleCompass.checked = Boolean(settings.showCompass);
    if (toggleData) toggleData.checked = Boolean(settings.showData);
    if (toggleWatermark) toggleWatermark.checked = Boolean(settings.watermark);
    if (toggleSound) toggleSound.checked = settings.cameraSound !== false;

    setLanguage(settings.language || 'en');

    if (compassContainer) compassContainer.style.display = settings.showCompass ? 'flex' : 'none';
    if (dataContainer) dataContainer.style.display = settings.showData ? 'block' : 'none';

    if (settings.customLocation && locationNameEl) {
        locationNameEl.textContent = currentLang === 'ar' ? `الموقع: ${settings.customLocation}` : `Location: ${settings.customLocation}`;
    }
}

// -----------------------------
// Feature state
// -----------------------------
let featureState = {
    gridEnabled: true,
    levelEnabled: false,
    timerDelay: 0,
    flashlightOn: false,
    currentFilter: 'normal',
    exposureValue: 0,
    burstMode: false,
    burstCount: 0,
    maxBurstPhotos: 10,
    captureInProgress: false,
    countdownIntervalId: null
};

function applyFeatureUI() {
    gridBtn?.classList.toggle('active', featureState.gridEnabled);
    gridOverlay?.classList.toggle('active', featureState.gridEnabled);
    levelBtn?.classList.toggle('active', featureState.levelEnabled);
    levelIndicator?.classList.toggle('active', featureState.levelEnabled);
    burstBtn?.classList.toggle('active', featureState.burstMode);
    burstIndicator?.classList.toggle('active', featureState.burstMode);
}

// -----------------------------
// Audio (shutter + countdown)
// -----------------------------
function playBeep(frequency = 800, durationSec = 0.1, gain = 0.08) {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!playBeep.ctx) playBeep.ctx = new AudioCtx();
        const ac = playBeep.ctx;
        if (ac.state === 'suspended') ac.resume().catch(() => {});

        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.frequency.value = frequency;
        g.gain.value = gain;
        osc.connect(g);
        g.connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + durationSec);
    } catch {
        // ignore
    }
}

function playCameraShutter() {
    if (!settings.cameraSound) return;
    playBeep(1200, 0.05, 0.12);
}

// -----------------------------
// Storage quota warnings
// -----------------------------
async function checkStorageQuota() {
    try {
        if (navigator.storage?.estimate) {
            const estimate = await navigator.storage.estimate();
            const usage = estimate.usage || 0;
            const quota = estimate.quota || 0;
            if (quota > 0) {
                const percentUsed = (usage / quota) * 100;
                if (percentUsed > 90) showStatus('⚠️ ' + t('storageFull'), 4000);
                else if (percentUsed > 75) showStatus('⚠️ ' + t('storageLow'), 3000);
                return { usage, quota, percentUsed };
            }
        }
    } catch (e) {
        console.warn('Storage estimate failed', e);
    }
    return null;
}

// -----------------------------
// IndexedDB (photos)
// -----------------------------
const DB_NAME = 'lens_light_db';
const DB_VERSION = 1;
const PHOTO_STORE = 'photos';
let dbPromise = null;

function openPhotoDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(PHOTO_STORE)) {
                db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            try {
                db.onversionchange = () => {
                    try { db.close(); } catch {}
                };
            } catch {}
            resolve(db);
        };
        request.onerror = () => {
            const err = request.error || new Error('IndexedDB open failed');
            dbPromise = null;
            reject(err);
        };
        request.onblocked = () => {
            const err = new Error('IndexedDB open blocked');
            dbPromise = null;
            reject(err);
        };
    });
    return dbPromise;
}

async function dbPutPhoto(record) {
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB put failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        const req = tx.objectStore(PHOTO_STORE).put(record);
        req.onerror = () => {
            try { tx.abort(); } catch {}
        };
    });
}

async function dbDeletePhoto(id) {
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB delete aborted'));
        const req = tx.objectStore(PHOTO_STORE).delete(id);
        req.onerror = () => {
            try { tx.abort(); } catch {}
        };
    });
}

async function dbGetPhoto(id) {
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE, 'readonly');
        const req = tx.objectStore(PHOTO_STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    });
}

// Important: metadata-only read (excludes blob to avoid memory blowups)
async function dbGetAllPhotosMeta() {
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE, 'readonly');
        const store = tx.objectStore(PHOTO_STORE);
        const result = [];

        tx.onerror = () => reject(tx.error || new Error('IndexedDB cursor failed'));
        const req = store.openCursor();
        req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (!cursor) return resolve(result);
            const { blob, ...meta } = cursor.value;
            result.push(meta);
            cursor.continue();
        };
        req.onerror = () => reject(req.error || new Error('IndexedDB cursor failed'));
    });
}

async function clearAllPhotos() {
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PHOTO_STORE, 'readwrite');
        const store = tx.objectStore(PHOTO_STORE);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error || new Error('IndexedDB clear failed'));
    });
}

// Legacy migration (base64 localStorage)
async function migrateLegacyLocalStoragePhotos() {
    const legacyKey = 'surveycam_photos';
    let saved = null;
    try {
        saved = localStorage.getItem(legacyKey);
    } catch {
        saved = null;
    }
    if (!saved) return;

    try {
        const legacyPhotos = JSON.parse(saved);
        if (!Array.isArray(legacyPhotos) || legacyPhotos.length === 0) {
            localStorage.removeItem(legacyKey);
            return;
        }

        for (const legacy of legacyPhotos) {
            if (!legacy?.id || !legacy.dataURL) continue;
            const response = await fetch(legacy.dataURL);
            const blob = await response.blob();
            await dbPutPhoto({
                id: legacy.id,
                timestamp: legacy.timestamp,
                lat: legacy.lat,
                lon: legacy.lon,
                alt: legacy.alt,
                heading: legacy.heading,
                projectName: legacy.projectName,
                location: legacy.location,
                comment: legacy.comment || '',
                mime: blob.type || 'image/jpeg',
                blob
            });
        }

        localStorage.removeItem(legacyKey);
    } catch (e) {
        console.warn('Legacy migration failed', e);
        try { localStorage.removeItem(legacyKey); } catch {}
    }
}

function getPhotoFilename(photoMeta) {
    const iso = String(photoMeta.timestamp || new Date().toISOString()).replace(/[:.]/g, '-');
    const projectPrefix = photoMeta.projectName ? String(photoMeta.projectName).replace(/\s+/g, '_') + '_' : '';
    return `${projectPrefix}Survey_${iso}.jpg`;
}

// -----------------------------
// In-memory gallery state
// -----------------------------
let photos = []; // metadata only
let lastCapturedPhotoId = null;

let viewedPhotoId = null;
let viewedPhotoUrl = null;

let selectedPhotos = new Set();
let isSelectMode = false;

const photoObjectUrls = new Map();
function revokeAllPhotoObjectUrls() {
    for (const url of photoObjectUrls.values()) {
        try { URL.revokeObjectURL(url); } catch {}
    }
    photoObjectUrls.clear();
}

function updateGalleryUI() {
    const count = photos.length;
    if (galleryCountEl) galleryCountEl.textContent = String(count);

    if (photoCountEl) {
        if (count > 0) {
            photoCountEl.style.display = 'flex';
            photoCountEl.textContent = String(count);
        } else {
            photoCountEl.style.display = 'none';
            photoCountEl.textContent = '0';
        }
    }
}

function updateSelectAllButton() {
    if (!selectAllBtn) return;
    if (!isSelectMode) {
        selectAllBtn.textContent = currentLang === 'ar' ? 'تحديد الكل' : 'Select All';
        return;
    }

    const allIds = photos.map((p) => p.id);
    const isAllSelected = allIds.length > 0 && allIds.every((id) => selectedPhotos.has(id));
    selectAllBtn.textContent = isAllSelected
        ? (currentLang === 'ar' ? 'إلغاء تحديد الكل' : 'Unselect All')
        : (currentLang === 'ar' ? 'تحديد الكل' : 'Select All');
}

async function loadPhotos() {
    await openPhotoDb();
    await migrateLegacyLocalStoragePhotos();

    const records = await dbGetAllPhotosMeta();
    photos = records
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

    updateGalleryUI();
}

function closePhotoViewer() {
    if (photoViewer) photoViewer.classList.remove('open');
    viewedPhotoId = null;
    if (viewedPhotoUrl) {
        try { URL.revokeObjectURL(viewedPhotoUrl); } catch {}
        viewedPhotoUrl = null;
    }
    if (photoViewerImg) photoViewerImg.removeAttribute('src');
    if (photoViewerComment) {
        photoViewerComment.style.display = 'none';
        photoViewerComment.textContent = '';
    }
}

async function openPhotoViewer(photoId) {
    try {
        const record = await dbGetPhoto(photoId);
        if (!record?.blob) {
            showStatus(t('photoMissing'), 2500);
            return;
        }

        if (viewedPhotoUrl) {
            try { URL.revokeObjectURL(viewedPhotoUrl); } catch {}
            viewedPhotoUrl = null;
        }

        viewedPhotoId = photoId;
        viewedPhotoUrl = URL.createObjectURL(record.blob);
        photoViewerImg.src = viewedPhotoUrl;

        if (photoViewerComment) {
            const comment = String(record.comment || '').trim();
            if (comment) {
                photoViewerComment.textContent = comment;
                photoViewerComment.style.display = 'block';
            } else {
                photoViewerComment.textContent = '';
                photoViewerComment.style.display = 'none';
            }
        }

        photoViewer.classList.add('open');
    } catch (e) {
        console.error('openPhotoViewer failed', e);
        showStatus(t('couldNotOpenPhoto'), 2500);
    }
}

// Lazy-load thumbnails
const galleryObserver = new IntersectionObserver(
    (entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const img = entry.target;
            const photoId = Number(img.dataset.photoId);
            observer.unobserve(img);

            (async () => {
                try {
                    if (photoObjectUrls.has(photoId)) {
                        img.src = photoObjectUrls.get(photoId);
                        img.classList.add('loaded');
                        return;
                    }

                    const record = await dbGetPhoto(photoId);
                    if (!record?.blob) return;

                    const url = URL.createObjectURL(record.blob);
                    photoObjectUrls.set(photoId, url);
                    img.src = url;
                    img.classList.add('loaded');
                } catch (e) {
                    console.warn('thumbnail load failed', e);
                }
            })();
        });
    },
    { root: galleryGrid, rootMargin: '200px', threshold: 0.1 }
);

function renderGallery() {
    if (!galleryGrid) return;
    galleryGrid.innerHTML = '';

    if (photos.length === 0) {
        if (selectModeBtn) selectModeBtn.style.display = 'none';
        galleryGrid.innerHTML = `<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.5);">${t('noPhotos')}</div>`;
        return;
    }

    const reversed = photos.slice().reverse();
    for (const photo of reversed) {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.dataset.photoId = String(photo.id);

        if (isSelectMode) {
            item.classList.add('select-mode');
            if (selectedPhotos.has(photo.id)) item.classList.add('selected');
        }

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'gallery-item-checkbox';
        checkbox.checked = selectedPhotos.has(photo.id);

        const img = document.createElement('img');
        img.alt = 'Survey photo';
        img.dataset.photoId = String(photo.id);
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        galleryObserver.observe(img);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'gallery-item-delete';
        deleteBtn.textContent = '×';
        deleteBtn.type = 'button';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (!isSelectMode) deletePhoto(photo.id);
        };

        item.onclick = () => {
            if (isSelectMode) {
                const next = !selectedPhotos.has(photo.id);
                if (next) selectedPhotos.add(photo.id);
                else selectedPhotos.delete(photo.id);

                item.classList.toggle('selected', next);
                checkbox.checked = next;
                updateSelectAllButton();
                return;
            }
            openPhotoViewer(photo.id);
        };

        item.appendChild(checkbox);
        item.appendChild(img);
        if (!isSelectMode) item.appendChild(deleteBtn);
        galleryGrid.appendChild(item);
    }
}

function enterSelectMode() {
    isSelectMode = true;
    selectedPhotos.clear();
    galleryActionsDiv.style.display = 'flex';
    selectModeBtn.style.display = 'none';
    document.querySelectorAll('.gallery-item').forEach((el) => el.classList.add('select-mode'));
    updateSelectAllButton();
}

function exitSelectMode() {
    isSelectMode = false;
    selectedPhotos.clear();
    galleryActionsDiv.style.display = 'none';
    if (photos.length > 0) selectModeBtn.style.display = 'block';
    document.querySelectorAll('.gallery-item').forEach((el) => el.classList.remove('select-mode', 'selected'));
    updateSelectAllButton();
}

async function deletePhoto(id) {
    if (!confirm(t('deleteThisPhoto'))) return;

    try {
        const numericId = typeof id === 'number' ? id : Number(id);
        if (!Number.isFinite(numericId)) throw new Error('Invalid id');
        await dbDeletePhoto(numericId);
        photos = photos.filter((p) => p.id !== numericId);

        if (lastCapturedPhotoId === numericId) lastCapturedPhotoId = null;
        const url = photoObjectUrls.get(numericId);
        if (url) {
            URL.revokeObjectURL(url);
            photoObjectUrls.delete(numericId);
        }

        updateGalleryUI();
        renderGallery();
        showStatus(currentLang === 'ar' ? '✓ تم حذف الصورة' : '✓ Photo deleted', 1500);
    } catch (e) {
        console.error('deletePhoto failed', e);
        showStatus('❌ Delete failed', 2000);
    }
}

async function shareSelectedPhotos() {
    const files = [];
    for (const id of selectedPhotos) {
        const record = await dbGetPhoto(id);
        if (!record?.blob) continue;
        const meta = photos.find((p) => p.id === id) || { id, timestamp: new Date().toISOString() };
        const filename = getPhotoFilename(meta);
        files.push(new File([record.blob], filename, { type: record.blob.type || 'image/jpeg' }));
    }

    if (files.length === 0) {
        showStatus('❌ No valid photos', 2500);
        return;
    }

    if (!navigator.share) {
        showStatus('❌ Sharing not supported. Use Save.', 3000);
        return;
    }

    if (navigator.canShare && !navigator.canShare({ files })) {
        showStatus('❌ Sharing not available. Use Save.', 3000);
        return;
    }

    try {
        await navigator.share({ files, title: `${files.length} photo(s)`, text: t('shareText') });
        showStatus('✓ Shared', 2000);
        exitSelectMode();
    } catch (e) {
        if (e?.name !== 'AbortError') console.warn('shareSelectedPhotos failed', e);
    }
}

async function downloadSelectedPhotos() {
    for (const id of selectedPhotos) {
        const record = await dbGetPhoto(id);
        if (!record?.blob) continue;
        const meta = photos.find((p) => p.id === id) || { id, timestamp: new Date().toISOString() };
        downloadBlob(record.blob, getPhotoFilename(meta));
        await sleep(250);
    }
    showStatus(currentLang === 'ar' ? `✓ تم حفظ ${selectedPhotos.size} صورة` : `✓ Saved ${selectedPhotos.size} photo(s)`, 2000);
    exitSelectMode();
}

async function deleteSelectedPhotos() {
    if (selectedPhotos.size === 0) return;
    if (!confirm(currentLang === 'ar' ? `حذف ${selectedPhotos.size} صورة؟` : `Delete ${selectedPhotos.size} photo(s)?`)) return;

    const ids = Array.from(selectedPhotos);
    let deleted = 0;
    for (const id of ids) {
        try {
            const numericId = typeof id === 'number' ? id : Number(id);
            if (!Number.isFinite(numericId)) continue;
            await dbDeletePhoto(numericId);
            photos = photos.filter((p) => p.id !== numericId);
            const url = photoObjectUrls.get(numericId);
            if (url) {
                URL.revokeObjectURL(url);
                photoObjectUrls.delete(numericId);
            }
            deleted++;
        } catch (e) {
            console.warn('deleteSelected failed', id, e);
        }
    }

    updateGalleryUI();
    renderGallery();
    exitSelectMode();
    showStatus(deleted > 0 ? `✓ Deleted ${deleted} photo(s)` : '❌ Delete failed', 2500);
}

// -----------------------------
// Download / Share utilities
// -----------------------------
function downloadBlob(blob, filename) {
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
    const url = URL.createObjectURL(blob);

    if (isIOS) {
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (!opened) showStatus('⚠️ Popup blocked. Tap and hold to save.', 3500);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
    }

    const a = document.createElement('a');
    a.download = filename;
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

async function shareBlob(blob, filename) {
    if (!navigator.share) return false;

    const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
    if (navigator.canShare && !navigator.canShare({ files: [file] })) return false;

    try {
        await navigator.share({ files: [file], title: t('shareTitle'), text: t('shareText') });
        return true;
    } catch (e) {
        if (e?.name !== 'AbortError') console.warn('shareBlob failed', e);
        return false;
    }
}

// -----------------------------
// Camera + capture
// -----------------------------
let videoStream = null;
let initCameraRequestId = 0;
let zoomLevel = 1;

async function initCamera() {
    const requestId = ++initCameraRequestId;

    try {
        if (videoStream) {
            try { videoStream.getTracks().forEach((t) => t.stop()); } catch {}
            videoStream = null;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            showStatus('❌ Camera not supported', 4000);
            return;
        }

        const preferredFacingMode = settings.cameraFacingMode || 'environment';
        const baseVideoConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 } };

        const constraintsExact = { video: { ...baseVideoConstraints, facingMode: { exact: preferredFacingMode } } };
        const constraintsIdeal = { video: { ...baseVideoConstraints, facingMode: { ideal: preferredFacingMode } } };

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraintsExact);
        } catch (e) {
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraintsIdeal);
            } catch {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }
        }

        if (requestId !== initCameraRequestId) {
            try { stream?.getTracks?.().forEach((t) => t.stop()); } catch {}
            return;
        }

        videoStream = stream;
        video.srcObject = videoStream;
        localStorage.setItem('camera_granted', 'true');
        showStatus(t('cameraReady'), 2000);

        // Apply current preview filters/exposure
        applyPreviewEffects();

    } catch (e) {
        console.error('initCamera failed', e);
        showStatus('❌ Camera error: ' + (e?.message || 'Unknown'), 4000);
    }
}

function applyZoom() {
    if (videoStream) {
        const track = videoStream.getVideoTracks?.()[0];
        if (track) {
            let caps = {};
            try { caps = track.getCapabilities?.() || {}; } catch {}

            if (caps.zoom?.max) {
                const z = Math.min(zoomLevel, caps.zoom.max);
                track.applyConstraints({ advanced: [{ zoom: z }] }).catch(() => {
                    // fallback to CSS
                    video.style.transform = `scale(${zoomLevel})`;
                });
                return;
            }
        }
    }

    video.style.transform = `scale(${zoomLevel})`;
}

function cssForFilter(name) {
    switch (name) {
        case 'bw':
            return 'grayscale(1)';
        case 'sepia':
            return 'sepia(1)';
        case 'vintage':
            return 'sepia(0.6) contrast(1.1) saturate(0.9)';
        case 'vivid':
            return 'contrast(1.2) saturate(1.4)';
        default:
            return '';
    }
}

function applyPreviewEffects() {
    const brightness = 1 + (featureState.exposureValue * 0.18);
    const filterFx = cssForFilter(featureState.currentFilter);
    const parts = [];
    if (filterFx) parts.push(filterFx);
    parts.push(`brightness(${brightness})`);
    video.style.filter = parts.join(' ');
}

function canvasToJpegBlob(quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Failed to create image blob'));
            },
            'image/jpeg',
            quality
        );
    });
}

// Watermark logo
const logoImg = new Image();
let logoLoadPromise = null;
logoImg.src = 'sec-lens-logo.png';

function getLogoLoadPromise() {
    if (logoImg.naturalWidth > 0) return Promise.resolve(true);
    if (logoLoadPromise) return logoLoadPromise;

    logoLoadPromise = new Promise((resolve) => {
        const done = (ok) => resolve(Boolean(ok));
        logoImg.addEventListener('load', () => done(true), { once: true });
        logoImg.addEventListener('error', () => done(false), { once: true });
    });

    return logoLoadPromise;
}

async function ensureLogoLoaded(timeoutMs = 1000) {
    if (logoImg.naturalWidth > 0) return true;
    const ok = await Promise.race([getLogoLoadPromise(), sleep(timeoutMs).then(() => false)]);
    if (!ok || logoImg.naturalWidth <= 0) return false;

    try {
        if (typeof logoImg.decode === 'function') {
            await Promise.race([logoImg.decode(), sleep(500)]);
        }
    } catch {
        // ignore
    }

    return logoImg.naturalWidth > 0;
}

function addWatermarkToCanvas(width, height) {
    const fontSize = Math.max(16, width * 0.018);
    const padding = fontSize * 1.2;
    const logoSize = Math.max(50, width * 0.08);

    if (logoImg.naturalWidth > 0) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 12;
        ctx.drawImage(logoImg, padding, padding, logoSize, logoSize);
        ctx.restore();

        ctx.font = `700 ${fontSize * 1.2}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.textAlign = 'left';
        ctx.fillText('LENS LIGHT', padding + logoSize + fontSize * 0.7, padding + logoSize / 2 + fontSize * 0.35);
    }
}

function applyFilterToImageData(imageData, filter) {
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        if (filter === 'bw') {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            data[i] = data[i + 1] = data[i + 2] = gray;
        } else if (filter === 'sepia') {
            data[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
            data[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
            data[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
        } else if (filter === 'vintage') {
            data[i] = Math.min(255, r * 1.1);
            data[i + 1] = Math.min(255, g * 1.05);
            data[i + 2] = Math.min(255, b * 0.9);
        } else if (filter === 'vivid') {
            data[i] = Math.min(255, r * 1.2);
            data[i + 1] = Math.min(255, g * 1.2);
            data[i + 2] = Math.min(255, b * 1.2);
        }

        // exposure brightness applied to pixels (fallback for capture)
        const brightness = 1 + (featureState.exposureValue * 0.18);
        data[i] = Math.min(255, data[i] * brightness);
        data[i + 1] = Math.min(255, data[i + 1] * brightness);
        data[i + 2] = Math.min(255, data[i + 2] * brightness);
    }
}

function drawDataOverlay() {
    const fontSize = Math.max(canvas.width / 40, 16);
    const padding = fontSize * 1.2;
    const lineHeight = fontSize * 1.4;

    const panelWidth = canvas.width * 0.46;
    const panelHeight = lineHeight * 6.5;
    const x = canvas.width - panelWidth - padding;
    const y = canvas.height - panelHeight - padding;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;

    const r = 14;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + panelWidth - r, y);
    ctx.quadraticCurveTo(x + panelWidth, y, x + panelWidth, y + r);
    ctx.lineTo(x + panelWidth, y + panelHeight - r);
    ctx.quadraticCurveTo(x + panelWidth, y + panelHeight, x + panelWidth - r, y + panelHeight);
    ctx.lineTo(x + r, y + panelHeight);
    ctx.quadraticCurveTo(x, y + panelHeight, x, y + panelHeight - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'left';

    const now = new Date();
    let yy = y + padding + fontSize;
    const project = settings.projectName ? `Project: ${settings.projectName}` : '';

    const lines = [
        project,
        `Time: ${now.toLocaleString(currentLang === 'ar' ? 'ar' : 'en-GB', { hour12: false })}`,
        currentLat && currentLon ? `GPS: ${currentLat.toFixed(6)}, ${currentLon.toFixed(6)}` : 'GPS: --',
        `Alt: ${formatAltitude(currentAlt)}`,
        `Heading: ${Math.round(currentHeading)}°`,
        settings.customLocation ? `Loc: ${settings.customLocation}` : ''
    ].filter(Boolean);

    for (const line of lines) {
        ctx.fillText(line, x + padding, yy);
        yy += lineHeight;
    }

    ctx.restore();
}

function drawCompassOverlay() {
    const size = Math.min(canvas.width, canvas.height) / 8;
    const cx = size * 1.8;
    const cy = size * 1.8;
    const r = size * 0.65;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.translate(cx, cy);
    ctx.rotate((currentHeading * Math.PI) / 180);

    // simple needle
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.75);
    ctx.lineTo(-r * 0.12, 0);
    ctx.lineTo(r * 0.12, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
    ctx.fill();

    ctx.restore();
}

async function enhancedCapture() {
    // Validate video readiness
    if (!video || !video.videoWidth || !video.videoHeight) {
        throw new Error(t('videoNotReady'));
    }

    playCameraShutter();

    if (flash) {
        flash.classList.add('active');
        setTimeout(() => flash.classList.remove('active'), 350);
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    canvas.width = vw;
    canvas.height = vh;

    // draw frame
    ctx.drawImage(video, 0, 0, vw, vh);

    // apply filters/exposure
    if (featureState.currentFilter !== 'normal' || featureState.exposureValue !== 0) {
        const imageData = ctx.getImageData(0, 0, vw, vh);
        applyFilterToImageData(imageData, featureState.currentFilter);
        ctx.putImageData(imageData, 0, 0);
    }

    if (settings.showData) drawDataOverlay();
    if (settings.showCompass) drawCompassOverlay();

    const logoOk = await ensureLogoLoaded(800);
    if (settings.watermark || logoOk) {
        addWatermarkToCanvas(vw, vh);
    }

    const blob = await canvasToJpegBlob(settings.imageQuality);

    const photo = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        lat: currentLat,
        lon: currentLon,
        alt: currentAlt,
        heading: currentHeading,
        projectName: settings.projectName,
        location: settings.customLocation,
        comment: '',
        mime: blob.type || 'image/jpeg',
        filter: featureState.currentFilter
    };

    await dbPutPhoto({ ...photo, blob });
    photos.push(photo);
    lastCapturedPhotoId = photo.id;

    updateGalleryUI();

    // Quota check occasionally
    if (photos.length % 5 === 0) {
        await checkStorageQuota();
    }

    if (!featureState.burstMode) showStatus(t('photoCaptured'), 1500);
}

async function performCapture() {
    if (featureState.captureInProgress) return;

    try {
        featureState.captureInProgress = true;

        // Burst handling
        if (featureState.burstMode) {
            if (featureState.burstCount >= featureState.maxBurstPhotos) {
                featureState.burstMode = false;
                featureState.burstCount = 0;
                burstBtn?.classList.remove('active');
                burstIndicator?.classList.remove('active');
                showStatus('📸 ' + t('burstComplete'), 2000);
                return;
            }
            featureState.burstCount++;
            const burstCounter = burstIndicator?.querySelector('.burst-counter');
            if (burstCounter) burstCounter.textContent = `${featureState.burstCount}/${featureState.maxBurstPhotos}`;
        }

        await enhancedCapture();

        // continue burst
        if (featureState.burstMode && featureState.burstCount < featureState.maxBurstPhotos) {
            await sleep(300);
            featureState.captureInProgress = false;
            return performCapture();
        }

        if (featureState.burstMode) {
            featureState.burstMode = false;
            featureState.burstCount = 0;
            burstBtn?.classList.remove('active');
            burstIndicator?.classList.remove('active');
            showStatus('📸 ' + t('burstComplete'), 2000);
        }

    } catch (e) {
        console.error('performCapture failed', e);
        showStatus('❌ ' + (e?.message || t('captureFailed')), 3000);
    } finally {
        featureState.captureInProgress = false;
    }
}

function startTimerCapture() {
    if (featureState.countdownIntervalId) {
        clearInterval(featureState.countdownIntervalId);
        featureState.countdownIntervalId = null;
        timerCountdown?.classList.remove('active');
    }

    let countdown = featureState.timerDelay;
    if (timerCountdown) {
        timerCountdown.textContent = String(countdown);
        timerCountdown.classList.add('active');
    }

    featureState.countdownIntervalId = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            if (timerCountdown) timerCountdown.textContent = String(countdown);
            if (settings.cameraSound) playBeep(800, 0.08, 0.06);
            return;
        }

        clearInterval(featureState.countdownIntervalId);
        featureState.countdownIntervalId = null;
        timerCountdown?.classList.remove('active');
        performCapture();
    }, 1000);
}

// -----------------------------
// Sensors: GPS + Compass + Level
// -----------------------------
let currentLat = 0;
let currentLon = 0;
let currentAlt = 0;
let currentAccuracy = 0;
let currentHeading = 0;
let smoothedHeading = 0;

let gpsWatchId = null;
let orientationListenerActive = false;
let gpsLastUpdateTime = 0;
let gpsHasEverWorked = false;

function stopSensors() {
    if (gpsWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }

    if (orientationListenerActive) {
        window.removeEventListener('deviceorientation', handleOrientation);
        window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
        orientationListenerActive = false;
    }
}

function startSensors() {
    stopSensors();

    // Compass
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
        window.addEventListener('deviceorientation', handleOrientation);
        orientationListenerActive = true;
    } else {
        if ('ondeviceorientationabsolute' in window) {
            window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        } else {
            window.addEventListener('deviceorientation', handleOrientation, true);
        }
        orientationListenerActive = true;
    }

    // GPS
    if (!navigator.geolocation) {
        showStatus(t('gpsNotSupported'), 3000);
        if (gpsCoordsEl) gpsCoordsEl.textContent = 'GPS Not Supported';
        return;
    }

    gpsWatchId = navigator.geolocation.watchPosition(updateGPS, handleGPSError, {
        enableHighAccuracy: true,
        maximumAge: settings.batteryMode ? 5000 : 0,
        timeout: 15000
    });
}

function getCardinalDirection(heading) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(heading / 45) % 8;
    return directions[index];
}

function handleOrientation(event) {
    let heading = null;

    if (event.webkitCompassHeading) {
        heading = event.webkitCompassHeading;
    } else if (event.alpha !== null && event.alpha !== undefined) {
        heading = 360 - event.alpha;
    }

    if (heading === null) return;
    if (heading < 0) heading += 360;
    if (heading >= 360) heading -= 360;

    let diff = heading - smoothedHeading;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    smoothedHeading += diff * 0.15;
    if (smoothedHeading < 0) smoothedHeading += 360;
    if (smoothedHeading >= 360) smoothedHeading -= 360;

    currentHeading = smoothedHeading;

    const now = performance.now();
    if (!handleOrientation.lastUpdate || now - handleOrientation.lastUpdate > 100) {
        handleOrientation.lastUpdate = now;

        if (compassArrow) compassArrow.style.transform = `rotate(${-currentHeading}deg)`;
        if (headingTextEl) headingTextEl.textContent = `Heading: ${Math.round(currentHeading)}° ${getCardinalDirection(currentHeading)}`;
    }

    if (featureState.levelEnabled && event.gamma !== null && event.gamma !== undefined) {
        if (handleOrientation.lastLevelUpdate && now - handleOrientation.lastLevelUpdate <= 50) return;
        handleOrientation.lastLevelUpdate = now;

        const gamma = event.gamma;
        const levelLine = levelIndicator?.querySelector('.level-line');
        if (!levelLine) return;

        levelLine.style.transform = `rotate(${gamma}deg)`;
        if (Math.abs(gamma) < 1) {
            levelIndicator.classList.add('level');
            if (navigator.vibrate && !levelIndicator.dataset.wasLevel) {
                try { navigator.vibrate(10); } catch {}
                levelIndicator.dataset.wasLevel = 'true';
            }
        } else {
            levelIndicator.classList.remove('level');
            delete levelIndicator.dataset.wasLevel;
        }
    }
}

function formatAltitude(altMeters) {
    if (!altMeters || !Number.isFinite(altMeters)) return settings.units === 'imperial' ? '-- ft' : '-- m';
    if (settings.units === 'imperial') return `${Math.round(altMeters * 3.28084)} ft`;
    return `${Math.round(altMeters)} m`;
}

function updateAccuracyDisplay(accuracyMeters) {
    if (!gpsAccuracyEl) return;

    let cls = 'accuracy-poor';
    let label = currentLang === 'ar' ? 'ضعيف' : 'Poor';

    if (accuracyMeters < 10) {
        cls = 'accuracy-good';
        label = currentLang === 'ar' ? 'ممتاز' : 'Excellent';
    } else if (accuracyMeters < 30) {
        cls = 'accuracy-medium';
        label = currentLang === 'ar' ? 'جيد' : 'Good';
    }

    gpsAccuracyEl.className = `data-line small-text ${cls}`;
    gpsAccuracyEl.textContent = `Accuracy: ${Math.round(accuracyMeters)}m (${label})`;
}

function updateGPS(position) {
    gpsLastUpdateTime = Date.now();
    gpsHasEverWorked = true;

    currentLat = position.coords.latitude;
    currentLon = position.coords.longitude;
    currentAlt = position.coords.altitude || 0;
    currentAccuracy = position.coords.accuracy || 0;

    if (gpsCoordsEl) gpsCoordsEl.textContent = `${currentLat.toFixed(6)}, ${currentLon.toFixed(6)}`;
    if (altitudeEl) altitudeEl.textContent = `Alt: ${formatAltitude(currentAlt)}`;

    updateAccuracyDisplay(currentAccuracy);

    // try reverse geocode + weather
    maybeUpdateCustomLocationFromWeb(currentLat, currentLon);
}

function handleGPSError(error) {
    const code = Number(error?.code);
    let message = 'GPS Error';
    let duration = 3000;

    if (code === 1) {
        message = 'GPS permission denied';
        duration = 5000;
        if (gpsCoordsEl) gpsCoordsEl.textContent = 'Permission Denied';
    } else if (code === 2) {
        message = 'GPS position unavailable';
        if (!gpsHasEverWorked && gpsCoordsEl) gpsCoordsEl.textContent = 'GPS Unavailable';
    } else if (code === 3) {
        message = 'GPS timeout';
        if (!gpsHasEverWorked && Date.now() - gpsLastUpdateTime > 60000 && gpsCoordsEl) gpsCoordsEl.textContent = 'GPS Signal Weak';
    }

    if (code !== 3 || !gpsHasEverWorked) showStatus('❌ ' + message, duration);
}

// Reverse geocode (Nominatim) with throttling + cache
let locationUserEdited = false;
let lastReverseGeocodeAt = 0;
let lastReverseGeocodeKey = '';
const geocodeCache = new Map();
const CACHE_EXPIRY = 3600000;

function shouldAutoUpdateCustomLocation() {
    const currentValue = (customLocationInput?.value ?? settings.customLocation) || '';
    const trimmed = String(currentValue).trim();
    if (locationUserEdited && trimmed) return false;
    return !trimmed || trimmed === 'Riyadh Province';
}

async function reverseGeocodeFromWeb(lat, lon) {
    const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) return cached.label;

    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=12&addressdetails=1&accept-language=${encodeURIComponent(currentLang)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'User-Agent': 'LensLightApp/1.0' },
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`Reverse geocode failed: ${res.status}`);

        const data = await res.json();
        const addr = data?.address;
        const parts = [];
        const city = addr?.city || addr?.town || addr?.village || addr?.suburb;
        const state = addr?.state || addr?.region || addr?.county;
        const country = addr?.country;

        if (city) parts.push(city);
        if (state && state !== city) parts.push(state);
        if (country && country !== state) parts.push(country);

        const label = parts.filter(Boolean).join(', ') || data?.display_name || '';
        geocodeCache.set(cacheKey, { label, timestamp: Date.now() });
        if (geocodeCache.size > 50) geocodeCache.delete(geocodeCache.keys().next().value);

        return label;
    } catch (e) {
        if (e?.name !== 'AbortError') console.warn('reverseGeocodeFromWeb failed', e);
        return '';
    }
}

function maybeUpdateCustomLocationFromWeb(lat, lon) {
    try {
        if (!navigator.onLine) return;
        if (!shouldAutoUpdateCustomLocation()) return;

        const now = Date.now();
        if (now - lastReverseGeocodeAt < 60_000) return;

        const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
        if (key === lastReverseGeocodeKey && now - lastReverseGeocodeAt < 300_000) return;

        lastReverseGeocodeAt = now;
        lastReverseGeocodeKey = key;

        // show fetching state
        if (locationNameEl) {
            locationNameEl.textContent = currentLang === 'ar' ? 'الموقع: 📍 جارٍ جلب الموقع...' : 'Location: 📍 Fetching location...';
        }

        fetchWeatherData(lat, lon);

        reverseGeocodeFromWeb(lat, lon)
            .then((label) => {
                const cleaned = String(label || '').trim();
                if (!cleaned) {
                    if (locationNameEl) {
                        locationNameEl.textContent = currentLang === 'ar'
                            ? `الموقع: ${settings.customLocation || ''}`
                            : `Location: ${settings.customLocation || ''}`;
                    }
                    return;
                }

                if (customLocationInput && !locationUserEdited) customLocationInput.value = cleaned;
                settings.customLocation = cleaned;
                saveSettings();

                if (locationNameEl) {
                    locationNameEl.textContent = currentLang === 'ar' ? `الموقع: ${cleaned}` : `Location: ${cleaned}`;
                }
            })
            .catch(() => {
                if (locationNameEl) {
                    locationNameEl.textContent = currentLang === 'ar'
                        ? `الموقع: ${settings.customLocation || ''}`
                        : `Location: ${settings.customLocation || ''}`;
                }
            });
    } catch (e) {
        console.warn('maybeUpdateCustomLocationFromWeb failed', e);
    }
}

// Weather (Open-Meteo)
let weatherData = { temp: null, feelsLike: null, description: '', windSpeed: null, windDirection: null, humidity: null, pressure: null, lastUpdate: 0 };
let lastWeatherFetch = 0;

function getWeatherDescription(code) {
    const weatherCodes = {
        0: 'Clear sky',
        1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
        45: 'Foggy', 48: 'Depositing rime fog',
        51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
        61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
        71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
        80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
        95: 'Thunderstorm'
    };
    return weatherCodes[code] || 'Unknown';
}

function getWindDirection(deg) {
    if (deg === null || deg === undefined) return '';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(deg / 45) % 8];
}

function updateWeatherDisplay() {
    if (!weatherInfoEl) return;
    if (weatherData.temp === null || weatherData.temp === undefined) {
        weatherInfoEl.style.display = 'none';
        return;
    }

    const tempUnit = settings.units === 'imperial' ? '°F' : '°C';
    const speedUnit = settings.units === 'imperial' ? 'mph' : 'm/s';

    let html = `<div class="data-line large-text">${Math.round(weatherData.temp)}${tempUnit}</div>`;
    if (weatherData.description) html += `<div class="data-line small-text">${weatherData.description}</div>`;
    if (weatherData.windSpeed !== null) {
        html += `<div class="data-line small-text">💨 ${weatherData.windSpeed.toFixed(1)} ${speedUnit} ${getWindDirection(weatherData.windDirection)}</div>`;
    }
    if (weatherData.humidity !== null) {
        html += `<div class="data-line small-text">💧 ${weatherData.humidity}%</div>`;
    }

    weatherInfoEl.innerHTML = html;
    weatherInfoEl.style.display = 'block';
}

async function fetchWeatherData(lat, lon) {
    const now = Date.now();
    if (now - lastWeatherFetch < 600000) return;
    if (!navigator.onLine || !lat || !lon) return;

    try {
        const tempUnit = settings.units === 'imperial' ? 'fahrenheit' : 'celsius';
        const windUnit = settings.units === 'imperial' ? 'mph' : 'ms';

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) return;
        const data = await res.json();
        const cur = data?.current;
        if (!cur) return;

        weatherData.temp = cur.temperature_2m ?? null;
        weatherData.feelsLike = cur.apparent_temperature ?? null;
        weatherData.description = getWeatherDescription(cur.weather_code);
        weatherData.windSpeed = cur.wind_speed_10m ?? null;
        weatherData.windDirection = cur.wind_direction_10m ?? null;
        weatherData.humidity = cur.relative_humidity_2m ?? null;
        weatherData.pressure = cur.surface_pressure ?? null;
        weatherData.lastUpdate = now;

        lastWeatherFetch = now;
        updateWeatherDisplay();

    } catch (e) {
        if (e?.name !== 'AbortError') console.warn('fetchWeatherData failed', e);
    }
}

// -----------------------------
// Wake lock (battery friendly)
// -----------------------------
let wakeLock = null;
async function requestWakeLock() {
    try {
        if (!('wakeLock' in navigator)) return;
        if (wakeLock) await wakeLock.release().catch(() => {});
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {});
    } catch (e) {
        console.warn('wakeLock failed', e);
    }
}

async function releaseWakeLock() {
    if (!wakeLock) return;
    try {
        await wakeLock.release();
    } catch {}
    wakeLock = null;
}

// iOS viewport height fix
function updateAppVh() {
    document.documentElement.style.setProperty('--app-vh', String(window.innerHeight));
}

// -----------------------------
// Service worker
// -----------------------------
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol === 'file:') return;

    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('./sw.js')
            .then((reg) => {
                // update hourly
                setInterval(() => reg.update(), 60 * 60 * 1000);
            })
            .catch((err) => console.warn('SW registration failed (not critical):', err?.message || err));

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    });
}

// -----------------------------
// Events wiring
// -----------------------------
function checkStoredPermissionsAndBootstrap() {
    const cameraGranted = localStorage.getItem('camera_granted') === 'true';
    const sensorsGranted = localStorage.getItem('sensors_granted') === 'true';

    if (cameraGranted && sensorsGranted) {
        permBtn.style.display = 'none';
        initCamera();
        startSensors();
        return;
    }

    if (cameraGranted) {
        initCamera();
        permBtn.textContent = t('enableGPS');
        permBtn.style.display = 'block';
        return;
    }

    permBtn.textContent = t('enableCamera');
    permBtn.style.display = 'block';
}

permBtn?.addEventListener('click', async () => {
    permBtn.disabled = true;

    try {
        const cameraGranted = localStorage.getItem('camera_granted') === 'true';
        if (!cameraGranted) {
            await initCamera();
        }

        if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission !== 'granted') {
                showStatus(t('permissionDenied'), 3000);
                permBtn.disabled = false;
                return;
            }
        }

        localStorage.setItem('sensors_granted', 'true');
        permBtn.style.display = 'none';
        showStatus(t('sensorsEnabled'), 2000);
        startSensors();

    } catch (e) {
        console.error('permission flow failed', e);
        showStatus('❌ Permission failed: ' + (e?.message || 'Unknown'), 3000);
        permBtn.disabled = false;
    }
});

shutterBtn?.addEventListener('click', () => {
    if (featureState.timerDelay > 0) startTimerCapture();
    else performCapture();
});

flipCameraBtn?.addEventListener('click', async () => {
    settings.cameraFacingMode = settings.cameraFacingMode === 'user' ? 'environment' : 'user';
    saveSettings();
    await initCamera();
});

zoomInBtn?.addEventListener('click', () => {
    zoomLevel = clamp(zoomLevel + 0.5, 1, 3);
    applyZoom();
});

zoomOutBtn?.addEventListener('click', () => {
    zoomLevel = clamp(zoomLevel - 0.5, 1, 3);
    applyZoom();
});

// Settings panel
settingsBtn?.addEventListener('click', () => settingsPanel?.classList.add('open'));
closeSettingsBtn?.addEventListener('click', () => {
    settingsPanel?.classList.remove('open');
    saveSettings();
});

projectNameInput?.addEventListener('change', (e) => {
    settings.projectName = sanitizeInput(e.target.value);
    saveSettings();
});

customLocationInput?.addEventListener('change', (e) => {
    locationUserEdited = true;
    settings.customLocation = sanitizeInput(e.target.value);
    if (locationNameEl) {
        locationNameEl.textContent = currentLang === 'ar'
            ? `الموقع: ${settings.customLocation}`
            : `Location: ${settings.customLocation}`;
    }
    saveSettings();
});

unitsSelect?.addEventListener('change', (e) => {
    settings.units = e.target.value;
    saveSettings();
    updateWeatherDisplay();
});

languageSelect?.addEventListener('change', (e) => {
    settings.language = e.target.value;
    saveSettings();
    setLanguage(settings.language);
    renderGallery();
});

qualitySelect?.addEventListener('change', (e) => {
    settings.imageQuality = parseFloat(e.target.value);
    saveSettings();
});

toggleCompass?.addEventListener('change', (e) => {
    settings.showCompass = e.target.checked;
    if (compassContainer) compassContainer.style.display = settings.showCompass ? 'flex' : 'none';
    saveSettings();
});

toggleData?.addEventListener('change', (e) => {
    settings.showData = e.target.checked;
    if (dataContainer) dataContainer.style.display = settings.showData ? 'block' : 'none';
    saveSettings();
});

toggleWatermark?.addEventListener('change', (e) => {
    settings.watermark = e.target.checked;
    saveSettings();
});

toggleSound?.addEventListener('change', (e) => {
    settings.cameraSound = e.target.checked;
    saveSettings();
});

clearAllDataBtn?.addEventListener('click', async () => {
    if (!confirm(t('confirmClearAllData'))) return;

    try {
        await clearAllPhotos();
        photos = [];
        selectedPhotos.clear();
        revokeAllPhotoObjectUrls();

        localStorage.clear();

        settings = {
            ...settings,
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

        loadSettings();
        updateGalleryUI();
        renderGallery();
        showStatus(t('dataCleared'), 2500);
        settingsPanel?.classList.remove('open');

    } catch (e) {
        console.error('clear all data failed', e);
        showStatus('❌ Failed to clear data', 3000);
    }
});

// Gallery modal
galleryBtn?.addEventListener('click', () => {
    galleryModal?.classList.add('open');
    renderGallery();
    if (photos.length > 0) selectModeBtn.style.display = 'block';
});

closeGalleryBtn?.addEventListener('click', () => {
    exitSelectMode();
    closePhotoViewer();
    revokeAllPhotoObjectUrls();
    galleryModal?.classList.remove('open');
});

selectModeBtn?.addEventListener('click', enterSelectMode);
cancelSelectBtn?.addEventListener('click', exitSelectMode);

selectAllBtn?.addEventListener('click', () => {
    if (!isSelectMode) return;
    const allIds = photos.map((p) => p.id);
    const isAllSelected = allIds.length > 0 && allIds.every((id) => selectedPhotos.has(id));

    selectedPhotos = isAllSelected ? new Set() : new Set(allIds);

    document.querySelectorAll('.gallery-item').forEach((item) => {
        const id = Number(item.dataset.photoId);
        const checked = selectedPhotos.has(id);
        item.classList.toggle('selected', checked);
        const cb = item.querySelector('.gallery-item-checkbox');
        if (cb) cb.checked = checked;
    });

    updateSelectAllButton();
});

shareSelectedBtn?.addEventListener('click', () => {
    if (selectedPhotos.size === 0) return showStatus('⚠️ No photos selected', 2000);
    shareSelectedPhotos();
});

downloadSelectedBtn?.addEventListener('click', () => {
    if (selectedPhotos.size === 0) return showStatus('⚠️ No photos selected', 2000);
    downloadSelectedPhotos();
});

deleteSelectedBtn?.addEventListener('click', () => {
    if (selectedPhotos.size === 0) return showStatus('⚠️ No photos selected', 2000);
    deleteSelectedPhotos();
});

// Photo viewer actions
closePhotoViewerBtn?.addEventListener('click', closePhotoViewer);

viewerShareBtn?.addEventListener('click', async () => {
    if (!viewedPhotoId) return;
    const record = await dbGetPhoto(viewedPhotoId);
    if (!record?.blob) return showStatus(t('photoMissing'), 2500);

    const meta = photos.find((p) => p.id === viewedPhotoId) || { id: viewedPhotoId, timestamp: new Date().toISOString(), projectName: settings.projectName };
    const filename = getPhotoFilename(meta);

    const shared = await shareBlob(record.blob, filename);
    if (shared) showStatus('✓ Shared', 2000);
    else {
        downloadBlob(record.blob, filename);
        showStatus('✓ Saved', 2000);
    }
});

viewerSaveBtn?.addEventListener('click', async () => {
    if (!viewedPhotoId) return;
    const record = await dbGetPhoto(viewedPhotoId);
    if (!record?.blob) return showStatus(t('photoMissing'), 2500);

    const meta = photos.find((p) => p.id === viewedPhotoId) || { id: viewedPhotoId, timestamp: new Date().toISOString(), projectName: settings.projectName };
    downloadBlob(record.blob, getPhotoFilename(meta));
    showStatus('✓ Saved', 1500);
});

viewerCommentBtn?.addEventListener('click', async () => {
    if (!viewedPhotoId) return;
    const record = await dbGetPhoto(viewedPhotoId);
    if (!record) return showStatus(t('photoMissing'), 2500);

    const existing = String(record.comment || '').trim();
    const next = prompt(t('commentPrompt'), existing);
    if (next === null) return;

    record.comment = String(next).trim();
    await dbPutPhoto(record);

    const idx = photos.findIndex((p) => p.id === viewedPhotoId);
    if (idx >= 0) photos[idx].comment = record.comment;

    if (photoViewerComment) {
        if (record.comment) {
            photoViewerComment.textContent = record.comment;
            photoViewerComment.style.display = 'block';
        } else {
            photoViewerComment.textContent = '';
            photoViewerComment.style.display = 'none';
        }
    }

    showStatus(t('commentSaved'), 1500);
});

viewerDeleteBtn?.addEventListener('click', async () => {
    if (!viewedPhotoId) return;
    if (!confirm(t('deleteThisPhoto'))) return;
    const id = viewedPhotoId;
    closePhotoViewer();
    await deletePhoto(id);
    renderGallery();
});

// Share button
shareBtn?.addEventListener('click', () => {
    if (lastCapturedPhotoId) {
        shareLastCapturedPhoto();
        return;
    }

    if (photos.length > 0) {
        galleryModal?.classList.add('open');
        renderGallery();
        showStatus(currentLang === 'ar' ? 'اختر صورة للمشاركة/الحفظ' : 'Select a photo to share/save', 2000);
        return;
    }

    fileInput?.click();
});

async function shareLastCapturedPhoto() {
    try {
        const record = await dbGetPhoto(lastCapturedPhotoId);
        if (!record?.blob) {
            lastCapturedPhotoId = null;
            showStatus(t('photoMissing'), 2500);
            return;
        }

        const meta = photos.find((p) => p.id === lastCapturedPhotoId) || { id: lastCapturedPhotoId, timestamp: new Date().toISOString(), projectName: settings.projectName };
        const filename = getPhotoFilename(meta);

        const shared = await shareBlob(record.blob, filename);
        if (shared) showStatus('✓ Shared', 2000);
        else {
            downloadBlob(record.blob, filename);
            showStatus('✓ Saved', 2000);
        }
    } catch (e) {
        console.warn('shareLastCapturedPhoto failed', e);
        showStatus('❌ Share failed', 2500);
    }
}

fileInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!navigator.share) {
        showStatus('❌ Sharing not supported', 3000);
        fileInput.value = '';
        return;
    }

    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        showStatus('❌ Sharing not available for this file', 3000);
        fileInput.value = '';
        return;
    }

    try {
        await navigator.share({ files: [file], title: t('shareTitle'), text: t('shareText') });
        showStatus('✓ Shared', 2000);
    } catch (e) {
        if (e?.name !== 'AbortError') showStatus('❌ Share failed', 3000);
    }

    fileInput.value = '';
});

// Feature buttons
gridBtn?.addEventListener('click', () => {
    featureState.gridEnabled = !featureState.gridEnabled;
    applyFeatureUI();
    showStatus(featureState.gridEnabled ? '⊞ Grid ON' : '⊞ Grid OFF', 1500);
});

levelBtn?.addEventListener('click', () => {
    featureState.levelEnabled = !featureState.levelEnabled;
    applyFeatureUI();
    showStatus(featureState.levelEnabled ? '⚖️ Level ON' : '⚖️ Level OFF', 1500);
});

timerBtn?.addEventListener('click', () => {
    timerMenu?.classList.toggle('active');
    timerBtn.setAttribute('aria-expanded', timerMenu?.classList.contains('active') ? 'true' : 'false');
});

// Timer options
Array.from(document.querySelectorAll('.timer-option')).forEach((opt) => {
    opt.addEventListener('click', () => {
        const time = parseInt(opt.dataset.time, 10) || 0;
        featureState.timerDelay = time;

        document.querySelectorAll('.timer-option').forEach((o) => {
            o.classList.toggle('selected', o === opt);
            o.setAttribute('aria-checked', o === opt ? 'true' : 'false');
            o.tabIndex = o === opt ? 0 : -1;
        });

        timerBtn?.classList.toggle('active', time > 0);
        timerMenu?.classList.remove('active');
        timerBtn?.setAttribute('aria-expanded', 'false');

        showStatus(time > 0 ? `⏱️ Timer: ${time}s` : '⏱️ Timer OFF', 1500);
    });
});

flashlightBtn?.addEventListener('click', async () => {
    if (!videoStream) return;

    try {
        const track = videoStream.getVideoTracks()[0];
        const caps = track.getCapabilities?.() || {};
        if (!caps.torch) {
            showStatus('🔦 Flashlight not supported', 2000);
            return;
        }

        featureState.flashlightOn = !featureState.flashlightOn;
        await track.applyConstraints({ advanced: [{ torch: featureState.flashlightOn }] });
        flashlightBtn.classList.toggle('active', featureState.flashlightOn);
        showStatus(featureState.flashlightOn ? '🔦 Flashlight ON' : '🔦 Flashlight OFF', 1500);

    } catch (e) {
        console.warn('flashlight failed', e);
        showStatus('🔦 Flashlight unavailable', 2000);
    }
});

filterBtn?.addEventListener('click', () => {
    filterMenu?.classList.toggle('active');
    filterBtn.setAttribute('aria-expanded', filterMenu?.classList.contains('active') ? 'true' : 'false');
});

Array.from(document.querySelectorAll('.filter-option')).forEach((opt) => {
    opt.addEventListener('click', () => {
        const filter = opt.dataset.filter || 'normal';
        featureState.currentFilter = filter;

        document.querySelectorAll('.filter-option').forEach((o) => {
            o.classList.toggle('selected', o === opt);
            o.setAttribute('aria-checked', o === opt ? 'true' : 'false');
            o.tabIndex = o === opt ? 0 : -1;
        });

        filterBtn?.classList.toggle('active', filter !== 'normal');
        filterMenu?.classList.remove('active');
        filterBtn?.setAttribute('aria-expanded', 'false');

        applyPreviewEffects();
        showStatus(`🎨 Filter: ${filter}`, 1500);
    });
});

exposureBtn?.addEventListener('click', () => {
    const isActive = exposureControl?.classList.toggle('active');
    exposureBtn.classList.toggle('active', Boolean(isActive));
});

exposureSlider?.addEventListener('input', async (e) => {
    const value = parseFloat(e.target.value);
    featureState.exposureValue = clamp(value, -2, 2);

    if (!videoStream) {
        applyPreviewEffects();
        return;
    }

    try {
        const track = videoStream.getVideoTracks()[0];
        const caps = track.getCapabilities?.() || {};
        if (caps.exposureCompensation) {
            const min = caps.exposureCompensation.min ?? -2;
            const max = caps.exposureCompensation.max ?? 2;
            const v = clamp(featureState.exposureValue, min, max);
            await track.applyConstraints({ advanced: [{ exposureCompensation: v }] });
        } else {
            applyPreviewEffects();
        }
    } catch {
        applyPreviewEffects();
    }
});

burstBtn?.addEventListener('click', () => {
    featureState.burstMode = !featureState.burstMode;
    featureState.burstCount = 0;
    const burstCounter = burstIndicator?.querySelector('.burst-counter');
    if (burstCounter) burstCounter.textContent = `0/${featureState.maxBurstPhotos}`;

    applyFeatureUI();
    showStatus(featureState.burstMode ? '📸 Burst Mode ON' : '📸 Burst Mode OFF', 1500);
});

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (timerBtn && timerMenu && !timerBtn.contains(e.target) && !timerMenu.contains(e.target)) {
        timerMenu.classList.remove('active');
        timerBtn.setAttribute('aria-expanded', 'false');
    }
    if (filterBtn && filterMenu && !filterBtn.contains(e.target) && !filterMenu.contains(e.target)) {
        filterMenu.classList.remove('active');
        filterBtn.setAttribute('aria-expanded', 'false');
    }
    if (exposureBtn && exposureControl && !exposureBtn.contains(e.target) && !exposureControl.contains(e.target)) {
        exposureControl.classList.remove('active');
        exposureBtn.classList.remove('active');
    }
});

// Time update
setInterval(() => {
    if (!dateTimeEl) return;
    const now = new Date();
    dateTimeEl.textContent = now.toLocaleString(currentLang === 'ar' ? 'ar' : 'en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}, 1000);

// Wake lock events
video?.addEventListener('play', requestWakeLock);
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && video && !video.paused) {
        requestWakeLock();
    } else if (document.visibilityState === 'hidden') {
        await releaseWakeLock();
    }
});

window.addEventListener('beforeunload', () => {
    stopSensors();
    if (videoStream) {
        try { videoStream.getTracks().forEach((t) => t.stop()); } catch {}
    }
    releaseWakeLock();
    if (featureState.countdownIntervalId) clearInterval(featureState.countdownIntervalId);
});

window.addEventListener('resize', updateAppVh);
window.addEventListener('orientationchange', updateAppVh);

// -----------------------------
// Bootstrap
// -----------------------------
updateAppVh();
loadSettings();
applyFeatureUI();

await loadPhotos();

checkStoredPermissionsAndBootstrap();
registerServiceWorker();

// Make sure UI count reflects DB
updateGalleryUI();
