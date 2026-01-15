import { dbGetPhoto } from '../storage/photoDb.js';

/**
 * Photo Comparison Feature
 * Side-by-side comparison of two photos
 */

export function initPhotoComparison(dom) {
    const comparisonMode = document.getElementById('comparison-mode');
    const compareBtn = document.getElementById('compare-photos-btn');
    const closeBtn = document.getElementById('close-comparison');
    const leftImg = document.querySelector('#comparison-left img');
    const rightImg = document.querySelector('#comparison-right img');
    
    if (!comparisonMode || !compareBtn || !closeBtn) {
        console.warn('Photo comparison UI elements not found');
        return;
    }
    
    // Open comparison mode
    compareBtn?.addEventListener('click', async () => {
        const selected = Array.from(document.querySelectorAll('.gallery-item.selected'));
        
        if (selected.length !== 2) {
            alert('Please select exactly 2 photos to compare');
            return;
        }
        
        // Get photo IDs
        const photoId1 = parseInt(selected[0].dataset.photoId);
        const photoId2 = parseInt(selected[1].dataset.photoId);
        
        // Load photos
        try {
            const photo1 = await dbGetPhoto(photoId1);
            const photo2 = await dbGetPhoto(photoId2);
            
            if (!photo1 || !photo2) {
                alert('Error loading photos');
                return;
            }
            
            // Display images
            const url1 = URL.createObjectURL(photo1.blob);
            const url2 = URL.createObjectURL(photo2.blob);
            
            leftImg.src = url1;
            rightImg.src = url2;
            
            // Update labels with metadata
            updatePhotoLabel('comparison-left', photo1);
            updatePhotoLabel('comparison-right', photo2);
            
            // Show comparison mode
            comparisonMode.setAttribute('aria-hidden', 'false');
            
            console.log('🔍 Comparing photos:', photoId1, 'vs', photoId2);
            
            // Store URLs for cleanup
            comparisonMode._photoUrls = [url1, url2];
        } catch (err) {
            console.error('Error loading photos for comparison:', err);
            alert('Failed to load photos');
        }
    });
    
    // Close comparison mode
    closeBtn?.addEventListener('click', () => {
        comparisonMode.setAttribute('aria-hidden', 'true');
        
        // Cleanup URLs
        if (comparisonMode._photoUrls) {
            comparisonMode._photoUrls.forEach(url => URL.revokeObjectURL(url));
            comparisonMode._photoUrls = null;
        }
        
        leftImg.src = '';
        rightImg.src = '';
    });
    
    // Close on outside click
    comparisonMode.addEventListener('click', (e) => {
        if (e.target === comparisonMode) {
            closeBtn.click();
        }
    });
    
    // Enable pinch-to-zoom on images
    enableImageZoom(leftImg);
    enableImageZoom(rightImg);
}

function updatePhotoLabel(containerId, photo) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const label = container.querySelector('.photo-label');
    if (!label) return;
    
    const metadata = photo.metadata || {};
    const date = new Date(photo.timestamp);
    
    let text = `Photo ${photo.id}`;
    
    if (metadata.projectName) {
        text = metadata.projectName;
    } else {
        text = date.toLocaleDateString();
    }
    
    label.textContent = text;
    
    // Add tooltip with full metadata
    const tooltip = [
        `Date: ${date.toLocaleString()}`,
        metadata.latitude && metadata.longitude 
            ? `GPS: ${metadata.latitude.toFixed(6)}, ${metadata.longitude.toFixed(6)}`
            : null,
        metadata.altitude ? `Altitude: ${metadata.altitude}m` : null,
        metadata.heading ? `Heading: ${metadata.heading}°` : null,
    ].filter(Boolean).join('\n');
    
    label.title = tooltip;
}

function enableImageZoom(img) {
    let scale = 1;
    let panning = false;
    let pointX = 0;
    let pointY = 0;
    let start = { x: 0, y: 0 };
    
    img.style.cursor = 'zoom-in';
    img.style.transition = 'transform 0.3s ease';
    
    // Double-click to zoom
    img.addEventListener('dblclick', (e) => {
        e.preventDefault();
        
        if (scale === 1) {
            scale = 2;
            img.style.cursor = 'zoom-out';
            const rect = img.getBoundingClientRect();
            pointX = ((e.clientX - rect.left) / rect.width) * 100;
            pointY = ((e.clientY - rect.top) / rect.height) * 100;
            img.style.transformOrigin = `${pointX}% ${pointY}%`;
        } else {
            scale = 1;
            img.style.cursor = 'zoom-in';
            img.style.transformOrigin = 'center center';
        }
        
        img.style.transform = `scale(${scale})`;
    });
    
    // Touch gestures for zoom (pinch)
    let initialDistance = 0;
    
    img.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            initialDistance = getDistance(e.touches[0], e.touches[1]);
        }
    });
    
    img.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const currentDistance = getDistance(e.touches[0], e.touches[1]);
            const delta = currentDistance / initialDistance;
            scale = Math.max(1, Math.min(4, scale * delta));
            img.style.transform = `scale(${scale})`;
            initialDistance = currentDistance;
        }
    });
    
    img.addEventListener('touchend', () => {
        if (scale < 1.1) {
            scale = 1;
            img.style.transform = 'scale(1)';
            img.style.cursor = 'zoom-in';
        } else {
            img.style.cursor = 'zoom-out';
        }
    });
}

function getDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

export function updateComparisonButton() {
    const compareBtn = document.getElementById('compare-photos-btn');
    if (!compareBtn) return;
    
    const selectedCount = document.querySelectorAll('.gallery-item.selected').length;
    
    if (selectedCount === 2) {
        compareBtn.disabled = false;
        compareBtn.style.opacity = '1';
    } else {
        compareBtn.disabled = true;
        compareBtn.style.opacity = '0.5';
    }
}
