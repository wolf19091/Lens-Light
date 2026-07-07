// Offline mode indicator.
//
// Shows a glass pill in the topbar while the device is offline and
// toasts the transition in both directions. Captures keep working
// offline (IndexedDB + service worker), so the copy reassures rather
// than warns.

import { state } from '../state.js';

export function initNetworkIndicator({ showStatus } = {}) {
  const pill = document.getElementById('offline-indicator');

  const sync = () => {
    pill?.classList.toggle('is-hidden', navigator.onLine);
  };

  window.addEventListener('online', () => {
    sync();
    showStatus?.(state.currentLang === 'ar' ? '✓ عاد الاتصال بالإنترنت' : '✓ Back online', 2000);
  });

  window.addEventListener('offline', () => {
    sync();
    showStatus?.(
      state.currentLang === 'ar'
        ? '📡 وضع عدم الاتصال — الصور تُحفظ محليًا'
        : '📡 Offline — photos still save locally',
      3000
    );
  });

  sync();
}
