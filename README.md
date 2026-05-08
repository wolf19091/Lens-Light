# Lens Light - Professional Survey Camera App

[![Version](https://img.shields.io/badge/version-7.2.0-blue.svg)](https://github.com/wolf19091/Lens-Light)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A progressive web app (PWA) for professional survey work with integrated GPS, compass, weather, and comprehensive sensor data capture.

## ✨ Features

### 📷 Camera Capabilities

- High-quality photo capture with multiple filters (Normal, B&W, Sepia, Vintage, Vivid)
- Digital zoom (1x - 3x)
- Burst mode (up to 10 photos)
- Self-timer (3s, 5s, 10s delays)
- Flashlight/torch support
- Exposure compensation (-2 to +2 EV)
- Grid overlay and level indicator
- Camera flip (front/back)
- **🎯 Tap-to-Focus** - Touch screen to focus on specific areas
- **🌡️ White Balance Control** - Adjust color temperature (2000K-8000K)
- **✨ HDR Mode** - High Dynamic Range capture with exposure bracketing

### 🧭 Sensors & Location

- Real-time GPS coordinates with accuracy
- Altitude tracking (meters/feet)
- Compass heading with cardinal directions
- Device orientation detection
- Reverse geocoding (OpenStreetMap)
- Weather data integration (Open-Meteo API)
- **⊡ QR Code Scanner** - Scan QR codes for equipment IDs or location markers

### 🖼️ Gallery & Media

- Photo storage in IndexedDB (no cloud upload)
- Thumbnail grid with lazy loading
- Full-size photo viewer
- Multi-select mode
- Photo comments/annotations
- Share via native Web Share API
- Download photos to device
- Delete with confirmation
- **🔍 Photo Comparison** - Side-by-side comparison of two photos
- **📊 Metadata Export** - Export photo data as CSV/JSON for reports

### ⚙️ Settings & Customization

- Project naming
- Custom location tags
- Language support (English & العربية)
- Image quality control
- GPS watermark option
- Camera sound toggle
- Unit selection (metric/imperial)
- Battery mode (reduced GPS update rate)
- **Timestamp formats** - ISO, US, EU, Arabic formats
- **Focus assist** - Visual focus ring indicator
- **HDR toggle** - Enable/disable HDR mode

### 📱 Mobile & PWA
- Offline support via Service Worker
- Installable on home screen
- Full-screen app mode
- Safe area support for notched devices
- Screen wake lock during capture
- Responsive design for all devices

## 🚀 Getting Started

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/wolf19091/Lens-Light.git
   cd Lens-Light
   ```

2. Start a local server:
   ```bash
   python -m http.server 8000
   ```

3. Open in browser:
   ```
   http://localhost:8000
   ```

### Deployment to GitHub Pages

1. Push to your GitHub repository:
   ```bash
   git add .
   git commit -m "Deploy latest version"
   git push origin main
   ```

2. Enable GitHub Pages:
   - Go to repository settings
   - Navigate to **Pages**
   - Select `main` branch as source
   - Save

3. Your app will be available at:
   ```
   https://YOUR_USERNAME.github.io/Lens-Light/
   ```

### Using on Mobile

1. Visit the app URL on your mobile device
2. Tap browser menu → "Add to Home Screen" or "Install"
3. Grant permissions for:
   - Camera access
   - Location (GPS)
   - Motion & Orientation sensors

## 📁 Project Structure

```
Lens-Light/
├── index.html              # Main app HTML
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── css/
│   └── style.css          # DESIGN.md-driven UI styles
├── js/
│   ├── main.js            # App bootstrap & event handlers
│   ├── version.js         # Single version source of truth
│   ├── vendor/
│   │   └── jsQR.min.js    # Vendored QR-code decoder (offline-ready)
│   └── app/
│       ├── state.js       # Centralized app state
│       ├── dom.js         # DOM element references
│       ├── camera/
│       │   └── camera.js  # Camera capture & zoom
│       ├── sensors/
│       │   └── sensors.js # GPS, compass, weather
│       ├── gallery/
│       │   └── gallery.js # Photo management
│       ├── storage/
│       │   └── photoDb.js # IndexedDB operations
│       ├── pwa/
│       │   └── pwa.js     # Service worker registration
│       ├── ui/
│       │   ├── features.js    # Feature toggles UI
│       │   ├── viewport.js    # Responsive layout
│       │   └── wakelock.js    # Screen wake lock
│       └── core/
│           ├── i18n.js       # Translations (EN/AR)
│           ├── settings.js   # Settings management
│           ├── status.js     # Status notifications
│           └── utils.js      # Helper functions
├── logo-max-ar-inv.svg      # App icon
└── README.md              # This file
```

## 🚀 Quick Start (2 Minutes)

### Test New Features

**1. Tap-to-Focus (10 sec)**
- Tap the 🎯 button → Touch screen → Watch focus ring appear

**2. White Balance (15 sec)**
- Tap 🌡️ button → Drag slider → See color temperature change

**3. HDR Photo (30 sec)**
- Tap ✨ button → Take photo → Wait for 3-exposure merge

**4. QR Scanner (20 sec)**
- Tap ⊡ button → Point at QR code → Auto-detects

- **Dependencies**:
  - jsQR v1.4.0 (QR code scanning)

## 📊 Metadata Export

Export photo data as CSV (Excel) or JSON:

**Exported Fields:**
- Photo ID, filename, timestamp
- GPS: latitude, longitude, altitude, accuracy, heading
- Location: name, project, custom tags
- Sensors: compass heading, device orientation
- Weather: temperature, conditions, wind
- Comments & QR codes

**Usage:**
1. Gallery → Select photos
2. Tap "📊 Export Metadata"
3. Choose CSV or JSON format
4. File downloads automatically

## 📱 Mobile Gestures

- **Single tap** - Focus (when 🎯 enabled)
- **Double tap** - Flip camera
- **Pinch** - Zoom (in comparison mode)
- **Long press** - Select photo

## 🎯 Feature Buttons

| Button | Feature | Description |
|--------|---------|-------------|
| 🎯 | Tap-to-Focus | Touch screen to focus on specific areas |
| 🌡️ | White Balance | Adjust color temperature (2000K-8000K) |
| ✨ | HDR Mode | High Dynamic Range with 3-exposure bracketing |
| ⊡ | QR Scanner | Scan QR codes for equipment/location tags |
| 🔍 | Compare | Side-by-side photo comparison |
| 📊 | Export | Export metadata as CSV/JSON |

## 📝 Version History

### v7.2.0 (current)
- 🛠️ Hardened PWA: corrected manifest icon MIME, vendored jsQR locally, removed legacy `js/script.js`
- 🧹 Unified HDR state ownership, removed production `alert()` and debug backdoors
- 🌐 Centralised Project panel translations through the `t()` i18n helper

### v2.0.0 (January 2026)
- ✨ Added Tap-to-Focus with visual feedback
- 🌡️ Added White Balance control (2000K-8000K)
- ⚡ Added HDR mode with exposure bracketing
- 📱 Added QR code scanner
- 🔍 Added photo comparison viewer
- 📊 Added metadata export (CSV/JSON)
- 🎨 Enhanced UI with new feature buttons
- 🔧 Bug fixes for export and select-all functions

### v1.0.0 (December 2025)
- Initial release with core camera features
- GPS and sensor integration
- Gallery with IndexedDB storage
- PWA support and offline functionality

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- **jsQR** - QR code decoding
- **OpenStreetMap** - Reverse geocoding
- **Open-Meteo** - Weather data API

---

**Version 7.2.0** • Built with ❤️ for professional survey work • 2026
**5. Photo Comparison (30 sec)**
- Take 2 photos → Gallery → Select → Compare (2)

**6. Export Metadata (20 sec)**
- Gallery → Select photos → 📊 Export → Choose CSV/JSON

### Pro Tips

**Best Quality Setup:**
```
Settings → Image Quality → High (100%)
Settings → HDR Mode → ON
Tap 🎯 Focus button
```

**Survey Mode:**
```
Settings → Project Name → "Site Survey 2026"
Settings → Timestamp Format → ISO 8601
Enable: ✨ HDR + 🎯 Focus
```

**Indoor Photography:**
```
🌡️ White Balance → Warmer (left)
✨ HDR → ON
```

## 🔧 Tech Stack

- **Frontend**: HTML5, CSS3 guided by DESIGN.md, Vanilla JavaScript (ES6+)
- **Storage**: IndexedDB for offline photo storage
- **APIs**:
  - MediaDevices API (camera access)
  - Geolocation API (GPS)
  - Device Orientation API (compass)
  - Wake Lock API (screen management)
  - Web Share API (sharing)
- **PWA**: Service Worker for offline functionality
- **External APIs**:
  - OpenStreetMap Nominatim (reverse geocoding)
  - Open-Meteo (weather data)
