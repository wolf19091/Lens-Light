// Photo Code — a re-derivable consistency checksum stamped onto each capture's
// watermark. NOT a cryptographic signature: it has no secret key, so it
// detects accidental/naive metadata edits only — not a motivated attacker.
//
// Design goals:
//   • Deterministic — recomputable from the saved metadata, so a verifier can
//     reproduce the code from a photo + its record and confirm a match.
//   • Stable across app versions — the canonical-string layout below is
//     versioned (CODE_SCHEMA_VERSION). Changing field order/format here will
//     invalidate every existing photo's code, so don't.
//   • Human-friendly — Crockford-style base32 alphabet (no I, L, O, U) so the
//     code is unambiguous when read aloud or off a printout.
//
// What it proves: that the displayed metadata (timestamp, GPS, project, etc.)
// has not been altered since capture. It does NOT prove the image pixels are
// untouched — the watermark itself contains the code, so a post-watermark
// pixel fingerprint creates a chicken-and-egg verification problem. For pixel
// integrity, a separate fingerprint stored alongside the record would be
// needed; deliberately out of scope for v1.

const CODE_SCHEMA_VERSION = 'v1';
const CODE_LENGTH = 14;

// 30-character Crockford-ish alphabet: no 0/1 (confused with O/I), no I/L/O/U.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Formats a Date (or ISO string) as "YYYY-MM-DD HH:MM" in the device's LOCAL
 * timezone. This is the same time the user sees on the watermark, so a person
 * looking at a printed photo can type these values back into the verifier and
 * reproduce the hash.
 *
 * Cross-timezone caveat: if a photo is captured in GMT+3 and verified on a
 * device in GMT+0, this function would format the same ISO differently. We
 * sidestep that by storing the local-formatted string on the record at
 * capture time and preferring it when present (see normalizeCanonicalInput).
 */
export function formatLocalMinute(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())} ${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
  }
  // Already-formatted "YYYY-MM-DD HH:MM" strings flow through unchanged so
  // verifier inputs (datetime-local fields) don't get double-formatted.
  const direct = String(value).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (direct) return `${direct[1]} ${direct[2]}:${direct[3]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).trim();
  return formatLocalMinute(date);
}

const normalizeCoord = (value) => (Number.isFinite(value) ? Number(value).toFixed(6) : '');

/**
 * Pulls the canonical fields out of either a stored photo record OR a
 * verifier-form input object. Both shapes converge to the same canonical
 * string, which is the only thing the hash sees.
 */
function normalizeCanonicalInput(metadata) {
  const localTimestamp = metadata?.localTimestampMinute
    ? formatLocalMinute(metadata.localTimestampMinute)
    : formatLocalMinute(metadata?.timestamp);

  return {
    timestamp: localTimestamp,
    lat: normalizeCoord(metadata?.lat),
    lon: normalizeCoord(metadata?.lon)
  };
}

/**
 * Canonical, field-ordered string used as the SHA-256 input. The pipe
 * delimiter never appears in any of the included fields (coordinates are
 * decimals), so there's no risk of two different inputs producing the same
 * canonical string.
 *
 * The hash deliberately includes ONLY:
 *   - timestamp (minute precision, local)
 *   - lat / lon (6 decimals)
 *
 * Anything else (project, location, short address, alt, heading) would force
 * a human verifier to type extra fields, and any blank/missing optional field
 * would invalidate the signature. Keeping the input minimal means the code on
 * a printed watermark can be verified with just date/time and coordinates —
 * the three values that are always present and clearly labeled.
 */
function buildCanonicalString(metadata) {
  const normalized = normalizeCanonicalInput(metadata);
  return [
    CODE_SCHEMA_VERSION,
    normalized.timestamp,
    normalized.lat,
    normalized.lon
  ].join('|');
}

async function sha256Hex(text) {
  if (!crypto?.subtle?.digest) {
    // Web Crypto is universally available on every browser/PWA target we
    // support, but be defensive — if it's missing, propagate so the caller
    // can degrade gracefully rather than stamping a bogus code.
    throw new Error('Web Crypto unavailable');
  }
  const buffer = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encodes a non-negative BigInt into a fixed-length string using `alphabet`.
 * Pads with the alphabet's first char if `value` is smaller than the target
 * width, so the output is always exactly `length` characters.
 */
function encodeBigIntToBase(value, alphabet, length) {
  const base = BigInt(alphabet.length);
  let remaining = value;
  let output = '';
  for (let i = 0; i < length; i += 1) {
    const idx = Number(remaining % base);
    output = alphabet[idx] + output;
    remaining /= base;
  }
  return output;
}

/**
 * Computes the 14-character photo code for the given metadata.
 * The first 60 bits of the SHA-256 digest are used — that's ~10^18 distinct
 * codes, plenty for collision-free per-user receipts while keeping the code
 * short enough to print on a watermark.
 */
export async function generatePhotoCode(metadata) {
  try {
    const canonical = buildCanonicalString(metadata);
    const hex = await sha256Hex(canonical);
    // 15 hex chars = 60 bits, comfortably representable in 14 chars of base-30
    // (log2(30^14) ≈ 68.7 bits of address space).
    const value = BigInt('0x' + hex.slice(0, 15));
    return encodeBigIntToBase(value, CODE_ALPHABET, CODE_LENGTH);
  } catch (err) {
    console.warn('generatePhotoCode failed:', err);
    return '';
  }
}

/**
 * Recomputes the code for `record` and compares against the stamped value.
 *
 * @returns {Promise<{status: 'match'|'mismatch'|'no-code'|'error', expected?: string, actual?: string}>}
 */
export async function verifyPhotoCode(record) {
  if (!record) return { status: 'error' };
  if (!record.photoCode) return { status: 'no-code' };

  try {
    const expected = await generatePhotoCode(record);
    if (!expected) return { status: 'error' };
    return expected === record.photoCode
      ? { status: 'match', expected, actual: record.photoCode }
      : { status: 'mismatch', expected, actual: record.photoCode };
  } catch (err) {
    console.warn('verifyPhotoCode failed:', err);
    return { status: 'error' };
  }
}
