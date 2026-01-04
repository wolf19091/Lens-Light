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
    confirmClearAllData:
      'هل أنت متأكد من رغبتك في مسح جميع البيانات؟ سيؤدي هذا إلى حذف جميع الصور والإعدادات. لا يمكن التراجع عن هذا الإجراء!',
    dataCleared: '✓ تم مسح جميع البيانات بنجاح!'
  }
};

export const t = (key) => (translations[state.currentLang] && translations[state.currentLang][key]) || translations.en[key] || key;

export function setLanguage(lang, dom) {
  state.currentLang = lang === 'ar' ? 'ar' : 'en';
  document.documentElement.lang = state.currentLang;
  document.documentElement.dir = state.currentLang === 'ar' ? 'rtl' : 'ltr';

  const cameraGranted = localStorage.getItem('camera_granted') === 'true';
  if (dom?.permBtn) dom.permBtn.textContent = cameraGranted ? t('enableGPS') : t('enableCamera');

  if (dom?.gpsCoordsEl && (/WAITING/i.test(dom.gpsCoordsEl.textContent) || /انتظار/i.test(dom.gpsCoordsEl.textContent))) {
    dom.gpsCoordsEl.textContent = t('waitingGPS');
  }
  if (dom?.locationNameEl && (/Unknown/i.test(dom.locationNameEl.textContent) || /غير معروف/.test(dom.locationNameEl.textContent))) {
    dom.locationNameEl.textContent = t('locationUnknown');
  }

  if (dom?.shareSelectedBtn) dom.shareSelectedBtn.textContent = state.currentLang === 'ar' ? '📤 مشاركة المحدد' : '📤 Share Selected';
  if (dom?.downloadSelectedBtn) dom.downloadSelectedBtn.textContent = state.currentLang === 'ar' ? '💾 حفظ المحدد' : '💾 Save Selected';
  if (dom?.deleteSelectedBtn) dom.deleteSelectedBtn.textContent = state.currentLang === 'ar' ? '🗑️ حذف المحدد' : '🗑️ Delete Selected';
  if (dom?.cancelSelectBtn) dom.cancelSelectBtn.textContent = state.currentLang === 'ar' ? 'إلغاء' : 'Cancel';
}
