// IndexedDB (photos)

export const DB_NAME = 'lens_light_db';
export const DB_VERSION = 1;
export const PHOTO_STORE = 'photos';

let dbPromise = null;

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
      try {
        db.onversionchange = () => {
          try {
            db.close();
          } catch {}
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

export async function dbPutPhoto(record) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      console.error('IndexedDB put error:', tx.error);
      reject(tx.error || new Error('IndexedDB put failed'));
    };
    tx.onabort = () => {
      console.error('IndexedDB transaction aborted:', tx.error);
      reject(tx.error || new Error('IndexedDB transaction aborted'));
    };
    const req = tx.objectStore(PHOTO_STORE).put(record);
    req.onerror = () => {
      try {
        tx.abort();
      } catch {}
    };
  });
}

export async function dbDeletePhoto(id) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      console.error('IndexedDB delete error:', tx.error);
      reject(tx.error || new Error('IndexedDB delete failed'));
    };
    tx.onabort = () => {
      console.error('IndexedDB delete aborted:', tx.error);
      reject(tx.error || new Error('IndexedDB delete aborted'));
    };
    const req = tx.objectStore(PHOTO_STORE).delete(id);
    req.onerror = () => {
      try {
        tx.abort();
      } catch {}
    };
  });
}

export async function dbGetPhoto(id) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const req = tx.objectStore(PHOTO_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
  });
}

// metadata-only read (excludes blob)
export async function dbGetAllPhotosMeta() {
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

export async function clearAllPhotos() {
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
