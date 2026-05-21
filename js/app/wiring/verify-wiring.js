// Manual photo-code verifier — control-bar entry point.
//
// Lets the user type values straight off a photo's watermark (or a printed
// copy) and confirms whether the displayed Photo Code is a valid signature
// for those exact values. Mirrors the in-gallery verifier but accepts
// arbitrary input rather than reading from IndexedDB.

import { state } from '../state.js';
import { t } from '../core/i18n.js';
import { dbGetPhoto } from '../storage/photoDb.js';
import { generatePhotoCode } from '../features/photocode.js';

const VERIFIER_FIELDS = ['code', 'datetime', 'lat', 'lon'];

async function openVerifyModal(dom) {
  if (!dom.verifyModal) return;
  dom.verifyModal.classList.add('open');
  dom.verifyModal.setAttribute('aria-hidden', 'false');
  // Auto-fill from the most recent capture so the default state is a
  // working "verified" baseline. Users testing the feature get an immediate
  // success indication; users verifying someone else's photo can just edit
  // the fields they need to. Only auto-fill when the form is empty so we
  // don't clobber values the user has already typed.
  const codeEmpty = !dom.verifyCodeInput?.value?.trim();
  if (codeEmpty && state.lastCapturedPhotoId) {
    await fillFromLastPhoto(dom, { silent: true });
  }
  const firstInput = dom.verifyCodeInput;
  if (firstInput && !firstInput.value) firstInput.focus();
}

function closeVerifyModal(dom) {
  if (!dom.verifyModal) return;
  dom.verifyModal.classList.remove('open');
  dom.verifyModal.setAttribute('aria-hidden', 'true');
  dom.verifyBtn?.focus?.();
}

function clearResult(dom) {
  if (!dom.verifyResult) return;
  dom.verifyResult.textContent = '';
  dom.verifyResult.className = 'verify-result is-empty';
}

function setResult(dom, message, variant) {
  if (!dom.verifyResult) return;
  dom.verifyResult.textContent = message;
  dom.verifyResult.className = `verify-result is-${variant}`;
}

/**
 * Reads form values into the shape `generatePhotoCode` expects.
 * Empty optional fields stay as empty strings so they hash identically to a
 * photo captured without that field set.
 */
function readVerifierInputs(dom) {
  const code = String(dom.verifyCodeInput?.value || '').trim().toUpperCase();
  // datetime-local returns "YYYY-MM-DDTHH:MM" already in local time, which is
  // exactly the format the canonical normalizer expects.
  const datetime = String(dom.verifyDatetimeInput?.value || '').trim();
  const latRaw = String(dom.verifyLatInput?.value || '').trim();
  const lonRaw = String(dom.verifyLonInput?.value || '').trim();
  const latNum = latRaw === '' ? NaN : Number(latRaw);
  const lonNum = lonRaw === '' ? NaN : Number(lonRaw);

  return {
    code,
    metadata: {
      localTimestampMinute: datetime,
      lat: latNum,
      lon: lonNum
    }
  };
}

async function runVerification(dom) {
  const { code, metadata } = readVerifierInputs(dom);

  if (!code) {
    setResult(dom, t('verifyMissingCode'), 'info');
    return;
  }
  if (!metadata.localTimestampMinute) {
    setResult(dom, t('verifyMissingDatetime'), 'info');
    return;
  }
  if (!Number.isFinite(metadata.lat) || !Number.isFinite(metadata.lon)) {
    setResult(dom, t('verifyMissingCoords'), 'info');
    return;
  }

  try {
    const expected = await generatePhotoCode(metadata);
    if (!expected) {
      setResult(dom, t('codeVerifyError'), 'mismatch');
      return;
    }
    if (expected === code) {
      setResult(dom, `${t('verifySignatureMatch')}  (${expected})`, 'match');
    } else {
      setResult(dom, `${t('verifySignatureMismatch')}  (${code} ≠ ${expected})`, 'mismatch');
    }
  } catch (err) {
    console.warn('manual verify failed', err);
    setResult(dom, t('codeVerifyError'), 'mismatch');
  }
}

/**
 * Pre-fills the form from the most recently captured photo. Saves the user
 * from typing when they want to sanity-check the feature, and gives them a
 * working baseline to mutate one field at a time to see what breaks the hash.
 */
async function fillFromLastPhoto(dom, { silent = false } = {}) {
  if (!state.lastCapturedPhotoId) {
    if (!silent) setResult(dom, t('verifyNoLastPhoto'), 'info');
    return;
  }
  const record = await dbGetPhoto(state.lastCapturedPhotoId);
  if (!record) {
    if (!silent) setResult(dom, t('verifyNoLastPhoto'), 'info');
    return;
  }

  if (dom.verifyCodeInput) dom.verifyCodeInput.value = record.photoCode || '';
  if (dom.verifyDatetimeInput) {
    // datetime-local needs "YYYY-MM-DDTHH:MM" (local time). The record's
    // localTimestampMinute is "YYYY-MM-DD HH:MM" — swap the separator.
    const local = (record.localTimestampMinute || '').replace(' ', 'T');
    dom.verifyDatetimeInput.value = local;
  }
  if (dom.verifyLatInput) dom.verifyLatInput.value = Number.isFinite(record.lat) ? record.lat.toFixed(6) : '';
  if (dom.verifyLonInput) dom.verifyLonInput.value = Number.isFinite(record.lon) ? record.lon.toFixed(6) : '';
  clearResult(dom);
}

function bindFormReset(dom) {
  // Any edit invalidates the previous result — clearing it stops the user
  // from misreading a stale "match" status against newly-edited inputs.
  for (const key of VERIFIER_FIELDS) {
    const input = dom[`verify${key[0].toUpperCase()}${key.slice(1)}Input`];
    input?.addEventListener('input', () => clearResult(dom));
  }
}

export function bindVerifyWiring(dom) {
  dom.verifyBtn?.addEventListener('click', () => openVerifyModal(dom));
  dom.closeVerifyBtn?.addEventListener('click', () => closeVerifyModal(dom));
  dom.verifyRunBtn?.addEventListener('click', () => runVerification(dom));
  dom.verifyFillLastBtn?.addEventListener('click', () => fillFromLastPhoto(dom));
  // Escape closes the modal while it's open — matches native dialog behaviour.
  dom.verifyModal?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeVerifyModal(dom);
  });
  bindFormReset(dom);
}
