# Light Lens — Refactor Handoff

> **Snapshot date:** 2026-05-08
> **App version:** 7.2.0 (per `js/version.js` + `sw.js`)
> **Repo root:** `c:\Users\wolf5\OneDrive\سطح المكتب\مشاريع\LENS LIGHT`
> **Branch:** `main` (uncommitted refactor in working tree)

---

## 1. Project Overview

**Light Lens** is a vanilla-JS Progressive Web App for field surveying with a camera. It runs offline (service worker pre-caches all modules), captures photos with a watermark/report overlay containing GPS coordinates, altitude, heading, weather, and a procedural mini-map, and exports records to PDF (jsPDF) or Excel (.xlsx via ExcelJS, with a self-rolled OOXML/ZIP fallback).

**Stack:** ES2020+ vanilla modules. No bundler, no framework. IndexedDB for photo blobs. Two CDN scripts loaded on demand (jsPDF, ExcelJS); jsQR is vendored locally at `js/vendor/jsQR.min.js`.

**Browsers:** iOS Safari (primary), Android Chrome, desktop Chromium. Lots of iOS-specific workarounds (DeviceOrientationEvent permission gate, srcObject 0×0 race, viewport-vh fix, popup-blocker-aware PDF export).

**Languages:** English + Arabic (RTL).

---

## 2. Refactoring Progress & Rules

### What was achieved

- **JS reduced from 14,083 → 7,715 lines** (−45 %) across 49 files (was 16). Real dead code purged (~370 lines), the rest is module-boundary boilerplate.
- **Largest function:** went from 1,019 lines (`initializeApp`) to ~70 lines (`bindProjectEvents`).
- **Largest file:** went from 1,726 lines (`camera.js`) to 460 lines (`xlsx-builder.js`, the cohesive self-rolled OOXML writer).
- **Acyclic dependency graph** — verified via static cycle detection. No `import('./x.js')` workarounds remain.
- **Zero unused imports** — verified via static scan.
- **All 49 files pass `node --check`.**
- **Public API preserved 100 %** — every export imported by `js/main.js` from `camera.js`, `gallery.js`, `metadata.js`, `sensors.js` still resolves identically. Verified by Node ESM link check (failures only at browser-only DOM constructors at runtime, never at link).
- **Service worker pre-cache** updated with all 25 new module paths so PWA still works offline.
- **CSS:** removed one 17-line commented-out block; otherwise untouched (audit found 0 truly dead classes, 0 empty rules; remaining 6,382 lines are mostly legitimate `@media` overrides).
- **HTML:** unchanged (audit found 0 dead IDs, 0 dead classes).
- **Debug logging discipline:** all chatty `console.log` calls now gated behind `isDebugModeEnabled()` (reads `localStorage.debug_mode === 'true'`, exposed from `js/app/core/utils.js`). `console.error`/`console.warn` for real errors kept verbatim.

### Strict rules — the next AI MUST follow

1. **Zero behavioral change.** The user has been explicit about this from the start. Even latent bugs (see §5) are preserved unless the user explicitly asks. If a fix would change observable output → flag it, don't do it.
2. **No new third-party dependencies.** No npm packages, no React/Vue/Svelte, no CSS frameworks. Vanilla JS + browser APIs only. The two existing CDN deps (jsPDF, ExcelJS) and the one vendored dep (jsQR) are the entire dependency budget.
3. **Preserve security tokens, API configs, ARIA attributes.** The CSP in `index.html` (line 23) has stale entries (`https://geocode.maps.co`, `https://api-bdc.io`) — leave them. ARIA roles/labels are load-bearing for screen readers.
4. **Preserve the IndexedDB schema** (`DB_NAME = 'lens_light_db'`, `DB_VERSION = 1`, store `'photos'` with keypath `'id'`). A schema change orphans every user's photo library.
5. **Preserve the OOXML byte format in `xlsx-builder.js`.** Excel is byte-format-strict. Don't reorder XML fragments, don't change CDATA handling, don't change the ZIP store-method.
6. **Preserve all numeric constants** unless extracting them to named constants (which I have done for many — keep doing this rather than changing values). Font sizes, kernel weights, gradient stops, JPEG quality floors, GPS timeouts, throttle windows — all matter.
7. **Don't add comments that explain WHAT.** Code already says what. Comments only for non-obvious WHY: iOS quirks, race-condition workarounds, intentional silent catches, security-driven choices. Same convention as the existing codebase.
8. **2-space indentation** for new/edited JS. (4-space holdouts in `comparison.js` etc. were converted; if you find any 4-space JS, convert it.)
9. **Don't write planning/decision/analysis docs.** Work from this handoff and the code. The user explicitly does not want intermediate documentation files.
10. **Service worker `ASSETS` array MUST mirror the actual JS file tree.** If you add a new module, add its path to `sw.js` or it breaks offline.

### Code style invariants that the codebase enforces

- ES module syntax, `import`/`export`, no CommonJS.
- No top-level side effects beyond what's already there (`logoImg = new Image()` in `canvas-utils.js` is one — kept because the logo needs to load before capture).
- No `var`. Use `const` by default, `let` only when reassigned.
- Optional chaining + nullish coalescing freely.
- `for...of` for iteration; `.forEach` accepted but not preferred for new code.
- Status messages go through `core/status.js`'s `showStatus`. Don't re-implement it.
- i18n strings go through `t(key)` / `tFmt(key, params)` from `core/i18n.js`. Inline `state.currentLang === 'ar' ? ... : ...` ternaries exist throughout — when adding new strings, prefer `t()` keys, but the inline ternary pattern is acceptable for one-off composite strings.

---

## 3. Current Architecture

### High-level module map

```
js/
├── main.js                              ← bootstrap orchestrator (104 lines)
├── version.js                           ← APP_VERSION + cache name
├── app/
│   ├── state.js                         ← single global `state` object (no Redux)
│   ├── dom.js                           ← getDom() returns the element map
│   │
│   ├── core/
│   │   ├── utils.js                     ← sleep, clamp, escape, isDebugModeEnabled,
│   │   │                                  isTouchPrimaryInput, share/download helpers,
│   │   │                                  PHOTOS_CHANGED_EVENT, createShortAddress
│   │   ├── status.js                    ← showStatus + scoped createStatus
│   │   ├── i18n.js                      ← translations + t() + tFmt() + setLanguage()
│   │   └── settings.js                  ← saveSettings, loadSettings, bindSettingsUi
│   │
│   ├── storage/
│   │   └── photoDb.js                   ← IndexedDB CRUD + legacy localStorage migration
│   │
│   ├── camera/
│   │   ├── camera.js                    ← public barrel + lifecycle (init/zoom/torch/exposure)
│   │   ├── audio.js                     ← playBeep, playCameraShutter
│   │   ├── capture.js                   ← enhancedCapture, performCapture, startTimerCapture,
│   │   │                                  crop math, sharpening, persistence
│   │   └── overlays/
│   │       ├── canvas-utils.js          ← rounded rect, text wrap, seeded RNG, logo loader
│   │       ├── format.js                ← i18n labels + date/sensor formatters
│   │       ├── report.js                ← report card + minimap + brand badge + watermark
│   │       └── compass.js               ← compass badge overlay
│   │
│   ├── sensors/
│   │   ├── sensors.js                   ← public barrel + start/stop + requestPreciseLocation
│   │   ├── orientation.js               ← deviceorientation handler + heading smoothing + level
│   │   ├── gps.js                       ← updateGPS + handleGPSError + accuracy display
│   │   ├── geocoding.js                 ← BigDataCloud + Nominatim reverse geocode w/ cache
│   │   └── weather.js                   ← Open-Meteo + display + maybeUpdateCustomLocationFromWebFactory
│   │
│   ├── gallery/
│   │   ├── gallery.js                   ← public barrel + loadPhotos
│   │   ├── render.js                    ← renderGallery + observer + select-mode + deletePhoto
│   │   ├── viewer.js                    ← openPhotoViewer + closePhotoViewer + updatePhotoComment
│   │   └── bulk-actions.js              ← share/download/delete selected + share last + filename
│   │
│   ├── features/
│   │   ├── focus.js                     ← tap-to-focus
│   │   ├── whitebalance.js              ← Tanner Helland K→RGB + canvas WB
│   │   ├── hdr.js                       ← bracketed exposure capture + Reinhard tone-map
│   │   ├── qrscanner.js                 ← jsQR scanner + history + action handlers
│   │   ├── comparison.js                ← side-by-side photo compare + pinch-zoom
│   │   ├── metadata.js                  ← public barrel + bind* event handlers
│   │   └── metadata/
│   │       ├── format.js                ← escape + format helpers + dataURL extension
│   │       ├── source.js                ← getSourcePhotos + normalize + image hydration
│   │       ├── prep-state.js            ← DEFAULT_OPTIONS + DOM + render + payload + script loader
│   │       ├── pdf-export.js            ← jsPDF builder + HTML print fallback
│   │       ├── excel-export.js          ← ExcelJS branch + HTML compatibility fallback
│   │       └── xlsx-builder.js          ← Self-rolled OOXML/ZIP/CRC32 (third Excel fallback)
│   │
│   ├── ui/
│   │   ├── features.js                  ← applyFeatureUI (sync grid/level/burst button states)
│   │   ├── viewport.js                  ← updateAppVh (iOS visualViewport hack)
│   │   └── wakelock.js                  ← request/releaseWakeLock
│   │
│   ├── pwa/
│   │   └── pwa.js                       ← registerServiceWorker
│   │
│   └── wiring/                          ← all DOM event binders extracted from main.js
│       ├── diagnostics.js               ← inspectVideoDebugState (debug_mode only)
│       ├── projects.js                  ← project panel: open/close/render/import + refreshProjectManagerUi
│       ├── permissions.js               ← perm button + checkStoredPermissionsAndBootstrap
│       ├── menus.js                     ← timer/filter menus + outside-click + double-tap flip
│       ├── capture-wiring.js            ← shutter/flip/zoom/exposure/burst/flashlight/grid/level/gpsPrecision
│       ├── gallery-wiring.js            ← gallery modal + select mode + viewer + share entry
│       └── lifecycle.js                 ← wake lock + beforeunload + viewport resize + clock
│
└── vendor/
    └── jsQR.min.js                      ← vendored for offline QR scanning

sw.js                                    ← service worker (network-first HTML, cache-first CDN, NF+cache rest)
index.html                               ← single page; markup for all modals/panels
css/style.css                            ← 6,382 lines, layered design overrides
manifest.json                            ← PWA manifest
```

### Where to find common things

- **Add a new bottom-bar button:** add `<button id="x">` to `index.html` (~line 171, `<div id="controls">`), add to `dom.js` `getDom()`, wire in the right `wiring/*` file.
- **Add a new feature toggle in Settings:** edit `index.html` `<div id="settings-panel">` (~line 186), add the load logic to `core/settings.js` `loadSettings()`, add the change handler to `bindSettingsUi()`.
- **Change capture pipeline:** `js/app/camera/capture.js`. Order: `playShutter → triggerFlash → runHdrCaptureIfActive → computeSourceCrop → computeOutputSize → drawImage → applyEnhancementFilters → composeOverlays → toBlob → persistCapturedPhoto`.
- **Add an export option:** UI in `index.html` `<div id="export-prep-modal">` (~line 389), state in `metadata/prep-state.js` `DEFAULT_EXPORT_OPTIONS`, consume in `pdf-export.js` and `excel-export.js`. Don't forget `xlsx-builder.js` (third-tier fallback).
- **Add a translation:** edit `core/i18n.js` `translations.en` and `translations.ar`, then call via `t('newKey')` or `tFmt('newKey', { ...params })`.
- **State that survives reload:** add it to `state.settings` (in `state.js`) and it will persist via `saveSettings()`.
- **State that's runtime-only:** add it to `state.featureState` (or top-level `state` for cross-feature singletons).

### Data flow (capture → save)

1. User taps shutter → `wiring/capture-wiring.js: bindShutterButton` handler runs.
2. Handler calls `performCapture(dom, { showStatus, onCaptured, onBurstUi })` from `camera/capture.js`.
3. `performCapture` checks burst state, calls `enhancedCapture(dom, { showStatus, onCaptured })`.
4. `enhancedCapture` runs HDR branch if active, else plays shutter SFX/flash, computes the source crop (object-fit cover + zoom), picks output size, draws the video frame to `dom.canvas` with the filter chain, applies WB + sharpening, composes overlays (report card + compass + optional watermark), encodes JPEG, calls `persistCapturedPhoto`.
5. `persistCapturedPhoto` builds the photo record, calls `dbPutPhoto({...photo, blob})` (in `storage/photoDb.js`), pushes to `state.photos`, fires `notifyPhotosChanged` → `wiring/projects.js` and the gallery refresh hooks pick it up.

### Data flow (export PDF)

1. User opens gallery → clicks "Prepare Export" → `metadata.js: bindHeaderActions` opens the modal → `prep-state.js: openExportPrep` resolves source photos and normalises items.
2. User clicks "Export as PDF" → `pdf-export.js: exportPreparedPdf` runs.
3. Hydrates images (blob → dataURL + measure dimensions), opens a fallback popup window synchronously (popup-blocker workaround), tries jsPDF (`renderJsPdfDocument`).
4. jsPDF flow: `renderRecordPage` per item → `drawHeaderBand` → `drawRecordHeader` → `drawRecordImage` → `drawTextBlocks` → `pdf.save(...)`.
5. If jsPDF fails → falls back to writing `buildPdfHtml` into the popup and triggering `window.print()`.

---

## 4. Pending Tasks & Next Steps

### Tasks the user explicitly deferred (waiting on user permission)

These would change observable behavior, so per Rule 1 they were NOT done in the prior session:

1. **`features/comparison.js: updatePhotoLabel`** reads `photo.metadata.{projectName,latitude,longitude,altitude,heading}`, but `dbGetPhoto` returns those fields directly on the record (no nested `metadata` object). Result: every photo label is just the date, every tooltip is just `Date: ...`. **Likely intended fix:** read `photo.projectName`, `photo.lat`, `photo.lon`, `photo.alt`, `photo.heading` directly. Ask the user before touching.

2. **`features/metadata.js` `includeLogo` option** — UI checkbox (`#export-option-logo`) is wired, default `true` in `DEFAULT_EXPORT_OPTIONS`, persisted in `state.exportPrep.options`. But no exporter (PDF or Excel or HTML) consults it. Either implement (probably means embedding the logo image in the report header in PDF/HTML) or remove the dead UI element. Ask the user.

3. **Export item `mission` field** — `source.js: normalizeExportItem` sets `mission: record?.mission || ''` on every item, but no exporter ever reads it. Vestigial schema. Either remove, or expose in export columns. Ask the user.

### Tasks that need visual regression testing first

4. **CSS Section 33 "LEGACY SEC BRAND THEME OVERRIDE"** at `css/style.css` line ~4140, runs ~970 lines until the next section. Its own header comment says *"Superseded visually by the final DESIGN.md Apple UI override below."* Likely safe to delete entirely, but without screenshot diffing I couldn't prove every rule is in fact overridden. Recommend: ask user to take a screenshot of the running app, delete Section 33, take another screenshot, diff. If identical → keep deletion.

5. **CSS deeper dedup pass.** 127 "duplicate" top-level selectors flagged by static analysis are mostly legitimate `@media` overrides. A targeted manual review of the layered Section 30 (UX/UI REDESIGN OVERRIDES 2026) + Section 31 (VISUAL POLISH PASS) + Section 33 + the final "DESIGN.md APPLE UI OVERRIDE" section could likely consolidate ~500+ lines. Same caveat as #4 — needs visual regression.

### Tasks safe to do without permission

6. **Tighten CSP `connect-src` in `index.html` line 23.** Stale entries: `https://geocode.maps.co` (no longer used — switched to BigDataCloud) and `https://api-bdc.io` (also unused). Removing them tightens security with zero functional change. **NOTE:** rule 3 says preserve API configs — so this needs the user's explicit OK first. Flag and ask.

7. **`index.html` line 27 title typo:** `<title>LIGHT LENS - Survey Camera</title>` but the brand is "Lens Light" everywhere else. Cosmetic. Ask before changing.

8. **`#map-placeholder` element** in `index.html` lines 100–104. Comment says "Map Placeholder (Hidden)" but it's NOT hidden — it's `aria-hidden="true"` + visually rendered via CSS at `style.css:521`. It's a static "📍 GPS Position" pill in the corner. Either the comment lies, or the element should actually be hidden. Ask the user what was intended.

### Files that were inspected and judged "already clean" — skip unless something specific surfaces

`state.js`, `i18n.js`, `dom.js`, `core/status.js`, `ui/features.js`, `ui/viewport.js`, `version.js`. Don't refactor for refactor's sake.

---

## 5. Known Issues / Work-in-Progress

### Latent bugs preserved (per zero-change rule)

Already listed in §4 items 1–3 — the comparison-label, includeLogo, and mission-field issues. They are **bugs**, not WIP — they were latent before the refactor and remain latent.

### Temporary workarounds left in code (these are NOT being removed)

- **`metadata/prep-state.js: ensureExportPrepState`** runs an `Object.assign`-style merge of `DEFAULT_EXPORT_OPTIONS` over the persisted `state.exportPrep.options` on every call. This handles the case where a previous version of the app saved fewer keys. Don't simplify away.
- **`camera/capture.js: enhancedCapture`** has an iOS Safari `srcObject` 0×0 retry. Don't remove — it's a real bug on iOS 15-16.
- **`camera/camera.js: initCamera`** uses a `requestId` counter + comparison to handle the case where two `initCamera` calls overlap (e.g., user spams flip-camera). The "stale" call discards its stream. Don't simplify.
- **`sensors/sensors.js: startSensors`** registers the orientation listener via either `deviceorientation`, `deviceorientationabsolute`, or the iOS-permission-gated `deviceorientation`. The branching is essential; don't simplify into a single addEventListener.
- **`features/pdf-export.js: exportPreparedPdf`** opens `window.open('', '_blank')` *synchronously* before any `await` — this is required for popup-blocker compatibility. The popup is then either closed (jsPDF success) or written into (HTML print fallback). Do not move the `window.open` after an `await`.
- **`gallery/render.js: buildGalleryItem`** uses a 1×1 transparent GIF data URL as the initial `<img src>`, then the `IntersectionObserver` swaps in the real blob URL. Lazy-loading mechanism — don't replace with native `loading="lazy"` because the source is an object URL that doesn't exist yet at DOM construction time.

### Pre-existing console noise that was deliberately kept

- `console.log(\`📱 Lens Light v${APP_VERSION}\`)` at top of `main.js` — version banner, intentional, runs once.
- `console.warn('⚠️ Main.js already initialized, skipping duplicate run')` — guards against duplicate script-tag inclusion.
- `console.error(...)` messages throughout — kept verbatim for log-grep continuity. Don't change wording.

### What is NOT broken

- IndexedDB photo CRUD ✓
- All 49 module imports resolve at link time ✓ (Node ESM check)
- Service worker pre-cache contains all 25 new module paths ✓
- Public API of `camera.js`, `gallery.js`, `metadata.js`, `sensors.js` is unchanged from before refactor ✓
- All `aria-*` attributes preserved ✓
- All numeric constants in capture/HDR/WB pipelines preserved ✓

### File counts / line counts as of this snapshot

```
JS:    49 files, 7,715 lines (incl. sw.js: 215)
CSS:   1 file,   6,382 lines
HTML:  1 file,     503 lines
Total:           14,600 lines
```

Down from a starting total of ~20,986 lines (−30 %).

---

## How to resume

1. Read this file end-to-end. Don't guess from the file tree.
2. Confirm current state: `node --check` should pass for every JS file; static cycle detection should report zero cycles; static unused-import scan should report zero hits.
3. Pick ONE task from §4. Tasks 1–3 require user permission first (they change behavior). Tasks 6–8 are safe-but-cosmetic-and-need-confirmation. Tasks 4–5 are big-but-need-screenshots.
4. Follow the 10 strict rules in §2.
5. Run the verification triad (parse, cycles, unused imports) after each non-trivial change.
6. Update the `ASSETS` array in `sw.js` if you add a JS file.
