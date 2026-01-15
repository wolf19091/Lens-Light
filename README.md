# Lens Light - Professional Survey Camera App

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
│   └── style.css          # Glassmorphism UI styles
├── js/
│   ├── main.js            # App bootstrap & event handlers
│   ├── script.js          # Additional utilities
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
├── sec-lens-logo.png      # App icon
├── README.md              # This file
├── ENHANCEMENTS.md        # Future improvements
└── .gitignore             # Git ignore rules
```

## 🔧 Tech Stack

- **Frontend**: HTML5, CSS3 (Glassmorphism), Vanilla JavaScript (ES6+)
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
