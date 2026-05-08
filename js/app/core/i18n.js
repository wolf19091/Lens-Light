import { state } from '../state.js';

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
    confirmClearAllData:
      'Are you sure you want to clear all data? This will delete all photos and settings. This action cannot be undone!',
    dataCleared: '✓ All data has been cleared successfully!',

    // Project panel
    projectButtonLabel: 'Project tools',
    projectPanelTitle: '🗂️ Projects',
    projectNameLabel: '📝 Project Name',
    projectPlaceholder: 'e.g., Site Survey 2026',
    projectCopy: "Open a project like a file, then take photos, add photos, or open only that project's gallery.",
    projectOpenAction: 'Open Project',
    projectTakePhoto: '📸 Take Photo',
    projectOpenPhotos: '🖼️ Open Photos',
    projectAddPhotos: '➕ Add Photos',
    projectCloseAction: 'Close Project',
    projectFiles: 'Project Files',
    projectNoneOpen: 'No project open',
    projectNoneHint: 'Open or create a project to start taking and adding photos.',
    projectActiveLabel: 'Open project',
    projectNameRequired: '⚠️ Enter a project name first',
    projectNoSaved: 'No project files yet.',
    projectClose: 'Close',
    projectSaved: '✓ Project saved',
    projectCleared: '✓ Project cleared',
    projectImportFailed: '❌ Failed to add photos',
    projectNoImagesSelected: '⚠️ Select at least one image',
    // Parameterised — handled by tFmt below
    projectOpened: '✓ Opened {name}',
    projectClosed: '✓ Project closed',
    projectFileMeta: '{count} photo(s)',
    projectReadyForCapture: '📸 {name} ready for capture',
    projectAddedCount: '✓ Added {count} photo(s) to project'
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
    confirmClearAllData:
      'هل أنت متأكد من رغبتك في مسح جميع البيانات؟ سيؤدي هذا إلى حذف جميع الصور والإعدادات. لا يمكن التراجع عن هذا الإجراء!',
    dataCleared: '✓ تم مسح جميع البيانات بنجاح!',

    // Project panel
    projectButtonLabel: 'أدوات المشروع',
    projectPanelTitle: '🗂️ المشاريع',
    projectNameLabel: '📝 اسم المشروع',
    projectPlaceholder: 'مثال: مسح الموقع 2026',
    projectCopy: 'افتح المشروع كملف، ثم التقط صوراً أو أضفها إلى هذا المشروع فقط.',
    projectOpenAction: 'افتح المشروع',
    projectTakePhoto: '📸 التقط صورة',
    projectOpenPhotos: '🖼️ افتح الصور',
    projectAddPhotos: '➕ إضافة صور',
    projectCloseAction: 'إغلاق المشروع',
    projectFiles: 'ملفات المشروع',
    projectNoneOpen: 'لا يوجد مشروع مفتوح',
    projectNoneHint: 'افتح أو أنشئ مشروعاً لبدء التقاط الصور وإضافتها.',
    projectActiveLabel: 'المشروع المفتوح',
    projectNameRequired: '⚠️ أدخل اسم المشروع أولاً',
    projectNoSaved: 'لا توجد مشاريع بعد.',
    projectClose: 'إغلاق',
    projectSaved: '✓ تم حفظ المشروع',
    projectCleared: '✓ تم إغلاق المشروع',
    projectImportFailed: '❌ تعذر إضافة الصور',
    projectNoImagesSelected: '⚠️ اختر صورة واحدة على الأقل',
    projectOpened: '✓ تم فتح {name}',
    projectClosed: '✓ تم إغلاق المشروع',
    projectFileMeta: '{count} صورة',
    projectReadyForCapture: '📸 {name} جاهز للالتقاط',
    projectAddedCount: '✓ تمت إضافة {count} صورة إلى المشروع'
  }
};

export const t = (key) => (translations[state.currentLang] && translations[state.currentLang][key]) || translations.en[key] || key;

// Translate with positional placeholders: tFmt('projectOpened', { name: 'Site' })
export function tFmt(key, params = {}) {
  const template = t(key);
  return template.replace(/\{(\w+)\}/g, (_, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`
  ));
}

export function setLanguage(lang, dom) {
  state.currentLang = lang === 'ar' ? 'ar' : 'en';
  document.documentElement.lang = state.currentLang;
  document.documentElement.dir = state.currentLang === 'ar' ? 'rtl' : 'ltr';

  const cameraGranted = localStorage.getItem('camera_granted') === 'true';
  if (dom?.permBtn) dom.permBtn.textContent = cameraGranted ? t('enableGPS') : t('enableCamera');

  if (dom?.gpsCoordsEl && (/WAITING/i.test(dom.gpsCoordsEl.textContent) || /انتظار/i.test(dom.gpsCoordsEl.textContent))) {
    dom.gpsCoordsEl.textContent = translations.en.waitingGPS;
  }
  if (dom?.locationNameEl && (/Unknown/i.test(dom.locationNameEl.textContent) || /غير معروف/.test(dom.locationNameEl.textContent))) {
    dom.locationNameEl.textContent = translations.en.locationUnknown;
  }

  if (dom?.shareSelectedBtn) dom.shareSelectedBtn.textContent = state.currentLang === 'ar' ? '📤 مشاركة المحدد' : '📤 Share Selected';
  if (dom?.downloadSelectedBtn) dom.downloadSelectedBtn.textContent = state.currentLang === 'ar' ? '💾 حفظ المحدد' : '💾 Save Selected';
  if (dom?.deleteSelectedBtn) dom.deleteSelectedBtn.textContent = state.currentLang === 'ar' ? '🗑️ حذف المحدد' : '🗑️ Delete Selected';
  if (dom?.cancelSelectBtn) dom.cancelSelectBtn.textContent = state.currentLang === 'ar' ? 'إلغاء' : 'Cancel';
}
