/**
 * Media Loader & GPS Extraction Module (Feature 4 Enhancement)
 * Supports Geo-tagged Photos, 360-degree Panorama Photos (Equirectangular), and Videos
 */
const MediaLoader = {
    mediaList: [],
    mediaLayerGroup: null,

    init: function(map, layerGroup) {
        this.mediaLayerGroup = layerGroup;
    },

    /**
     * Handle incoming dropped or selected files (Images / Videos)
     */
    processFiles: function(files, gpxList = [], callback = null) {
        const fileArr = Array.from(files);
        let processed = 0;

        fileArr.forEach(file => {
            const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|heic)$/i.test(file.name);
            const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);

            if (!isImage && !isVideo) return;

            const mediaItem = {
                id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                file: file,
                name: file.name,
                type: isImage ? 'image' : 'video',
                url: URL.createObjectURL(file),
                lat: null,
                lon: null,
                ele: null,
                timestamp: null,
                is360: false,
                camera: '',
                marker: null
            };

            if (isImage) {
                this.extractImageExif(file, mediaItem, gpxList, () => {
                    this.addMediaToMap(mediaItem);
                    processed++;
                    if (callback) callback(mediaItem, processed);
                });
            } else if (isVideo) {
                this.extractVideoInfo(file, mediaItem, gpxList, () => {
                    this.addMediaToMap(mediaItem);
                    processed++;
                    if (callback) callback(mediaItem, processed);
                });
            }
        });
    },

    /**
     * Extract EXIF GPS, Date, and 360 Sphere tags from JPEG images
     */
    extractImageExif: function(file, mediaItem, gpxList, onComplete) {
        // Load image to check dimensions (for 360 aspect ratio check)
        const img = new Image();
        img.onload = () => {
            const aspect = img.width / img.height;
            // 2:1 Equirectangular aspect ratio (e.g. 5376x2688) indicates a 360 photo
            if (Math.abs(aspect - 2.0) < 0.1 || /360|theta|insta360|panor/i.test(file.name)) {
                mediaItem.is360 = true;
            }

            if (window.EXIF) {
                EXIF.getData(file, function() {
                    const lat = EXIF.getTag(this, 'GPSLatitude');
                    const latRef = EXIF.getTag(this, 'GPSLatitudeRef') || 'N';
                    const lon = EXIF.getTag(this, 'GPSLongitude');
                    const lonRef = EXIF.getTag(this, 'GPSLongitudeRef') || 'E';
                    const alt = EXIF.getTag(this, 'GPSAltitude');
                    const dateTime = EXIF.getTag(this, 'DateTimeOriginal') || EXIF.getTag(this, 'DateTime');
                    const make = EXIF.getTag(this, 'Make') || '';
                    const model = EXIF.getTag(this, 'Model') || '';

                    mediaItem.camera = `${make} ${model}`.trim();

                    if (lat && lon) {
                        mediaItem.lat = MediaLoader.convertDMSToDD(lat[0], lat[1], lat[2], latRef);
                        mediaItem.lon = MediaLoader.convertDMSToDD(lon[0], lon[1], lon[2], lonRef);
                        if (alt) mediaItem.ele = parseFloat(alt);
                    }

                    if (dateTime) {
                        // EXIF format: "YYYY:MM:DD HH:MM:SS"
                        const parts = dateTime.split(/[: ]/);
                        if (parts.length >= 6) {
                            mediaItem.timestamp = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
                        }
                    } else if (file.lastModified) {
                        mediaItem.timestamp = new Date(file.lastModified);
                    }

                    // Fallback to GPX matching if GPS is missing in image EXIF
                    if ((mediaItem.lat === null || mediaItem.lon === null) && mediaItem.timestamp && gpxList.length > 0) {
                        MediaLoader.matchWithGpxTrack(mediaItem, gpxList);
                    }

                    onComplete();
                });
            } else {
                if (file.lastModified) mediaItem.timestamp = new Date(file.lastModified);
                if (gpxList.length > 0) MediaLoader.matchWithGpxTrack(mediaItem, gpxList);
                onComplete();
            }
        };
        img.onerror = () => onComplete();
        img.src = mediaItem.url;
    },

    /**
     * Extract timestamp from video and match against GPX tracks
     */
    extractVideoInfo: function(file, mediaItem, gpxList, onComplete) {
        mediaItem.timestamp = file.lastModified ? new Date(file.lastModified) : new Date();
        if (gpxList.length > 0) {
            this.matchWithGpxTrack(mediaItem, gpxList);
        }
        onComplete();
    },

    /**
     * Match media timestamp with GPX tracks to find GPS coordinates
     */
    matchWithGpxTrack: function(mediaItem, gpxList) {
        if (!mediaItem.timestamp) return;

        const targetTime = mediaItem.timestamp.getTime();
        let closestPt = null;
        let minDiff = Infinity;

        gpxList.forEach(gpx => {
            gpx.points.forEach(pt => {
                if (!pt.time) return;
                const diff = Math.abs(pt.time.getTime() - targetTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestPt = pt;
                }
            });
        });

        // If matched within 30 minutes
        if (closestPt && minDiff < 30 * 60 * 1000) {
            mediaItem.lat = closestPt.lat;
            mediaItem.lon = closestPt.lon;
            mediaItem.ele = closestPt.ele;
            mediaItem.matchedWithGpx = true;
        }
    },

    /**
     * Convert DMS (Degrees, Minutes, Seconds) EXIF to Decimal Degrees
     */
    convertDMSToDD: function(degrees, minutes, seconds, direction) {
        let dd = degrees + minutes / 60.0 + seconds / 3600.0;
        if (direction === 'S' || direction === 'W') {
            dd = dd * -1;
        }
        return dd;
    },

    /**
     * Add Media Marker and Popup Balloon to Leaflet Map
     */
    addMediaToMap: function(item) {
        if (item.lat === null || item.lon === null || !this.mediaLayerGroup) {
            return;
        }

        // Distinct icon depending on 360, Photo, or Video
        let iconHtml = '';
        if (item.is360) {
            iconHtml = '<div style="background:#e65100; color:#fff; border:2px solid #fff; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.3);"><i class="fa-solid fa-street-view" style="font-size:16px;"></i></div>';
        } else if (item.type === 'video') {
            iconHtml = '<div style="background:#7c3aed; color:#fff; border:2px solid #fff; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.3);"><i class="fa-solid fa-video" style="font-size:14px;"></i></div>';
        } else {
            iconHtml = '<div style="background:#0284c7; color:#fff; border:2px solid #fff; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.3);"><i class="fa-solid fa-camera" style="font-size:14px;"></i></div>';
        }

        const customIcon = L.divIcon({
            html: iconHtml,
            className: 'custom-media-pin',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        // Balloon Popup HTML
        let mediaContent = '';
        if (item.type === 'image') {
            mediaContent = `
                <div class="media-thumb-container">
                    <img src="${item.url}" class="media-thumb" onclick="MediaLoader.openFullImage('${item.url}')" title="クリックで拡大">
                    ${item.is360 ? '<span class="media-badge-360"><i class="fa-solid fa-street-view"></i> 360°</span>' : ''}
                </div>
            `;
        } else if (item.type === 'video') {
            mediaContent = `
                <div class="media-thumb-container" style="height: 150px;">
                    <video src="${item.url}" controls style="width:100%; height:100%; object-fit:cover;"></video>
                </div>
            `;
        }

        const dateStr = item.timestamp ? item.timestamp.toLocaleString('ja-JP') : '撮影日時不明';
        const eleStr = item.ele !== null ? `${item.ele.toFixed(1)} m` : '-';
        const cameraStr = item.camera ? `<br>📷 ${item.camera}` : '';

        const popupHtml = `
            <div class="media-balloon">
                <h5>${item.name}</h5>
                ${mediaContent}
                <div class="media-meta-text">
                    🕒 ${dateStr}<br>
                    ⛰️ 標高: ${eleStr}${cameraStr}
                </div>
                ${item.is360 ? `<button class="btn btn-warning btn-xs media-open-btn" onclick="MediaLoader.open360Viewer('${item.url}', '${item.name}')"><i class="fa-solid fa-street-view"></i> 360° パノラマで見る</button>` : ''}
            </div>
        `;

        const marker = L.marker([item.lat, item.lon], { icon: customIcon }).addTo(this.mediaLayerGroup);
        marker.bindPopup(popupHtml, { maxWidth: 260 });
        item.marker = marker;
        this.mediaList.push(item);
    },

    openFullImage: function(url) {
        window.open(url, '_blank');
    },

    open360Viewer: function(url, title = '360° パノラマ') {
        const modal = document.getElementById('panoramaModal');
        const titleEl = document.getElementById('panoramaTitle');
        titleEl.innerHTML = `<i class="fa-solid fa-street-view"></i> 全天球 360° 写真: ${title}`;
        modal.style.display = 'flex';

        if (window.pannellum) {
            pannellum.viewer('panoramaViewer', {
                type: 'equirectangular',
                panorama: url,
                autoLoad: true,
                autoRotate: -2,
                showZoomCtrl: true
            });
        }
    }
};

// Close modal handler
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('closePanoramaBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('panoramaModal').style.display = 'none';
        });
    }
});
