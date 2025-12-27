# Lens Light - Survey Camera App

A progressive web app (PWA) for capturing and surveying photos with GPS, compass, and altitude data.

## Features

- 📷 High-quality photo capture with metadata
- 🧭 Compass with heading detection
- 📍 GPS location tracking with accuracy
- 🔍 Digital zoom controls
- 📱 Offline support (PWA)
- 🎨 Beautiful glassmorphism UI
- 📤 Photo sharing functionality
- 💾 Local gallery storage

## Deployment

This project is deployed on GitHub Pages at:
**https://wolf19091.github.io/Lens-Light/**

### Deploy Your Own

1. **Create a GitHub Repository:**
   - Go to https://github.com/new
   - Name it `Lens-Light`
   - Make it public

2. **Clone and Push:**
   ```bash
   cd path/to/your/project
   git init
   git add .
   git commit -m "Initial commit: Lens Light camera app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/Lens-Light.git
   git push -u origin main
   ```

3. **Enable GitHub Pages:**
   - Go to your repo settings
   - Navigate to Pages
   - Select `main` branch as source
   - Save

4. **Access Your App:**
   - Visit: `https://YOUR_USERNAME.github.io/Lens-Light/`

## Files

- `index.html` - Main app with all functionality
- `manifest.json` - PWA manifest
- `sw.js` - Service worker for offline support
- `.gitignore` - Git ignore rules

## Tech Stack

- HTML5
- CSS3 (Glassmorphism, CSS Grid)
- Vanilla JavaScript (ES6+)
- Web APIs (Camera, Geolocation, Device Orientation, Wake Lock)
- Service Worker (Offline support)

## Browser Requirements

- Modern browser with WebGL, WebRTC, and Geolocation support
- Recommended: iOS 14.5+, Android 10+

## License

Open source - Feel free to use and modify!
