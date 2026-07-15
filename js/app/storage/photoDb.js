// IndexedDB (photos)

import { isDebugModeEnabled } from '../core/utils.js';

export const DB_NAME = 'lens_light_db';
export const DB_VERSION = 1;
export const PHOTO_STORE = 'photos';

let dbPromise = null;
let dbInstance = null;

const debugLog = (...args) => {
  if (isDebugModeEnabled()) console.log(...args);
};

/**
 * Drops the cached connection so the next operation opens a fresh one.
 *
 * iOS/WebKit severs IndexedDB connections while the app is backgrounded
 * (which is exactly what happens during an export: the share sheet or the
 * opened file pushes the PWA to the background). Reusing the dead cached
 * connection makes every subsequent request hang forever — the app looks
 * completely frozen until it is force-closed. Called from the lifecycle
 * resume hooks and from the automatic retry in withStore().
 */
export function resetPhotoDbConnection() {
  const db = dbInstance;
  dbInstance = null;
  dbPromise = null;
  if (db) {
    try { db.close(); } catch {}
  }
}

export function openPhotoDb() {
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
      dbInstance = db;
      try {
        db.onversionchange = () => {
          try {
            db.close();
          } catch {}
        };
        // Fired when the BROWSER closes the connection behind our back
        // (iOS background suspension, storage pressure). Clear the cache
        // so the next operation reconnects instead of hanging.
        db.onclose = () => {
          if (dbInstance === db) {
            dbInstance = null;
            dbPromise = null;
          }
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

/**
 * Opens a transaction on the photo store and hands it to `run`.
 * If the cached connection was closed by the browser while the app was
 * backgrounded, db.transaction() throws InvalidStateError — reconnect
 * once and retry so the caller never sees the stale-connection failure.
 */
async function withStore(mode, run) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const db = await openPhotoDb();
    let tx;
    try {
      tx = db.transaction(PHOTO_STORE, mode);
    } catch (err) {
      if (err?.name === 'InvalidStateError' && attempt === 0) {
        debugLog('♻️ IndexedDB connection was closed — reconnecting');
        resetPhotoDbConnection();
        continue;
      }
      throw err;
    }
    return run(tx, tx.objectStore(PHOTO_STORE));
  }
  throw new Error('IndexedDB unavailable');
}

export async function dbPutPhoto(record) {
  debugLog('💾 IndexedDB PUT:', {
    id: record.id,
    blobSize: record.blob?.size,
    timestamp: record.timestamp
  });

  return withStore('readwrite', (tx, store) => new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      debugLog('✅ IndexedDB PUT complete:', record.id);
      resolve();
    };

    tx.onerror = () => {
      const error = tx.error || new Error('IndexedDB put failed');
      console.error('❌ IndexedDB PUT error:', error, {
        name: error.name,
        message: error.message,
        code: error.code
      });

      // User-friendly error messages
      if (error.name === 'QuotaExceededError') {
        reject(new Error('Storage full! Please delete old photos.'));
      } else if (error.name === 'ConstraintError') {
        reject(new Error('Photo ID already exists. Please try again.'));
      } else {
        reject(error);
      }
    };

    tx.onabort = () => {
      const error = tx.error || new Error('IndexedDB transaction aborted');
      console.error('❌ IndexedDB transaction aborted:', error);
      reject(error);
    };

    const req = store.put(record);
    req.onerror = () => {
      try {
        tx.abort();
      } catch {}
    };
  }));
}

export async function dbDeletePhoto(id) {
  debugLog('🗑️ IndexedDB DELETE:', id);

  return withStore('readwrite', (tx, store) => new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      debugLog('✅ IndexedDB DELETE complete:', id);
      resolve();
    };
    tx.onerror = () => {
      console.error('IndexedDB delete error:', tx.error);
      reject(tx.error || new Error('IndexedDB delete failed'));
    };
    tx.onabort = () => {
      console.error('IndexedDB delete aborted:', tx.error);
      reject(tx.error || new Error('IndexedDB delete aborted'));
    };
    const req = store.delete(id);
    req.onerror = () => {
      try {
        tx.abort();
      } catch {}
    };
  }));
}

export async function dbGetPhoto(id) {
  return withStore('readonly', (tx, store) => new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
  }));
}

// metadata-only read (excludes blob)
export async function dbGetAllPhotosMeta() {
  return withStore('readonly', (tx, store) => new Promise((resolve, reject) => {
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
  }));
}

export async function clearAllPhotos() {
  return withStore('readwrite', (tx, store) => new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('IndexedDB clear failed'));
  }));
}

// Legacy migration (base64 localStorage)
export async function migrateLegacyLocalStoragePhotos() {
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
    try {
      localStorage.removeItem(legacyKey);
    } catch {}
  }
}
