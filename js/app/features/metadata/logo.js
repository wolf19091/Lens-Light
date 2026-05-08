/**
 * Loads the Lens Light SVG logo and rasterises it to a PNG data URL so it can
 * be embedded into PDF (jsPDF.addImage requires PNG/JPEG) and Excel
 * (ExcelJS.workbook.addImage requires raster bytes) exports.
 *
 * The HTML fallback paths use the SVG directly via {@link LOGO_PUBLIC_URL}.
 */

const LOGO_PATH = new URL('../../../../logo-max-ar-inv.svg', import.meta.url).href;

let cachedLogoPromise = null;

export function loadLogoForExport({ targetHeightPx = 96 } = {}) {
  if (cachedLogoPromise) return cachedLogoPromise;

  cachedLogoPromise = new Promise((resolve) => {
    const img = new Image();
    const onFail = () => resolve({ dataUrl: '', width: 0, height: 0 });

    img.onload = () => {
      try {
        const ratio = (img.naturalWidth || 1) / (img.naturalHeight || 1);
        const height = targetHeightPx;
        const width = Math.max(1, Math.round(height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve({ dataUrl: canvas.toDataURL('image/png'), width, height });
      } catch {
        onFail();
      }
    };
    img.onerror = onFail;
    img.src = LOGO_PATH;
  });

  return cachedLogoPromise;
}

export const LOGO_PUBLIC_URL = LOGO_PATH;
