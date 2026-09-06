/**
 * Main Application Controller (app.js)
 * Enhanced with KML/GeoJSON Polygons, GeoTIFF Drone/Laser Orthos, and Opacity Sliders
 */
document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // Application State
    // -------------------------------------------------------------
    const state = {
        gpxList: [],
        selectedGpxIndex1: -1,
        selectedGpxIndex2: -1,
        colorPalette: [
            '#e65100', '#1565c0', '#2e7d32', '#6a1b9a',
            '#c2185b', '#00838f', '#f57f17', '#4e342e'
        ],
        map: null,
        gpxTracksLayer: null,
        gpxPointsLayer: null,
        proximityLayerGroup: null,
        riskMeshLayerGroup: null,
        mediaLayerGroup: null,
        polygonLayerGroup: null,
        geotiffLayerGroup: null,
        hoverMarker: null,
        highlightSegmentLayer: null,
        currentProximityResult: null,
        currentRiskMeshResult: null
    };

    // -------------------------------------------------------------
    // 1. Initialize Leaflet Map (Feature 1)
    // -------------------------------------------------------------
    function initMap() {
        state.map = L.map('map', {
            center: [36.593393, 136.774920],
            zoom: 15,
            zoomControl: true
        });

        // GSI Tile Layers
        const gsiStd = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a> (標準地図)',
            maxZoom: 18,
            crossOrigin: true
        });

        const gsiPhoto = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', {
            attribution: '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a> (航空写真)',
            maxZoom: 18,
            crossOrigin: true
        });

        const gsiRelief = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/relief/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a> (陰影起伏図)',
            maxZoom: 18,
            crossOrigin: true
        });

        const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19,
            crossOrigin: true
        });

        gsiStd.addTo(state.map);

        const baseMaps = {
            '地理院地図 (標準)': gsiStd,
            '地理院写真 (航空写真)': gsiPhoto,
            '地理院地図 (陰影起伏図)': gsiRelief,
            'OpenStreetMap': osm
        };

        state.geotiffLayerGroup = L.featureGroup().addTo(state.map); // Bottom overlay
        state.polygonLayerGroup = L.featureGroup().addTo(state.map); // Middle overlay
        state.riskMeshLayerGroup = L.featureGroup().addTo(state.map); // 10m Risk Distribution Mesh
        state.gpxTracksLayer = L.featureGroup().addTo(state.map);    // GPX track lines (Visible by default)
        state.gpxPointsLayer = L.featureGroup();                     // GPX positioning points (Hidden by default)
        state.proximityLayerGroup = L.featureGroup();                // Proximity alert points (Hidden by default, toggleable in layer control)
        state.mediaLayerGroup = L.featureGroup().addTo(state.map);
        state.highlightSegmentLayer = L.featureGroup().addTo(state.map);
        state.hoverMarkerLayer = L.featureGroup().addTo(state.map); // Dedicated layer for multi-GPX hover markers

        const overlayMaps = {
            'GPX軌跡ライン': state.gpxTracksLayer,
            'GPX測位ポイント': state.gpxPointsLayer,
            '接近アラート地点': state.proximityLayerGroup,
            '10mリスク分布メッシュ': state.riskMeshLayerGroup,
            '林班ポリゴン (KML/GeoJSON)': state.polygonLayerGroup,
            'GeoTIFF/ドローンオルソ': state.geotiffLayerGroup,
            '現地写真・動画・360°': state.mediaLayerGroup
        };

        // Initialize Sub-loaders
        MediaLoader.init(state.map, state.mediaLayerGroup);
        GISLayerLoader.init(state.map, state.polygonLayerGroup, state.geotiffLayerGroup);
        NearMissManager.init(state.map);

        overlayMaps['ヒヤリハット報告'] = NearMissManager.layerGroup;

        L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(state.map);
        L.control.scale({ imperial: false, metric: true }).addTo(state.map);
    }

    initMap();

    // -------------------------------------------------------------
    // 2. Visibility & Opacity Management (Integrated per-layer in file list)
    // -------------------------------------------------------------

    // -------------------------------------------------------------
    // 3. Resizable & Collapsible Sidebar & Panel
    // -------------------------------------------------------------
    function setupResizingAndCollapsing() {
        const sidebar = document.getElementById('sidebar');
        const sidebarResizer = document.getElementById('sidebarResizer');
        const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
        const openSidebarFloatingBtn = document.getElementById('openSidebarFloatingBtn');

        const analysisPanel = document.getElementById('analysisPanel');
        const panelResizer = document.getElementById('panelResizer');
        const togglePanelBtn = document.getElementById('togglePanelBtn');
        const openPanelFloatingBtn = document.getElementById('openPanelFloatingBtn');

        let isResizingSidebar = false;
        sidebarResizer.addEventListener('mousedown', (e) => {
            isResizingSidebar = true;
            sidebarResizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });

        let isResizingPanel = false;
        panelResizer.addEventListener('mousedown', (e) => {
            isResizingPanel = true;
            panelResizer.classList.add('resizing');
            document.body.style.cursor = 'row-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (isResizingSidebar) {
                const newWidth = Math.max(260, Math.min(650, e.clientX));
                sidebar.style.width = `${newWidth}px`;
                state.map.invalidateSize();
            } else if (isResizingPanel) {
                const containerHeight = window.innerHeight;
                const newHeight = Math.max(140, Math.min(containerHeight * 0.75, containerHeight - e.clientY));
                analysisPanel.style.height = `${newHeight}px`;
                state.map.invalidateSize();
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizingSidebar) {
                isResizingSidebar = false;
                sidebarResizer.classList.remove('resizing');
                document.body.style.cursor = 'default';
                state.map.invalidateSize();
            }
            if (isResizingPanel) {
                isResizingPanel = false;
                panelResizer.classList.remove('resizing');
                document.body.style.cursor = 'default';
                state.map.invalidateSize();
            }
        });

        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.add('collapsed');
            sidebarResizer.style.display = 'none';
            openSidebarFloatingBtn.style.display = 'flex';
            setTimeout(() => state.map.invalidateSize(), 100);
        });

        openSidebarFloatingBtn.addEventListener('click', () => {
            sidebar.classList.remove('collapsed');
            sidebarResizer.style.display = 'block';
            openSidebarFloatingBtn.style.display = 'none';
            setTimeout(() => state.map.invalidateSize(), 100);
        });

        togglePanelBtn.addEventListener('click', () => {
            analysisPanel.classList.add('collapsed');
            panelResizer.style.display = 'none';
            openPanelFloatingBtn.style.display = 'flex';
            setTimeout(() => state.map.invalidateSize(), 100);
        });

        openPanelFloatingBtn.addEventListener('click', () => {
            analysisPanel.classList.remove('collapsed');
            panelResizer.style.display = 'block';
            openPanelFloatingBtn.style.display = 'none';
            setTimeout(() => state.map.invalidateSize(), 100);
        });
    }

    setupResizingAndCollapsing();

    // -------------------------------------------------------------
    // 4. Bidirectional Map ⇔ Chart Hover Synchronization
    // -------------------------------------------------------------
    GPXCharts.setHoverCallbacks(
        (pointsList) => {
            state.hoverMarkerLayer.clearLayers();
            if (!pointsList || pointsList.length === 0) return;

            pointsList.forEach(item => {
                const pt = item.point;
                if (!pt || pt.lat === undefined || pt.lon === undefined) return;

                const color = item.color || (item.datasetIndex === 0 ? '#2563eb' : '#dc2626');
                const pulseIcon = L.divIcon({
                    className: 'custom-pulse-marker',
                    html: `<div class="map-hover-pulse" style="background:${color}; border-color:#ffffff; box-shadow: 0 0 10px ${color};"><div class="pulse-wave" style="border-color:${color};"></div></div>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });

                L.marker([pt.lat, pt.lon], { icon: pulseIcon, zIndexOffset: 2500 })
                    .addTo(state.hoverMarkerLayer)
                    .bindTooltip(`<b>${item.name || ''}</b><br>標高: ${pt.ele.toFixed(1)}m<br>${pt.time ? new Date(pt.time).toLocaleTimeString('ja-JP') : ''}`, { permanent: false, direction: 'top' });
            });
        },
        (matchedHours, targetLabel) => {
            state.highlightSegmentLayer.clearLayers();
            if (!matchedHours || matchedHours.length === 0) return;

            matchedHours.forEach(mh => {
                const hourData = mh.hourData;
                if (!hourData || !hourData.points || hourData.points.length < 2) return;
                const latlngs = hourData.points.map(p => [p.lat, p.lon]);
                const segColor = mh.color || '#f59e0b';

                L.polyline(latlngs, {
                    color: segColor,
                    weight: 8,
                    opacity: 0.9,
                    dashArray: '2, 6'
                }).addTo(state.highlightSegmentLayer)
                  .bindTooltip(`<b>${mh.name}</b> (${targetLabel})<br>水平移動: ${hourData.horizontalDistM.toFixed(1)}m<br>垂直上昇: +${hourData.climbM.toFixed(1)}m`);
            });
        }
    );

    // -------------------------------------------------------------
    // 5. File Loading & Drag-and-Drop (GPX, Photos, Videos, KML, GeoJSON, GeoTIFF)
    // -------------------------------------------------------------
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });

    const mapEl = document.getElementById('map');
    mapEl.addEventListener('dragover', (e) => e.preventDefault());
    mapEl.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
    });

    function handleFiles(files) {
        const fileArr = Array.from(files);

        const gpxFiles = fileArr.filter(f => f.name.toLowerCase().endsWith('.gpx'));
        const gisFiles = fileArr.filter(f => {
            const n = f.name.toLowerCase();
            return n.endsWith('.kml') || n.endsWith('.geojson') || n.endsWith('.json') || n.endsWith('.tif') || n.endsWith('.tiff') || n.endsWith('.hpr');
        });
        const mediaFiles = fileArr.filter(f => {
            const n = f.name.toLowerCase();
            return !n.endsWith('.gpx') && !n.endsWith('.kml') && !n.endsWith('.geojson') && !n.endsWith('.json') && !n.endsWith('.tif') && !n.endsWith('.tiff') && !n.endsWith('.hpr');
        });

        // 1. Process GPX Files
        if (gpxFiles.length > 0) {
            let loadedCount = 0;
            gpxFiles.forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const parsed = GPXParser.parse(e.target.result, file.name);
                        parsed.color = state.colorPalette[state.gpxList.length % state.colorPalette.length];
                        state.gpxList.push(parsed);
                        loadedCount++;

                        if (loadedCount === gpxFiles.length || state.gpxList.length === 1) {
                            updateUI();
                            if (state.selectedGpxIndex1 === -1) {
                                selectGpxPair(0, -1);
                            }
                        }
                    } catch (err) {
                        alert(`GPXファイル ${file.name} の読み込みに失敗しました: ${err.message}`);
                    }
                };
                reader.readAsText(file);
            });
        }

        // 2. Process GIS Layers (KML / GeoJSON / GeoTIFF / StanForD HPR)
        if (gisFiles.length > 0) {
            gisFiles.forEach(file => {
                GISLayerLoader.processFile(file, (fname, type) => {
                    updateGisLayerUI();
                });
            });
        }

        // 3. Process Media Files (Photos, 360, Videos)
        if (mediaFiles.length > 0) {
            MediaLoader.processFiles(mediaFiles, state.gpxList, (item) => {
                updateMediaUI();
                if (item.lat !== null && item.lon !== null) {
                    state.map.panTo([item.lat, item.lon]);
                }
            });
        }
    }

    function updateMediaUI() {
        const mediaCountSpan = document.getElementById('mediaCount');
        const mediaFileList = document.getElementById('mediaFileList');
        mediaCountSpan.textContent = MediaLoader.mediaList.length;

        if (MediaLoader.mediaList.length === 0) {
            mediaFileList.innerHTML = '<p class="empty-msg">写真・動画が読み込まれていません</p>';
            return;
        }

        mediaFileList.innerHTML = MediaLoader.mediaList.map((m, idx) => `
            <div class="file-item" onclick="MediaLoader.mediaList[${idx}].marker && MediaLoader.mediaList[${idx}].marker.openPopup()">
                <div class="file-item-info">
                    <i class="fa-solid ${m.is360 ? 'fa-street-view text-warning' : (m.type === 'video' ? 'fa-video text-primary' : 'fa-camera text-info')}"></i>
                    <div>
                        <div class="file-name" title="${m.name}">${m.name}</div>
                        <div class="file-meta">${m.lat !== null ? `${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}` : '位置不明'}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function updateGisLayerUI() {
        const gisCountSpan = document.getElementById('gisLayerCount');
        const gisFileList = document.getElementById('gisLayerFileList');
        gisCountSpan.textContent = GISLayerLoader.layerList.length;

        if (GISLayerLoader.layerList.length === 0) {
            gisFileList.innerHTML = '<p class="empty-msg">KML/GeoJSON/GeoTIFF/HPR未読込</p>';
            return;
        }

        gisFileList.innerHTML = GISLayerLoader.layerList.map((l, idx) => {
            const currentPct = Math.round((l.opacity !== undefined ? l.opacity : (l.type === 'geotiff' ? 0.7 : (l.type === 'hpr' ? 1.0 : 0.5))) * 100);
            const iconClass = l.type === 'hpr' ? 'fa-tree text-success' : (l.type === 'geotiff' ? 'fa-image text-primary' : 'fa-draw-polygon text-success');
            const typeBadge = l.type === 'hpr' ? 'HPR (伐倒単木GeoJSON変換済)' : (l.type === 'geotiff' ? `GEOTIFF${l.isLarge ? ' (解像度最適化)' : ''}` : l.type.toUpperCase());

            return `
            <div class="file-item gis-layer-item">
                <div class="gis-layer-top">
                    <div class="file-item-info" onclick="GISLayerLoader.layerList[${idx}].layer && state.map.fitBounds(GISLayerLoader.layerList[${idx}].layer.getBounds())" style="flex:1; cursor:pointer;" title="クリックして現場へズーム">
                        <i class="fa-solid ${iconClass}"></i>
                        <div>
                            <div class="file-name" title="${l.name}">${l.name}</div>
                            <div class="file-meta">${typeBadge}</div>
                        </div>
                    </div>
                    ${l.type === 'hpr' ? `
                    <button class="btn btn-xs btn-outline-primary" style="padding: 2px 7px; margin-right: 4px; font-size: 10px;" onclick="event.stopPropagation(); GISLayerLoader.exportHprGeoJson(${idx});" title="変換されたGeoJSONファイルをダウンロード">
                        <i class="fa-solid fa-download"></i> GeoJSON保存
                    </button>
                    ` : ''}
                    <button class="layer-toggle-btn ${l.visible ? 'active' : ''}" onclick="const vis = GISLayerLoader.toggleIndividualLayer(${idx}); this.classList.toggle('active', vis); this.innerHTML = vis ? '<i class=\\'fa-solid fa-eye\\'></i>' : '<i class=\\'fa-solid fa-eye-slash\\'></i>';" title="表示/非表示切替">
                        <i class="fa-solid ${l.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>
                    </button>
                </div>
                ${l.type !== 'hpr' ? `
                <!-- Compact Opacity Slider for this layer -->
                <div class="layer-opacity-row">
                    <label>透過度:</label>
                    <input type="range" class="layer-opacity-slider" min="0" max="100" value="${currentPct}" 
                           oninput="GISLayerLoader.setIndividualLayerOpacity(${idx}, this.value / 100.0); document.getElementById('opacityVal_${idx}').textContent = this.value + '%';">
                    <span id="opacityVal_${idx}" class="layer-opacity-badge">${currentPct}%</span>
                </div>
                ` : ''}
            </div>
            `;
        }).join('');
    }

    // -------------------------------------------------------------
    // 6. UI Updates & Map Rendering (Supporting up to 2 GPX tracks)
    // -------------------------------------------------------------
    function updateUI() {
        const fileCountSpan = document.getElementById('fileCount');
        const fileListDiv = document.getElementById('fileList');
        const mergeBtn = document.getElementById('mergeGpxBtn');
        const targetSelect1 = document.getElementById('targetGpxSelect1');
        const targetSelect2 = document.getElementById('targetGpxSelect2');

        fileCountSpan.textContent = state.gpxList.length;

        if (state.gpxList.length === 0) {
            fileListDiv.innerHTML = '<p class="empty-msg">GPXファイルが読み込まれていません</p>';
            mergeBtn.disabled = true;
            targetSelect1.disabled = true;
            targetSelect1.innerHTML = '<option value="">GPX 1 を選択</option>';
            targetSelect2.disabled = true;
            targetSelect2.innerHTML = '<option value="">(なし / 1つのみ分析)</option>';
            document.getElementById('calcDistanceBtn').disabled = true;
            if (state.gpxTracksLayer) state.gpxTracksLayer.clearLayers();
            if (state.gpxPointsLayer) state.gpxPointsLayer.clearLayers();
            if (state.proximityLayerGroup) state.proximityLayerGroup.clearLayers();
            if (state.riskMeshLayerGroup) state.riskMeshLayerGroup.clearLayers();
            return;
        }

        mergeBtn.disabled = state.gpxList.length < 2;

        fileListDiv.innerHTML = '';
        state.gpxList.forEach((gpx, idx) => {
            const isSel1 = idx === state.selectedGpxIndex1;
            const isSel2 = idx === state.selectedGpxIndex2;
            const isSelected = isSel1 || isSel2;
            const badgeLabel = isSel1 ? '<span class="badge" style="background:#2563eb; color:#fff; font-size:10px; padding:1px 4px; border-radius:3px; margin-left:4px;">GPX 1</span>' : (isSel2 ? '<span class="badge" style="background:#dc2626; color:#fff; font-size:10px; padding:1px 4px; border-radius:3px; margin-left:4px;">GPX 2</span>' : '');

            const item = document.createElement('div');
            item.className = `file-item ${isSelected ? 'selected' : ''}`;
            item.innerHTML = `
                <div class="file-item-info">
                    <span class="color-dot" style="background-color: ${gpx.color};"></span>
                    <div>
                        <div class="file-name" title="${gpx.fileName}">${gpx.name} ${badgeLabel}</div>
                        <div class="file-meta">${gpx.points.length} 点</div>
                    </div>
                </div>
                <button class="btn btn-xs btn-outline-danger remove-btn" data-index="${idx}" title="削除">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.remove-btn')) {
                    if (state.selectedGpxIndex1 !== idx) {
                        selectGpxPair(idx, state.selectedGpxIndex2 === idx ? -1 : state.selectedGpxIndex2);
                    }
                }
            });
            fileListDiv.appendChild(item);
        });

        fileListDiv.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute('data-index'));
                removeGpx(idx);
            });
        });

        targetSelect1.disabled = false;
        targetSelect1.innerHTML = '';
        targetSelect2.disabled = false;
        targetSelect2.innerHTML = '<option value="-1">(なし / 1つのみ分析)</option>';

        state.gpxList.forEach((gpx, idx) => {
            const opt1 = document.createElement('option');
            opt1.value = idx;
            opt1.textContent = `${idx + 1}. ${gpx.name} (${gpx.points.length}点)`;
            if (idx === state.selectedGpxIndex1) opt1.selected = true;
            targetSelect1.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = idx;
            opt2.textContent = `${idx + 1}. ${gpx.name} (${gpx.points.length}点)`;
            if (idx === state.selectedGpxIndex2) opt2.selected = true;
            targetSelect2.appendChild(opt2);
        });

        renderMapTracks();
    }

    function renderMapTracks() {
        state.gpxTracksLayer.clearLayers();
        state.gpxPointsLayer.clearLayers();
        const allLatLngs = [];

        state.gpxList.forEach((gpx, idx) => {
            if (gpx.points.length < 2) return;

            const latlngs = gpx.points.map(p => [p.lat, p.lon]);
            allLatLngs.push(...latlngs);

            const isSel1 = idx === state.selectedGpxIndex1;
            const isSel2 = idx === state.selectedGpxIndex2;
            const isSelected = isSel1 || isSel2;
            const tag = isSel1 ? ' [GPX 1]' : (isSel2 ? ' [GPX 2]' : '');

            // 1. Line track -> state.gpxTracksLayer
            const line = L.polyline(latlngs, {
                color: gpx.color,
                weight: isSelected ? 5 : 3,
                opacity: isSelected ? 0.95 : 0.70
            }).addTo(state.gpxTracksLayer);

            line.bindTooltip(`<b>${gpx.name}${tag}</b> (${gpx.points.length}点)`, { sticky: true });

            line.on('mousemove', (e) => {
                if (isSel1 || isSel2) {
                    const mouseLat = e.latlng.lat;
                    const mouseLon = e.latlng.lng;
                    let closestIdx = 0;
                    let minD = Infinity;

                    gpx.points.forEach((pt, pIdx) => {
                        const d = (pt.lat - mouseLat)**2 + (pt.lon - mouseLon)**2;
                        if (d < minD) {
                            minD = d;
                            closestIdx = pIdx;
                        }
                    });

                    GPXCharts.highlightChartFromMapPoint(closestIdx);
                }
            });

            // 2. Track Points & Start/End -> state.gpxPointsLayer
            // Sample points for performance and interactive inspection
            const sampleStep = Math.max(1, Math.floor(gpx.points.length / 100));
            gpx.points.forEach((pt, pIdx) => {
                if (pIdx === 0 || pIdx === gpx.points.length - 1 || pIdx % sampleStep === 0) {
                    const isEndpoint = (pIdx === 0 || pIdx === gpx.points.length - 1);
                    const pointColor = isEndpoint ? (pIdx === 0 ? '#16a34a' : '#dc2626') : gpx.color;
                    const pointRadius = isEndpoint ? 6 : (isSelected ? 3.5 : 2.5);

                    const marker = L.circleMarker([pt.lat, pt.lon], {
                        radius: pointRadius,
                        color: isEndpoint ? '#ffffff' : pointColor,
                        weight: isEndpoint ? 2 : 1,
                        fillColor: pointColor,
                        fillOpacity: isSelected ? 0.85 : 0.6
                    }).addTo(state.gpxPointsLayer);

                    const timeStr = pt.time ? new Date(pt.time).toLocaleTimeString('ja-JP') : '-';
                    const popupContent = `<b>${gpx.name}${tag} ${isEndpoint ? (pIdx === 0 ? '[出発]' : '[終了]') : `(点 #${pIdx+1})`}</b><br>標高: ${pt.ele.toFixed(1)}m<br>時刻: ${timeStr}`;
                    marker.bindPopup(popupContent);

                    marker.on('mouseover', () => {
                        if (isSel1 || isSel2) {
                            GPXCharts.highlightChartFromMapPoint(pIdx);
                        }
                    });
                }
            });
        });

        if (allLatLngs.length > 0) {
            state.map.fitBounds(L.latLngBounds(allLatLngs), { padding: [30, 30] });
        }
    }

    /**
     * Select 1 or 2 GPX tracks simultaneously
     */
    function selectGpxPair(idx1, idx2 = -1) {
        if (idx1 < 0 || idx1 >= state.gpxList.length) return;
        state.selectedGpxIndex1 = idx1;
        state.selectedGpxIndex2 = (idx2 >= 0 && idx2 < state.gpxList.length && idx2 !== idx1) ? idx2 : -1;

        const gpx1 = state.gpxList[state.selectedGpxIndex1];
        const stats1 = GPXStats.analyze(gpx1);

        const hasGpx2 = state.selectedGpxIndex2 >= 0;
        const gpx2 = hasGpx2 ? state.gpxList[state.selectedGpxIndex2] : null;
        const stats2 = hasGpx2 ? GPXStats.analyze(gpx2) : null;

        // Update Alert Tab banner & calculation controls
        const alertNamesText = document.getElementById('alertGpxNamesText');
        const calcDistanceBtn = document.getElementById('calcDistanceBtn');
        const alertBanner = document.getElementById('alertGpxBanner');

        if (hasGpx2) {
            alertNamesText.innerHTML = `<span style="color:#2563eb; font-weight:700;"><i class="fa-solid fa-person-walking"></i> ${gpx1.name}</span> <span style="color:#64748b; font-size:11px;">vs</span> <span style="color:#dc2626; font-weight:700;"><i class="fa-solid fa-truck-monster"></i> ${gpx2.name}</span>`;
            if (alertBanner) alertBanner.style.borderColor = '#3b82f6';
            calcDistanceBtn.disabled = false;
        } else {
            alertNamesText.innerHTML = `<span style="color:#64748b;">移動統計で2つのGPXを選択してください<br>(現在: <b>${gpx1.name}</b> のみ選択中)</span>`;
            if (alertBanner) alertBanner.style.borderColor = '#cbd5e1';
            calcDistanceBtn.disabled = true;
        }

        // Update Summary Card
        document.getElementById('statHeaderGpx1').textContent = gpx1.name;
        document.getElementById('totalHorizontalDist1').textContent = `${(stats1.totalHorizontalDistM / 1000).toFixed(2)}km (${stats1.totalHorizontalDistM.toFixed(0)}m)`;
        document.getElementById('totalVerticalDist1').textContent = `+${stats1.totalClimbM.toFixed(0)}m / -${stats1.totalDescentM.toFixed(0)}m`;
        document.getElementById('avgHourlyDist1').textContent = `${stats1.avgHourlyDistM.toFixed(0)}m/時`;
        document.getElementById('elevRange1').textContent = `${stats1.minElevationM.toFixed(0)}m〜${stats1.maxElevationM.toFixed(0)}m`;
        document.getElementById('elevDiff1').textContent = `${stats1.elevationDiffM.toFixed(0)}m`;

        const header2 = document.getElementById('statHeaderGpx2');
        const vals2 = document.querySelectorAll('.stat-val-2');

        if (hasGpx2) {
            header2.style.display = 'inline';
            header2.textContent = gpx2.name;
            vals2.forEach(el => el.style.display = 'inline');

            document.getElementById('totalHorizontalDist2').textContent = `${(stats2.totalHorizontalDistM / 1000).toFixed(2)}km (${stats2.totalHorizontalDistM.toFixed(0)}m)`;
            document.getElementById('totalVerticalDist2').textContent = `+${stats2.totalClimbM.toFixed(0)}m / -${stats2.totalDescentM.toFixed(0)}m`;
            document.getElementById('avgHourlyDist2').textContent = `${stats2.avgHourlyDistM.toFixed(0)}m/時`;
            document.getElementById('elevRange2').textContent = `${stats2.minElevationM.toFixed(0)}m〜${stats2.maxElevationM.toFixed(0)}m`;
            document.getElementById('elevDiff2').textContent = `${stats2.elevationDiffM.toFixed(0)}m`;
        } else {
            header2.style.display = 'none';
            vals2.forEach(el => el.style.display = 'none');
        }

        document.getElementById('exportStatsTextBtn').disabled = false;
        const exportPdfBtn = document.getElementById('exportPdfReportBtn');
        if (exportPdfBtn) exportPdfBtn.disabled = false;

        // Render Dual / Single Hourly Tables
        renderDualHourlyTables(gpx1, stats1, gpx2, stats2);

        // Render 1-hour Bar Chart (Separate multi-series or single)
        const hourlyChartData = [
            { name: gpx1.name, color: gpx1.color, hourlyData: stats1.hourly }
        ];
        if (hasGpx2) {
            hourlyChartData.push({ name: gpx2.name, color: gpx2.color, hourlyData: stats2.hourly });
        }
        GPXCharts.renderHourlyBarChart('hourlyBarChart', hourlyChartData);

        // Render Continuous Elevation Profile Line Chart (Overlaid on same chart, with integrated distance bars if calculated)
        const profileChartData = [
            { name: gpx1.name, color: gpx1.color, profileData: stats1.elevationProfile }
        ];
        if (hasGpx2) {
            profileChartData.push({ name: gpx2.name, color: gpx2.color, profileData: stats2.elevationProfile });
        }
        GPXCharts.renderElevationLineChart(
            'elevationLineChart',
            profileChartData,
            state.currentProximityResult ? state.currentProximityResult.alertIntervals : [],
            state.currentProximityResult
        );

        updateUI();
    }

    function removeGpx(index) {
        state.gpxList.splice(index, 1);
        
        if (state.selectedGpxIndex1 === index) {
            state.selectedGpxIndex1 = state.gpxList.length > 0 ? 0 : -1;
        } else if (state.selectedGpxIndex1 > index) {
            state.selectedGpxIndex1--;
        }

        if (state.selectedGpxIndex2 === index) {
            state.selectedGpxIndex2 = -1;
        } else if (state.selectedGpxIndex2 > index) {
            state.selectedGpxIndex2--;
        }

        if (state.selectedGpxIndex1 >= 0) {
            selectGpxPair(state.selectedGpxIndex1, state.selectedGpxIndex2);
        } else {
            updateUI();
            clearStatsAndCharts();
        }
    }

    function clearStatsAndCharts() {
        document.getElementById('statHeaderGpx1').textContent = 'GPX 1';
        document.getElementById('statHeaderGpx2').style.display = 'none';
        document.querySelectorAll('.stat-val-2').forEach(el => el.style.display = 'none');
        document.getElementById('totalHorizontalDist1').textContent = '-';
        document.getElementById('totalVerticalDist1').textContent = '-';
        document.getElementById('avgHourlyDist1').textContent = '-';
        document.getElementById('elevRange1').textContent = '-';
        document.getElementById('elevDiff1').textContent = '-';
        document.getElementById('exportStatsTextBtn').disabled = true;
        const exportPdfBtn = document.getElementById('exportPdfReportBtn');
        if (exportPdfBtn) exportPdfBtn.disabled = true;

        document.getElementById('tableBlock2').style.display = 'none';
        document.getElementById('hourlyTable1').querySelector('tbody').innerHTML = '<tr><td colspan="8" class="text-center">対象GPXを選択してください</td></tr>';
        
        if (GPXCharts.hourlyChartInstance) GPXCharts.hourlyChartInstance.destroy();
        if (GPXCharts.elevationChartInstance) GPXCharts.elevationChartInstance.destroy();
    }

    function renderDualHourlyTables(gpx1, stats1, gpx2, stats2) {
        const titleEl = document.getElementById('tableTitle');
        const table1Heading = document.getElementById('table1Heading');
        const tableBlock2 = document.getElementById('tableBlock2');
        const table2Heading = document.getElementById('table2Heading');

        if (gpx2 && stats2) {
            if (titleEl) titleEl.textContent = `📊 1時間区間ごとの移動統計比較: ${gpx1.name} vs ${gpx2.name}`;
            table1Heading.innerHTML = `<i class="fa-solid fa-person-walking text-primary"></i> <b>${gpx1.name}</b>`;
            table2Heading.innerHTML = `<i class="fa-solid fa-person-walking text-danger"></i> <b>${gpx2.name}</b>`;
            tableBlock2.style.display = 'flex';
            populateTableBody('hourlyTable2', stats2.hourly);
        } else {
            if (titleEl) titleEl.textContent = `📊 1時間区間ごとの移動距離・標高統計 (毎時00分開始) - ${gpx1.name}`;
            table1Heading.innerHTML = `<i class="fa-solid fa-person-walking text-primary"></i> <b>${gpx1.name}</b>`;
            tableBlock2.style.display = 'none';
        }

        populateTableBody('hourlyTable1', stats1.hourly);
    }

    function populateTableBody(tableId, hourlyData) {
        const tbody = document.getElementById(tableId).querySelector('tbody');
        if (!hourlyData || hourlyData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">集計可能なデータがありません</td></tr>';
            return;
        }

        tbody.innerHTML = hourlyData.map((h, hIdx) => `
            <tr data-hour-idx="${hIdx}">
                <td><b>${h.label}</b></td>
                <td>${h.horizontalDistM.toFixed(1)}</td>
                <td>${h.avgPerMinM.toFixed(1)}</td>
                <td>+${h.climbM.toFixed(1)}</td>
                <td>-${h.descentM.toFixed(1)}</td>
                <td>${h.minEle.toFixed(1)}</td>
                <td>${h.maxEle.toFixed(1)}</td>
                <td>${h.pointCount}</td>
            </tr>
        `).join('');

        tbody.querySelectorAll('tr').forEach(tr => {
            tr.addEventListener('mouseenter', () => {
                const hIdx = parseInt(tr.getAttribute('data-hour-idx'));
                if (!isNaN(hIdx)) {
                    tr.classList.add('hovered');
                    highlightHourOnMap(hourlyData[hIdx]);
                }
            });
            tr.addEventListener('mouseleave', () => {
                tr.classList.remove('hovered');
                state.highlightSegmentLayer.clearLayers();
            });
        });
    }

    function highlightHourOnMap(hourObj) {
        state.highlightSegmentLayer.clearLayers();
        if (!hourObj || !hourObj.points || hourObj.points.length < 2) return;

        const latlngs = hourObj.points.map(p => [p.lat, p.lon]);
        const line = L.polyline(latlngs, {
            color: '#eab308',
            weight: 8,
            opacity: 0.95
        }).addTo(state.highlightSegmentLayer);

        line.bindPopup(`<b>時間帯: ${hourObj.label}</b><br>水平移動: ${hourObj.horizontalDistM.toFixed(1)}m<br>垂直上昇: +${hourObj.climbM.toFixed(1)}m`).openPopup();
    }

    // GPX Select dropdown listeners
    document.getElementById('targetGpxSelect1').addEventListener('change', (e) => {
        const idx = parseInt(e.target.value);
        if (!isNaN(idx)) selectGpxPair(idx, state.selectedGpxIndex2);
    });

    document.getElementById('targetGpxSelect2').addEventListener('change', (e) => {
        const idx = parseInt(e.target.value);
        selectGpxPair(state.selectedGpxIndex1, isNaN(idx) ? -1 : idx);
    });

    // -------------------------------------------------------------
    // 7. GPX Merge, Stats Export, PNG Export
    // -------------------------------------------------------------
    document.getElementById('mergeGpxBtn').addEventListener('click', () => {
        if (state.gpxList.length < 2) return;
        const mergedXml = GPXParser.mergeGpxFiles(state.gpxList, 'Merged_Forestry_Tracks');
        const blob = new Blob([mergedXml], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `merged_forestry_tracks_${new Date().toISOString().slice(0,10)}.gpx`;
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('exportStatsTextBtn').addEventListener('click', () => {
        if (state.selectedGpxIndex1 < 0) return;
        const gpx1 = state.gpxList[state.selectedGpxIndex1];
        const stats1 = GPXStats.analyze(gpx1);
        let textContent = GPXStats.formatAsText(gpx1.name, stats1);

        if (state.selectedGpxIndex2 >= 0) {
            const gpx2 = state.gpxList[state.selectedGpxIndex2];
            const stats2 = GPXStats.analyze(gpx2);
            textContent += '\n\n' + '='.repeat(60) + '\n' + GPXStats.formatAsText(gpx2.name, stats2);
        }

        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const outName = state.selectedGpxIndex2 >= 0 ? `${gpx1.name}_vs_${state.gpxList[state.selectedGpxIndex2].name}` : gpx1.name;
        a.download = `${outName}_stats_report.txt`;
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('saveHourlyChartPng').addEventListener('click', () => {
        const gpxName = state.selectedGpxIndex1 >= 0 ? state.gpxList[state.selectedGpxIndex1].name : 'track';
        GPXCharts.saveChartAsPng(GPXCharts.hourlyChartInstance, `${gpxName}_hourly_distance_chart.png`);
    });

    document.getElementById('saveElevChartPng').addEventListener('click', () => {
        const gpxName = state.selectedGpxIndex1 >= 0 ? state.gpxList[state.selectedGpxIndex1].name : 'track';
        GPXCharts.saveChartAsPng(GPXCharts.elevationChartInstance, `${gpxName}_elevation_profile_chart.png`);
    });

    // -------------------------------------------------------------
    // 8. Proximity Alert Calculation, Risk Mesh & GeoJSON Export
    // -------------------------------------------------------------
    document.getElementById('calcDistanceBtn').addEventListener('click', () => {
        if (state.selectedGpxIndex1 < 0 || state.selectedGpxIndex2 < 0) {
            alert('移動統計で比較する2つのGPXを選択してください');
            return;
        }

        const srcGpx = state.gpxList[state.selectedGpxIndex1];
        const tgtGpx = state.gpxList[state.selectedGpxIndex2];
        const threshold = parseFloat(document.getElementById('dangerThresholdInput').value) || 20.0;
        const startTime = document.getElementById('alertStartTime').value;
        const endTime = document.getElementById('alertEndTime').value;
        const intervalMin = parseFloat(document.getElementById('alertIntervalSelect').value) || 1.0;

        const result = GPXDistance.calculate(srcGpx, tgtGpx, threshold, {
            startTime: startTime,
            endTime: endTime,
            intervalMin: intervalMin
        });
        result.threshold = threshold;
        state.currentProximityResult = result;

        // Update stats box UI
        document.getElementById('thresholdLabel').textContent = threshold;
        document.getElementById('minDistanceVal').textContent = `${result.minDistanceM.toFixed(1)} m`;
        document.getElementById('avgDistanceVal').textContent = `${result.avgDistanceM.toFixed(1)} m`;
        document.getElementById('dangerPointCountVal').textContent = `${result.dangerCount} 点`;
        const alertIntervalsCountEl = document.getElementById('alertIntervalsCountVal');
        if (alertIntervalsCountEl) {
            alertIntervalsCountEl.textContent = `${result.alertIntervals.length} 区間`;
        }
        document.getElementById('distanceStatsBox').style.display = 'block';
        document.getElementById('exportGeoJsonBtn').disabled = false;

        // Highlight alert intervals and integrate 2-point distance bar chart inside Elevation Profile Chart
        const stats1 = GPXStats.analyze(srcGpx);
        const stats2 = GPXStats.analyze(tgtGpx);
        const profileChartData = [
            { name: srcGpx.name, color: srcGpx.color, profileData: stats1.elevationProfile },
            { name: tgtGpx.name, color: tgtGpx.color, profileData: stats2.elevationProfile }
        ];
        GPXCharts.renderElevationLineChart('elevationLineChart', profileChartData, result.alertIntervals, result);

        // Switch to elevation composite chart tab
        const elevTabBtn = document.querySelector('.tab-btn[data-tab="elevationChartTab"]');
        if (elevTabBtn) elevTabBtn.click();

        // Render proximity alert points only (no lines between points as requested)
        state.proximityLayerGroup.clearLayers();

        result.lines.forEach(item => {
            const sp = item.sourcePoint;

            if (item.isDanger) {
                const marker = L.circleMarker([sp.lat, sp.lon], {
                    radius: 7,
                    color: '#dc2626',
                    fillColor: '#ef4444',
                    fillOpacity: 0.9,
                    weight: 2
                }).addTo(state.proximityLayerGroup);

                marker.bindPopup(`
                    <div style="font-size:12px; line-height:1.4;">
                        <b style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> 接近インシデント地点</b><br>
                        対象ペア: <b>${srcGpx.name} ⇔ ${tgtGpx.name}</b><br>
                        離隔距離: <b style="color:#dc2626; font-size:13px;">${item.distanceM.toFixed(1)} m</b><br>
                        測位時刻: ${sp.time ? new Date(sp.time).toLocaleTimeString('ja-JP') : '-'}<br>
                        標高: ${sp.ele.toFixed(1)} m
                    </div>
                `);
                marker.bindTooltip(`⚠️ 接近アラート: ${item.distanceM.toFixed(1)}m`, { sticky: true });
            }
        });

        // Generate and render 10m Risk Distribution Mesh
        state.riskMeshLayerGroup.clearLayers();
        const riskMesh = GPXDistance.generateRiskMesh10m(result.alertPoints, GISLayerLoader.polygonLayers);
        state.currentRiskMeshResult = riskMesh;

        if (riskMesh.features && riskMesh.features.length > 0) {
            L.geoJSON(riskMesh, {
                filter: function(feature) {
                    return (feature.properties.alert_point_count || 0) > 0;
                },
                style: function(feature) {
                    return {
                        stroke: true, // 白色の非常に細い実線
                        color: '#ffffff',
                        weight: 0.75,
                        opacity: 0.90,
                        fill: true,
                        fillColor: feature.properties.risk_color || '#dc2626',
                        fillOpacity: 0.72
                    };
                },
                onEachFeature: function(feature, layer) {
                    const p = feature.properties;
                    layer.bindPopup(`
                        <div style="font-size:12px; line-height:1.45;">
                            <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                                <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:${p.risk_color}; border:1px solid #333;"></span>
                                <b style="color:${p.risk_color}; font-size:13px;">10mリスクメッシュ [Lv.${p.risk_step_10}/10]</b>
                            </div>
                            リスク評価: <b>${p.risk_level}</b><br>
                            危険接近点数: <b>${p.alert_point_count} 点</b> / 最多 ${p.max_count} 点 (比率: ${(p.risk_ratio * 100).toFixed(0)}%)<br>
                            最小離隔距離: <b>${p.min_distance_m} m</b><br>
                            セル中心座標: ${p.center_lat}, ${p.center_lon}
                        </div>
                    `);
                    layer.bindTooltip(`⚠️ 10mリスク: ${p.risk_level} (${p.alert_point_count}点)`, { sticky: true });
                }
            }).addTo(state.riskMeshLayerGroup);

            const exportMeshBtn = document.getElementById('exportRiskMeshBtn');
            if (exportMeshBtn) exportMeshBtn.disabled = false;
        } else {
            const exportMeshBtn = document.getElementById('exportRiskMeshBtn');
            if (exportMeshBtn) exportMeshBtn.disabled = true;
        }
    });

    // Proximity Alert Points GeoJSON Export
    document.getElementById('exportGeoJsonBtn').addEventListener('click', () => {
        if (!state.currentProximityResult || !state.currentProximityResult.geoJson) return;

        const jsonStr = JSON.stringify(state.currentProximityResult.geoJson, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/geo+json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const srcName = state.gpxList[state.selectedGpxIndex1].name;
        const tgtName = state.gpxList[state.selectedGpxIndex2].name;
        a.download = `${srcName}_vs_${tgtName}_proximity_alert_points.geojson`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // 10m Risk Distribution Mesh GeoJSON Export
    const exportRiskMeshBtn = document.getElementById('exportRiskMeshBtn');
    if (exportRiskMeshBtn) {
        exportRiskMeshBtn.addEventListener('click', () => {
            if (!state.currentRiskMeshResult || !state.currentRiskMeshResult.features || state.currentRiskMeshResult.features.length === 0) {
                alert('リスク分布メッシュデータがありません。先に接近アラート計算を実行してください。');
                return;
            }

            const jsonStr = JSON.stringify(state.currentRiskMeshResult, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/geo+json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const srcName = state.gpxList[state.selectedGpxIndex1] ? state.gpxList[state.selectedGpxIndex1].name : 'forestry';
            a.download = `${srcName}_10m_risk_mesh.geojson`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    // -------------------------------------------------------------
    // PDF Report Generator (Comprehensive Printable Summary)
    // -------------------------------------------------------------
    const exportPdfReportBtn = document.getElementById('exportPdfReportBtn');
    if (exportPdfReportBtn) {
        exportPdfReportBtn.addEventListener('click', async () => {
            if (state.selectedGpxIndex1 < 0) {
                alert('出力するGPXデータがありません。先にGPXを読み込んでください。');
                return;
            }

            const origBtnHtml = exportPdfReportBtn.innerHTML;
            exportPdfReportBtn.disabled = true;
            exportPdfReportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> レポート生成中...';

            try {
                // 1. Capture current map as static PNG image
                let mapImgSrc = '';
                try {
                    if (window.html2canvas) {
                        const mapEl = document.getElementById('map');
                        const canvas = await html2canvas(mapEl, {
                            useCORS: true,
                            allowTaint: true,
                            logging: false,
                            ignoreElements: (el) => {
                                return el.classList && (
                                    el.classList.contains('leaflet-control-container') ||
                                    el.classList.contains('map-status-overlay') ||
                                    el.classList.contains('floating-open-btn')
                                );
                            }
                        });
                        mapImgSrc = canvas.toDataURL('image/png');
                    }
                } catch (mapErr) {
                    console.error('Map image capture error:', mapErr);
                }

                const gpx1 = state.gpxList[state.selectedGpxIndex1];
                const stats1 = GPXStats.analyze(gpx1);
                const hasGpx2 = state.selectedGpxIndex2 >= 0;
                const gpx2 = hasGpx2 ? state.gpxList[state.selectedGpxIndex2] : null;
                const stats2 = hasGpx2 ? GPXStats.analyze(gpx2) : null;

                // Chart images
                let hourlyImgSrc = '';
                let elevationImgSrc = '';
                if (GPXCharts.hourlyChartInstance) {
                    hourlyImgSrc = GPXCharts.hourlyChartInstance.toBase64Image();
                }
                if (GPXCharts.elevationChartInstance) {
                    elevationImgSrc = GPXCharts.elevationChartInstance.toBase64Image();
                }

                // Detect active base tile layer from UI map
                let activeBaseName = '国土地理院 標準地図';
                state.map.eachLayer(l => {
                    if (l instanceof L.TileLayer && l._url) {
                        if (l._url.includes('seamlessphoto')) activeBaseName = '国土地理院 航空写真';
                        else if (l._url.includes('relief')) activeBaseName = '国土地理院 陰影起伏図';
                        else if (l._url.includes('openstreetmap')) activeBaseName = 'OpenStreetMap';
                        else if (l._url.includes('gsi.go.jp/xyz/std')) activeBaseName = '国土地理院 標準地図';
                    }
                });

                // Check UI layer visibility states
                const isTracksVisible = state.map.hasLayer(state.gpxTracksLayer);
                const isPointsVisible = state.map.hasLayer(state.gpxPointsLayer);
                const isProximityVisible = state.map.hasLayer(state.proximityLayerGroup);
                const isRiskMeshVisible = state.map.hasLayer(state.riskMeshLayerGroup);
                const isPolygonVisible = state.map.hasLayer(state.polygonLayerGroup);
                const isMediaVisible = state.map.hasLayer(state.mediaLayerGroup);
                const isNearMissVisible = typeof NearMissManager !== 'undefined' && NearMissManager.layerGroup && state.map.hasLayer(NearMissManager.layerGroup);
                const isHprVisible = GISLayerLoader.layerList.some(item => item.type === 'hpr' && item.visible !== false);

                const trackCount = isTracksVisible ? state.gpxList.length : 0;
                const polygonCount = isPolygonVisible ? GISLayerLoader.layerList.filter(item => item.type === 'polygon' && item.visible !== false).length : 0;
                const mediaItems = (isMediaVisible && MediaLoader.mediaList) ? MediaLoader.mediaList.filter(m => m.lat !== null && m.lon !== null) : [];
                const nearMissItems = (typeof NearMissManager !== 'undefined' && NearMissManager.reports) ? NearMissManager.reports : [];

                const nowStr = new Date().toLocaleString('ja-JP', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                });

                // Build dynamic legend HTML
                const legendItems = [];
                legendItems.push(`<div class="map-legend-item"><span style="font-weight:bold; color:#0f172a;">🗺️ 背景:</span> ${activeBaseName}</div>`);
                if (trackCount > 0) {
                    legendItems.push(`<div class="map-legend-item"><span style="display:inline-block; width:16px; height:3px; background:#2563eb;"></span> GPX軌跡ライン (${trackCount}件)</div>`);
                }
                if (isPointsVisible) {
                    legendItems.push(`<div class="map-legend-item"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#16a34a;"></span> GPX測位ポイント</div>`);
                }
                if (polygonCount > 0) {
                    legendItems.push(`<div class="map-legend-item"><span style="display:inline-block; width:16px; height:2px; background:#dc2626;"></span> 林班ポリゴン (${polygonCount}件)</div>`);
                }
                if (isHprVisible) {
                    legendItems.push(`<div class="map-legend-item"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#059669; border:1px solid #fff;"></span> HPR伐倒単木 (樹種別)</div>`);
                }
                if (isRiskMeshVisible && state.currentRiskMeshResult) {
                    legendItems.push(`<div class="map-legend-item"><span style="display:inline-block; width:10px; height:10px; border:1px solid #cbd5e1; background:linear-gradient(to right, #eab308, #dc2626);"></span> 10m危険リスクメッシュ (黄→赤)</div>`);
                }
                if (isProximityVisible && state.currentProximityResult) {
                    legendItems.push(`<div class="map-legend-item"><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#dc2626;"></span> 接近アラート地点</div>`);
                }
                if (isNearMissVisible && nearMissItems.length > 0) {
                    legendItems.push(`<div class="map-legend-item"><span style="display:inline-block; width:10px; height:10px; background:#facc15; border:1px solid #1f2937; clip-path: polygon(50% 0%, 0% 100%, 100% 100%);"></span> ⚠️ ヒヤリハット報告 (${nearMissItems.length}件)</div>`);
                }
                if (mediaItems.length > 0) {
                    legendItems.push(`<div class="map-legend-item"><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#0284c7;"></span> 現地写真・メディア (${mediaItems.length}件)</div>`);
                }

                // Build Hourly Rows HTML
                const buildHourlyRows = (hourlyData) => {
                    if (!hourlyData || hourlyData.length === 0) return '<tr><td colspan="8">データなし</td></tr>';
                    return hourlyData.map(h => `
                        <tr>
                            <td><b>${h.label}</b></td>
                            <td>${h.horizontalDistM.toFixed(1)} m</td>
                            <td>${h.avgPerMinM.toFixed(1)} m/分</td>
                            <td>+${h.climbM.toFixed(1)} m</td>
                            <td>-${h.descentM.toFixed(1)} m</td>
                            <td>${h.minEle.toFixed(1)} m</td>
                            <td>${h.maxEle.toFixed(1)} m</td>
                            <td>${h.pointCount}</td>
                        </tr>
                    `).join('');
                };

                // Proximity section HTML
                let proximityHtml = '<p style="color:#64748b; font-size:12px;">※接近・アラート解析は未実行です。</p>';
                if (state.currentProximityResult) {
                    const pr = state.currentProximityResult;
                    const threshold = document.getElementById('dangerThresholdInput').value || 20;
                    proximityHtml = `
                        <table class="report-table">
                            <tr>
                                <th style="width:25%;">解析ペア</th>
                                <td><b>${gpx1.name}</b> ⇔ <b>${gpx2 ? gpx2.name : '-'}</b></td>
                                <th style="width:25%;">危険接近閾値</th>
                                <td><b>${threshold} m</b></td>
                            </tr>
                            <tr>
                                <th>最小離隔距離</th>
                                <td><b style="color:#dc2626; font-size:14px;">${pr.minDistanceM.toFixed(1)} m</b></td>
                                <th>平均離隔距離</th>
                                <td>${pr.avgDistanceM.toFixed(1)} m</td>
                            </tr>
                            <tr>
                                <th>危険接近測位点数</th>
                                <td><b style="color:#dc2626;">${pr.dangerCount} 点</b></td>
                                <th>検知アラート区間数</th>
                                <td><b style="color:#ea580c;">${pr.alertIntervals.length} 区間</b></td>
                            </tr>
                        </table>
                    `;
                }

                // 10m Risk Mesh section HTML
                let riskMeshHtml = '';
                if (state.currentRiskMeshResult && state.currentRiskMeshResult.features) {
                    const cells = state.currentRiskMeshResult.features.filter(c => (c.properties.alert_point_count || 0) > 0);
                    if (cells.length > 0) {
                        const maxC = cells[0]?.properties?.max_count || 1;
                        const highRisk = cells.filter(c => c.properties.risk_step_10 >= 8).length;
                        const medRisk = cells.filter(c => c.properties.risk_step_10 >= 5 && c.properties.risk_step_10 < 8).length;
                        const lowRisk = cells.filter(c => c.properties.risk_step_10 < 5).length;
                        riskMeshHtml = `
                            <div style="margin-top:10px; padding:10px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #dc2626; border-radius:4px; font-size:12px;">
                                <b>10mリスク分布メッシュ集計 (危険接近エリアのみ抽出):</b><br>
                                危険検知セル総数: <b>${cells.length}</b> 箇所 / セル内最多接近点数: <b>${maxC}</b> 点<br>
                                ・高リスク (赤系 Lv.8-10): <b>${highRisk}</b> 箇所<br>
                                ・中リスク (黄系 Lv.5-7): <b>${medRisk}</b> 箇所<br>
                                ・低リスク〜注意 (Lv.1-4): <b>${lowRisk}</b> 箇所
                            </div>
                        `;
                    }
                }

                // Dynamic Section Numbering
                let secNum = 1;
                const secTitle = (title) => `<h2>${secNum++}. ${title}</h2>`;

                const buildNearMissSectionHtml = () => {
                    if (nearMissItems.length === 0) return '';
                    
                    const cat1Counts = {};
                    nearMissItems.forEach(r => {
                        const c = r.category1 || 'その他';
                        cat1Counts[c] = (cat1Counts[c] || 0) + 1;
                    });
                    const cat1Summary = Object.entries(cat1Counts).map(([k, v]) => `${k}: <b>${v}</b>件`).join(' / ');

                    return `
                        ${secTitle(`⚠️ ヒヤリハット報告・危険事例一覧 (${nearMissItems.length}件)`)}
                        <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 10px;">
                            <div class="kpi-card" style="border-left: 4px solid #eab308;">
                                <div class="kpi-label">総報告件数</div>
                                <div class="kpi-val">${nearMissItems.length} 件</div>
                            </div>
                            <div class="kpi-card" style="border-left: 4px solid #0284c7; grid-column: span 2;">
                                <div class="kpi-label">作業分類①別 内訳</div>
                                <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 2px;">
                                    ${cat1Summary}
                                </div>
                            </div>
                        </div>
                        <table class="report-table">
                            <thead>
                                <tr>
                                    <th style="width: 28px; text-align: center;">No.</th>
                                    <th style="width: 100px;">いつ (日時/時間帯)</th>
                                    <th style="width: 105px;">分類① / 分類②</th>
                                    <th style="width: 95px;">誰が・何が</th>
                                    <th style="width: 65px;">何を</th>
                                    <th style="width: 130px;">どのようにして</th>
                                    <th style="width: 120px;">どうなった</th>
                                    <th>対応策</th>
                                    <th style="width: 85px;">位置 (座標)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${nearMissItems.map((r, idx) => {
                                    const c1 = r.category1 || '-';
                                    const c2 = r.category2 || '-';
                                    const dateStr = r.date || (r.datetime ? r.datetime.slice(0, 10) : '-');
                                    const timeStr = r.timeSlot || (r.datetime ? r.datetime.slice(11) : '-');
                                    const whoStr = r.who || r.involvedTarget || '-';
                                    const whatStr = r.what || r.category || '-';
                                    const howStr = r.how || r.description || '-';
                                    const resultStr = r.result || '-';
                                    const cmStr = r.countermeasure || '-';

                                    return `
                                        <tr>
                                            <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
                                            <td style="font-size: 10.5px;">${dateStr}<br><span style="color:#64748b;">${timeStr}</span></td>
                                            <td style="font-size: 11px;">
                                                <span style="font-weight: bold; color: #0369a1;">[${c1}]</span><br>
                                                <span style="color: #334155;">${c2}</span>
                                            </td>
                                            <td style="font-size: 11px; font-weight: 600; color: #0f172a;">${whoStr}</td>
                                            <td style="font-size: 11px; font-weight: 600; color: #0f172a;">${whatStr}</td>
                                            <td style="font-size: 10.5px; color: #334155; white-space: pre-wrap;">${howStr}</td>
                                            <td style="font-size: 10.5px; color: #991b1b; white-space: pre-wrap;">${resultStr}</td>
                                            <td style="font-size: 10.5px; color: #166534; white-space: pre-wrap;">${cmStr}</td>
                                            <td style="font-size: 9.5px; color: #64748b; font-family: monospace;">${r.lat.toFixed(5)},<br>${r.lon.toFixed(5)}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    `;
                };

                const reportHtml = `
                <!DOCTYPE html>
                <html lang="ja">
                <head>
                    <meta charset="UTF-8">
                    <title>林業現場GPS-GIS解析報告書 - ${gpx1.name}</title>
                    <style>
                        * { box-sizing: border-box; margin: 0; padding: 0; }
                        body { font-family: "Hiragino Kaku Gothic ProN", Meiryo, sans-serif; color: #1e293b; background: #fff; padding: 20px; font-size: 13px; line-height: 1.5; }
                        .report-header { border-bottom: 3px solid #15803d; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
                        .report-title { font-size: 20px; font-weight: 700; color: #15803d; }
                        .report-meta { font-size: 11px; color: #64748b; text-align: right; }
                        h2 { font-size: 14px; font-weight: 700; color: #0f172a; margin: 16px 0 8px 0; border-left: 4px solid #16a34a; padding-left: 8px; }
                        .report-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12px; }
                        .report-table th, .report-table td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
                        .report-table th { background: #f1f5f9; color: #334155; font-weight: 600; }
                        .chart-container { margin: 10px 0; text-align: center; page-break-inside: avoid; }
                        .chart-img { max-width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 4px; }
                        .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
                        .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
                        .kpi-label { font-size: 11px; color: #64748b; }
                        .kpi-val { font-size: 16px; font-weight: 700; color: #0f172a; }
                        .map-legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: #475569; margin-top: 4px; padding: 4px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; }
                        .map-legend-item { display: flex; align-items: center; gap: 4px; }
                        @media print {
                            body { padding: 0; }
                            @page { size: A4 portrait; margin: 10mm; }
                            .no-print { display: none; }
                            .page-break { page-break-before: always; }
                        }
                    </style>
                </head>
                <body>
                    <div class="no-print" style="margin-bottom: 15px; padding: 10px; background: #e0f2fe; border: 1px solid #7dd3fc; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size:13px; font-weight:bold; color:#0369a1;">📄 印刷プレビュー (ブラウザの「PDFとして保存」または印刷をご利用ください)</span>
                        <button onclick="window.print()" style="padding: 6px 16px; background: #0284c7; color: #fff; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">印刷 / PDF保存</button>
                    </div>

                    <div class="report-header">
                        <div>
                            <div class="report-title">🌲 林業現場GPS-GIS解析報告書</div>
                            <div style="font-size: 12px; color: #475569; margin-top: 2px;">作業動線・移動統計・標高プロファイル・接近アラート・ヒヤリハット解析</div>
                        </div>
                        <div class="report-meta">
                            <div>作成日時: ${nowStr}</div>
                            <div>対象現場: 緯度 ${state.map.getCenter().lat.toFixed(6)}, 経度 ${state.map.getCenter().lng.toFixed(6)}</div>
                        </div>
                    </div>

                    ${secTitle('移動統計・標高集計サマリー (KPIカード表示)')}
                    <div class="kpi-grid">
                        <div class="kpi-card">
                            <div class="kpi-label">総水平移動距離 [${gpx1.name}]</div>
                            <div class="kpi-val">${(stats1.totalHorizontalDistM / 1000).toFixed(2)} km (${stats1.totalHorizontalDistM.toFixed(0)}m)</div>
                            ${hasGpx2 ? `<div style="font-size:11px; color:#dc2626; margin-top:2px;">[${gpx2.name}]: ${(stats2.totalHorizontalDistM / 1000).toFixed(2)} km</div>` : ''}
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-label">累積上昇 / 下降量 [${gpx1.name}]</div>
                            <div class="kpi-val">+${stats1.totalClimbM.toFixed(0)}m / -${stats1.totalDescentM.toFixed(0)}m</div>
                            ${hasGpx2 ? `<div style="font-size:11px; color:#dc2626; margin-top:2px;">[${gpx2.name}]: +${stats2.totalClimbM.toFixed(0)}m / -${stats2.totalDescentM.toFixed(0)}m</div>` : ''}
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-label">平均移動速度 / 標高範囲 [${gpx1.name}]</div>
                            <div class="kpi-val">${stats1.avgHourlyDistM.toFixed(0)} m/時</div>
                            <div style="font-size:11px; color:#64748b;">標高: ${stats1.minElevationM.toFixed(0)}m 〜 ${stats1.maxElevationM.toFixed(0)}m (差:${stats1.elevationDiffM.toFixed(0)}m)</div>
                        </div>
                    </div>

                    ${secTitle('GIS現場地図 (UI表示レイヤ連動)')}
                    ${mapImgSrc ? `
                    <div class="chart-container">
                        <img class="chart-img" src="${mapImgSrc}" alt="GIS現場地図" style="max-height: 420px; width: 100%; object-fit: contain; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px;">
                    </div>
                    ` : '<p style="color:#64748b; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px;">※地図キャプチャ画像を取得できませんでした</p>'}
                    <div class="map-legend">
                        ${legendItems.join('')}
                    </div>

                    <div class="page-break"></div>

                    ${secTitle(`1時間区間統計詳細表 (${gpx1.name})`)}
                    <table class="report-table">
                        <thead>
                            <tr>
                                <th>時間帯 (JST)</th>
                                <th>水平移動距離</th>
                                <th>平均分速</th>
                                <th>垂直上昇</th>
                                <th>垂直下降</th>
                                <th>最低標高</th>
                                <th>最高標高</th>
                                <th>測位点数</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${buildHourlyRows(stats1.hourly)}
                        </tbody>
                    </table>

                    ${hasGpx2 ? `
                    ${secTitle(`1時間区間統計詳細表 (${gpx2.name})`)}
                    <table class="report-table">
                        <thead>
                            <tr>
                                <th>時間帯 (JST)</th>
                                <th>水平移動距離</th>
                                <th>平均分速</th>
                                <th>垂直上昇</th>
                                <th>垂直下降</th>
                                <th>最低標高</th>
                                <th>最高標高</th>
                                <th>測位点数</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${buildHourlyRows(stats2.hourly)}
                        </tbody>
                    </table>
                    ` : ''}

                    ${secTitle('1時間区間ごとの移動距離・上昇量グラフ')}
                    ${hourlyImgSrc ? `<div class="chart-container"><img class="chart-img" src="${hourlyImgSrc}" alt="1時間移動距離グラフ"></div>` : '<p>グラフ未描画</p>'}

                    <div class="page-break"></div>

                    ${secTitle('接近・アラート解析 & 10mリスク分布評価')}
                    ${proximityHtml}
                    ${riskMeshHtml}

                    ${secTitle('連続標高プロファイル & 2地点間離隔距離 複合グラフ')}
                    ${elevationImgSrc ? `<div class="chart-container"><img class="chart-img" src="${elevationImgSrc}" alt="標高・離隔距離複合グラフ"></div>` : '<p>グラフ未描画</p>'}

                    ${buildNearMissSectionHtml()}

                    ${mediaItems.length > 0 ? `
                    ${secTitle(`現地写真・メディア一覧 (${mediaItems.length}件)`)}
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px;">
                        ${mediaItems.map(m => `
                            <div style="border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px; background: #f8fafc; font-size: 11px;">
                                ${m.type === 'image' ? `<img src="${m.url}" style="width: 100%; height: 75px; object-fit: cover; border-radius: 2px; margin-bottom: 4px;">` : `<div style="height: 75px; background: #e2e8f0; display: flex; align-items: center; justify-content: center; border-radius: 2px; margin-bottom: 4px; color: #475569;">🎬 動画</div>`}
                                <div style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${m.name}</div>
                                <div style="color: #64748b;">${m.is360 ? '360°パノラマ' : (m.type === 'video' ? '動画' : '写真')} (${m.lat.toFixed(5)}, ${m.lon.toFixed(5)})</div>
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}

                    <div style="margin-top: 20px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px;">
                        林業GPX-GIS解析システム | 国土地理院タイル & Leaflet & Chart.js エンジン
                    </div>
                </body>
                </html>
                `;

                const printWindow = window.open('', '_blank');
                if (printWindow) {
                    printWindow.document.open();
                    printWindow.document.write(reportHtml);
                    printWindow.document.close();
                    printWindow.focus();
                } else {
                    alert('ポップアップがブロックされました。ブラウザのポップアップ許可設定をご確認ください。');
                }
            } catch (err) {
                console.error('PDF Report generation error:', err);
                alert('レポートの生成中にエラーが発生しました: ' + err.message);
            } finally {
                exportPdfReportBtn.disabled = false;
                exportPdfReportBtn.innerHTML = origBtnHtml;
            }
        });
    }

    // -------------------------------------------------------------
    // 9. Tab Switching (Bottom Panel & Sidebar)
    // -------------------------------------------------------------
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    document.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.sidebar-tab-pane').forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const tabId = btn.getAttribute('data-sidebar-tab');
            const targetPane = document.getElementById(tabId);
            if (targetPane) targetPane.classList.add('active');
        });
    });

    // -------------------------------------------------------------
    // 10. Sample Loader (GPX, Photos, 360, Videos, Polygons, GeoTIFF)
    // -------------------------------------------------------------
    document.getElementById('loadSampleBtn').addEventListener('click', () => {
        loadSampleData();
    });

    document.getElementById('clearAllBtn').addEventListener('click', () => {
        state.gpxList = [];
        state.selectedGpxIndex1 = -1;
        state.selectedGpxIndex2 = -1;
        state.currentProximityResult = null;
        state.currentRiskMeshResult = null;
        MediaLoader.mediaList = [];
        if (state.gpxTracksLayer) state.gpxTracksLayer.clearLayers();
        if (state.gpxPointsLayer) state.gpxPointsLayer.clearLayers();
        if (state.proximityLayerGroup) state.proximityLayerGroup.clearLayers();
        if (state.riskMeshLayerGroup) state.riskMeshLayerGroup.clearLayers();
        if (state.mediaLayerGroup) state.mediaLayerGroup.clearLayers();
        GISLayerLoader.clearAll();
        NearMissManager.clearAll();
        document.getElementById('distanceStatsBox').style.display = 'none';
        document.getElementById('exportGeoJsonBtn').disabled = true;
        const exportMeshBtnEl = document.getElementById('exportRiskMeshBtn');
        if (exportMeshBtnEl) exportMeshBtnEl.disabled = true;
        const noticeEl = document.getElementById('geotiffNotice');
        if (noticeEl) noticeEl.style.display = 'none';
        updateUI();
        updateMediaUI();
        updateGisLayerUI();
        clearStatsAndCharts();
    });

    function loadSampleData() {
        const baseLat = 36.593393, baseLon = 136.774920, baseElev = 320.0;
        const startDt = new Date(2026, 8, 3, 8, 30, 0);
        const totalPoints = 300;
        const stepSec = 30;

        const makeGpx = (name, latFn, lonFn, elevFn) => {
            const pts = [];
            for (let i = 0; i < totalPoints; i++) {
                const t = i * stepSec;
                const dt = new Date(startDt.getTime() + t * 1000);
                pts.push({
                    lat: latFn(t),
                    lon: lonFn(t),
                    ele: elevFn(t),
                    time: dt
                });
            }
            return {
                fileName: `${name}.gpx`,
                name: name,
                points: pts
            };
        };

        const s1 = makeGpx('作業者_田中(伐倒)',
            t => baseLat + 0.0010 + 0.0003 * Math.sin(t / 800) + (t > 3000 && t < 3600 ? 0.00003 : 0),
            t => baseLon + 0.0008 + 0.0002 * Math.cos(t / 700) + (t > 3000 && t < 3600 ? 0.00002 : 0),
            t => baseElev + 55.0 + 15.0 * Math.sin(t / 900)
        );

        const s2 = makeGpx('重機_フォワーダ01',
            t => baseLat + 0.0010 * ((Math.sin(t / 600) + 1) / 2),
            t => baseLon + 0.0008 * ((Math.sin(t / 600) + 1) / 2),
            t => baseElev + 60.0 * ((Math.sin(t / 600) + 1) / 2)
        );

        const s3 = makeGpx('作業者_鈴木(荷掛)',
            t => baseLat + 0.0003 * Math.cos(t / 1000),
            t => baseLon + 0.0002 * Math.sin(t / 900),
            t => baseElev + 15.0 + 8.0 * Math.cos(t / 1100)
        );

        const s4 = makeGpx('重機_プロセッサ02',
            t => baseLat + 0.0002 * Math.sin(t / 1500),
            t => baseLon + 0.0003 * Math.cos(t / 1800),
            t => baseElev + 10.0 + 3.0 * Math.sin(t / 1200)
        );

        state.gpxList = [s1, s2, s3, s4];
        state.gpxList.forEach((g, idx) => {
            g.color = state.colorPalette[idx % state.colorPalette.length];
        });

        // Default: select 1st and 2nd for dual comparison
        selectGpxPair(0, 1);

        // Load Sample Photos, 360, and Video
        createSampleMediaPins(baseLat, baseLon, baseElev, startDt);

        // Load Sample Forestry Compartment Polygons & Drone Ortho Layer
        GISLayerLoader.createSampleForestryLayers(baseLat, baseLon);
        updateGisLayerUI();

        // Load Sample Near-Miss Incident Reports
        NearMissManager.loadSampleReports(baseLat, baseLon);
    }

    function createSampleMediaPins(baseLat, baseLon, baseElev, startDt) {
        state.mediaLayerGroup.clearLayers();
        MediaLoader.mediaList = [];

        const sampleMedia = [
            {
                name: '伐倒作業エリア現況写真 (通常写真)',
                type: 'image',
                is360: false,
                lat: baseLat + 0.0012,
                lon: baseLon + 0.0009,
                ele: baseElev + 62.0,
                timestamp: new Date(startDt.getTime() + 1800 * 1000),
                camera: 'RICOH G900 / GPS内蔵',
                url: 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?w=600&auto=format&fit=crop&q=80'
            },
            {
                name: '土場・プロセッサ作業点 (全天球360°写真)',
                type: 'image',
                is360: true,
                lat: baseLat + 0.0002,
                lon: baseLon + 0.0003,
                ele: baseElev + 12.0,
                timestamp: new Date(startDt.getTime() + 3600 * 1000),
                camera: 'RICOH THETA X (360° Spherical)',
                url: 'https://pannellum.org/images/alma.jpg'
            },
            {
                name: '林道・集材作業動画 (現地動画)',
                type: 'video',
                is360: false,
                lat: baseLat + 0.0006,
                lon: baseLon + 0.0005,
                ele: baseElev + 35.0,
                timestamp: new Date(startDt.getTime() + 5400 * 1000),
                camera: 'GoPro HERO12 Black',
                url: 'https://www.w3schools.com/html/mov_bbb.mp4'
            }
        ];

        sampleMedia.forEach(m => {
            MediaLoader.addMediaToMap(m);
        });

        updateMediaUI();
    }
});
