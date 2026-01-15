import { loadPhotos } from '../gallery/gallery.js';
import { dbGetPhoto } from '../storage/photoDb.js';

/**
 * Metadata Export Feature
 * Export photo metadata as CSV or JSON for survey reports
 */

export function initMetadataExport(dom) {
    const exportBtn = document.getElementById('export-metadata-btn');
    
    if (!exportBtn) {
        console.warn('Export metadata button not found');
        return;
    }
    
    exportBtn.addEventListener('click', async () => {
        // Show format selection
        const format = await showFormatDialog();
        if (!format) return;
        
        // Get selected photos or all photos
        const selectedItems = Array.from(document.querySelectorAll('.gallery-item.selected'));
        
        let photoIds;
        if (selectedItems.length > 0) {
            photoIds = selectedItems.map(item => parseInt(item.dataset.photoId));
        } else {
            // Export all photos
            const allPhotos = await loadPhotos();
            photoIds = allPhotos.map(p => p.id);
        }
        
        if (photoIds.length === 0) {
            alert('No photos to export');
            return;
        }
        
        // Load full photo data
        const photos = await Promise.all(
            photoIds.map(id => dbGetPhoto(id))
        );
        
        // Export based on format
        if (format === 'csv') {
            await exportMetadataAsCSV(photos.filter(Boolean));
        } else if (format === 'json') {
            await exportMetadataAsJSON(photos.filter(Boolean));
        }
        
        console.log(`📊 Exported metadata for ${photos.length} photos as ${format.toUpperCase()}`);
    });
}

async function showFormatDialog() {
    return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(20, 20, 25, 0.95);
            backdrop-filter: blur(30px);
            padding: 24px;
            border-radius: 18px;
            border: 1px solid rgba(255,255,255,0.15);
            box-shadow: 0 12px 48px rgba(0,0,0,0.5);
            z-index: 10000;
            min-width: 300px;
            text-align: center;
        `;
        
        dialog.innerHTML = `
            <h3 style="margin: 0 0 20px 0; font-size: 18px;">Export Format</h3>
            <button id="export-csv-btn" style="
                display: block;
                width: 100%;
                padding: 12px;
                margin-bottom: 12px;
                background: #007AFF;
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 16px;
                cursor: pointer;
            ">📄 CSV (Excel Compatible)</button>
            <button id="export-json-btn" style="
                display: block;
                width: 100%;
                padding: 12px;
                margin-bottom: 12px;
                background: #007AFF;
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 16px;
                cursor: pointer;
            ">📋 JSON (Developer Format)</button>
            <button id="export-cancel-btn" style="
                display: block;
                width: 100%;
                padding: 12px;
                background: rgba(255,255,255,0.1);
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 16px;
                cursor: pointer;
            ">Cancel</button>
        `;
        
        document.body.appendChild(dialog);
        
        const cleanup = () => {
            document.body.removeChild(dialog);
        };
        
        dialog.querySelector('#export-csv-btn').addEventListener('click', () => {
            cleanup();
            resolve('csv');
        });
        
        dialog.querySelector('#export-json-btn').addEventListener('click', () => {
            cleanup();
            resolve('json');
        });
        
        dialog.querySelector('#export-cancel-btn').addEventListener('click', () => {
            cleanup();
            resolve(null);
        });
    });
}

export async function exportMetadataAsCSV(photos) {
    const headers = [
        'ID',
        'Filename',
        'Date',
        'Time',
        'Latitude',
        'Longitude',
        'Altitude (m)',
        'Heading (°)',
        'Accuracy (m)',
        'Location Name',
        'Project Name',
        'Custom Location',
        'Comment',
        'Weather',
        'Temperature (°C)',
        'QR Code'
    ];
    
    const rows = photos.map(photo => {
        const meta = photo.metadata || {};
        const date = new Date(photo.timestamp);
        
        return [
            photo.id || '',
            photo.filename || `photo_${photo.id}.jpg`,
            date.toLocaleDateString(),
            date.toLocaleTimeString(),
            meta.latitude?.toFixed(6) || '',
            meta.longitude?.toFixed(6) || '',
            meta.altitude?.toFixed(1) || '',
            meta.heading?.toFixed(0) || '',
            meta.accuracy?.toFixed(1) || '',
            meta.locationName || '',
            meta.projectName || '',
            meta.customLocation || '',
            photo.comment || '',
            meta.weather || '',
            meta.temperature || '',
            meta.qrCode || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    
    const csv = [headers.join(','), ...rows].join('\n');
    
    // Add UTF-8 BOM for Excel compatibility
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
    
    downloadFile(blob, `photos_metadata_${getTimestamp()}.csv`);
}

export async function exportMetadataAsJSON(photos) {
    const data = photos.map(photo => ({
        id: photo.id,
        filename: photo.filename,
        timestamp: photo.timestamp,
        date: new Date(photo.timestamp).toISOString(),
        metadata: {
            gps: {
                latitude: photo.metadata?.latitude,
                longitude: photo.metadata?.longitude,
                altitude: photo.metadata?.altitude,
                accuracy: photo.metadata?.accuracy,
                heading: photo.metadata?.heading
            },
            location: {
                name: photo.metadata?.locationName,
                customLocation: photo.metadata?.customLocation,
                projectName: photo.metadata?.projectName
            },
            weather: {
                conditions: photo.metadata?.weather,
                temperature: photo.metadata?.temperature
            },
            qrCode: photo.metadata?.qrCode
        },
        comment: photo.comment,
        settings: photo.settings
    }));
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    
    downloadFile(blob, `photos_metadata_${getTimestamp()}.json`);
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

function getTimestamp() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

// Export single photo metadata
export async function exportSinglePhotoMetadata(photoId, format = 'json') {
    const photo = await dbGetPhoto(photoId);
    if (!photo) {
        console.error('Photo not found:', photoId);
        return;
    }
    
    if (format === 'csv') {
        await exportMetadataAsCSV([photo]);
    } else {
        await exportMetadataAsJSON([photo]);
    }
}
