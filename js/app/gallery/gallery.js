import { state } from '../state.js';
import { notifyPhotosChanged } from '../core/utils.js';
import {
  dbGetAllPhotosMeta,
  migrateLegacyLocalStoragePhotos,
  openPhotoDb
} from '../storage/photoDb.js';
import { updateGalleryUI } from './render.js';

export {
  createGalleryObserver,
  deletePhoto,
  enterSelectMode,
  exitSelectMode,
  getActiveProjectName,
  getGalleryPhotos,
  getProjectPhotoCount,
  renderGallery,
  revokeAllPhotoObjectUrls,
  updateGalleryUI,
  updateSelectAllButton
} from './render.js';

export {
  closePhotoViewer,
  openPhotoViewer,
  updatePhotoComment
} from './viewer.js';

export {
  deleteSelectedPhotos,
  downloadSelectedPhotos,
  getPhotoFilename,
  shareLastCapturedPhoto,
  shareSelectedPhotos
} from './bulk-actions.js';

export async function loadPhotos(dom) {
  await openPhotoDb();
  await migrateLegacyLocalStoragePhotos();

  const records = await dbGetAllPhotosMeta();
  state.photos = records
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

  updateGalleryUI(dom);
  notifyPhotosChanged();
}
