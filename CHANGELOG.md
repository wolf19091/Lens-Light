# Changelog

All notable changes to Lens Light Camera App.

## [2.0.0] - 2026-01-15

### 🎉 Major Features Added

#### Camera Enhancements
- **Tap-to-Focus** - Touch screen to focus on specific areas with visual feedback
- **White Balance Control** - Adjust color temperature (2000K-8000K) with live preview
- **HDR Mode** - High Dynamic Range capture with 3-exposure bracketing and smart merging

#### Scanning & Detection
- **QR Code Scanner** - Scan QR codes for equipment IDs and location markers
  - Real-time detection at 60fps
  - Auto-decode with jsQR library
  - Stores QR data in photo metadata

#### Gallery Features
- **Photo Comparison** - Side-by-side comparison of 2 photos
  - Touch gestures for zoom
  - Displays photo metadata
  - Responsive layout
- **Metadata Export** - Export photo data as CSV or JSON
  - Excel-compatible CSV with UTF-8 BOM
  - Structured JSON for developers
  - Includes GPS, sensors, weather, QR codes

#### Settings & UI
- **Timestamp Format Options** - ISO 8601, US, EU, Arabic formats
- **HDR Toggle** - Enable/disable HDR mode in settings
- **Focus Assist** - Toggle visual focus ring
- **Enhanced UI** - New feature buttons with clear icons

### 🔧 Technical Improvements

#### New Modules
```
js/app/features/
├── focus.js          - Tap-to-focus implementation
├── whitebalance.js   - Color temperature control
├── hdr.js           - HDR capture & tone mapping
├── qrscanner.js     - QR code detection
├── comparison.js    - Photo comparison viewer
└── metadata.js      - CSV/JSON export
```

#### Updated Components
- `js/main.js` - Feature initialization and imports
- `js/app/dom.js` - New DOM element references
- `js/app/state.js` - Extended state with new features
- `js/app/core/settings.js` - New settings handling
- `js/app/camera/camera.js` - HDR and white balance integration
- `js/app/gallery/gallery.js` - Comparison mode support

#### UI Elements
- Added 6 new feature buttons
- Added 3 new settings toggles
- Added 2 new modals (QR scanner, comparison)
- Added white balance slider control
- Added focus ring animation

#### Styling
- Added 300+ lines of new CSS
- Focus ring pulse animation
- White balance gradient slider
- QR scanner frame with corners
- Comparison mode layout
- Mobile-responsive designs

### 📦 Dependencies

#### Added
- **jsQR** (v1.4.0) - QR code decoding library
  - Source: CDN (jsdelivr)
  - License: Apache 2.0

### 🎨 Design Changes

- New feature icons (🎯 🌡️ ✨ ⊡ 🔍 📊)
- Consistent blue accent theme
- Smooth animations and transitions
- Glass morphism effects
- Enhanced mobile touch targets

### 🔒 Security

- Input sanitization for QR code data
- HTML escaping for displayed content
- Safe blob URL handling
- Proper cleanup of object URLs

### 📱 Compatibility

- Works on all modern browsers (Chrome, Safari, Edge, Firefox)
- Progressive enhancement (features degrade gracefully)
- HDR requires exposure compensation API (most phones)
- Tap-to-focus requires advanced camera constraints
- QR scanner requires JavaScript enabled

### 🐛 Bug Fixes

- Fixed async/await in gallery selection handler
- Improved error handling in feature modules
- Better fallback for unsupported camera features
- Fixed white balance application in capture pipeline

### 📝 Documentation

#### Added Files
- `NEW_FEATURES.md` - Comprehensive feature guide
- `QUICK_START.md` - Quick start guide for users
- `CHANGELOG.md` - This file

#### Updated Files
- `README.md` - Added new features to feature list
- `ENHANCEMENTS.md` - Updated with implementation status

### 🎯 Performance

- Lazy loading of feature modules
- Efficient canvas operations for HDR
- Optimized QR scanning loop
- Minimal impact on capture performance

### 🌍 Internationalization

- All new features support English & Arabic
- Timestamp format options for different locales
- Consistent with existing i18n system

---

## [1.0.0] - 2025-12-01 (Previous Release)

### Features
- Basic camera with filters
- GPS and sensor integration
- Gallery with IndexedDB storage
- Settings panel
- PWA support
- Offline functionality
- Photo comments
- Auto location from web
- Arabic translation
- Camera flip

---

## Upcoming Features (Roadmap)

### Version 2.1 (Planned)
- Voice notes recording
- Geofencing alerts
- Batch photo renaming
- Custom watermark designs

### Version 2.2 (Under Consideration)
- PDF report generation
- Cloud sync (optional)
- Time-lapse mode
- Panorama stitching
- Advanced filters
- RAW capture support

---

## Migration Guide

### From v1.x to v2.0

**No breaking changes!** All existing features continue to work.

**New features are:**
- Opt-in (disabled by default)
- Backward compatible
- Progressively enhanced

**Settings migration:**
- Existing settings preserved
- New settings use sensible defaults
- No manual migration needed

**Data format:**
- Photo storage format unchanged
- Metadata extended with new fields
- Fully backward compatible

**To upgrade:**
1. Simply refresh the app
2. Clear cache if needed
3. Grant permissions if prompted
4. Enjoy new features!

---

## Support

For issues, questions, or feature requests:
- Check `NEW_FEATURES.md` for detailed documentation
- See `QUICK_START.md` for getting started
- Review `README.md` for basic usage

---

**Version 2.0.0 - January 15, 2026**
*Professional Survey Camera with Advanced Features*
