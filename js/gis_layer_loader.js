/**
 * GIS Layer Loader Module: KML, GeoJSON Polygons, and GeoTIFF (Drone/Aerial Laser Ortho)
 * Includes file-size downsampling (>= 500MB), visibility toggles, and real-time opacity controls
 */
const GISLayerLoader = {
    map: null,
    polygonLayerGroup: null,
    geotiffLayerGroup: null,
    polygonLayers: [],
    geotiffLayers: [],
    layerList: [],

    polygonOpacity: 0.0, // Initial 0% (塗りつぶしなし)
    geotiffOpacity: 0.7, // Initial 70%
    isPolygonVisible: true,
    isGeotiffVisible: true,

    init: function(map, polyGroup, geoGroup) {
        this.map = map;
        this.polygonLayerGroup = polyGroup;
        this.geotiffLayerGroup = geoGroup;
    },

    /**
     * Process incoming KML, GeoJSON, GeoTIFF, or StanForD 2010 HPR files
     */
    processFile: function(file, callback = null) {
        const name = file.name.toLowerCase();

        if (name.endsWith('.hpr')) {
            this.loadHPR(file, callback);
        } else if (name.endsWith('.geojson') || name.endsWith('.json')) {
            this.loadGeoJSON(file, callback);
        } else if (name.endsWith('.kml')) {
            this.loadKML(file, callback);
        } else if (name.endsWith('.tif') || name.endsWith('.tiff')) {
            this.loadGeoTIFF(file, callback);
        }
    },

    /**
     * Load StanForD 2010 HPR file, convert to GeoJSON and render on map
     */
    loadHPR: function(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                if (typeof HPRParser === 'undefined') {
                    throw new Error('HPRパーサーライブラリが読み込まれていません');
                }
                const geojson = HPRParser.parse(e.target.result, file.name);
                if (!geojson.features || geojson.features.length === 0) {
                    alert(`HPRファイル (${file.name}) 内に測位座標を持つ伐倒単木データが見つかりませんでした。`);
                    return;
                }
                this.addHprLayer(geojson, file.name);
                if (callback) callback(file.name, 'hpr');
            } catch (err) {
                alert(`HPRファイルの解析に失敗しました (${file.name}): ${err.message}`);
            }
        };
        reader.readAsText(file);
    },

    /**
     * Add HPR Harvested Tree GeoJSON Layer to Leaflet Map
     */
    addHprLayer: function(geojson, layerName = 'HPR伐倒単木') {
        const speciesColors = {
            'スギ': '#059669',
            'SUGI': '#059669',
            'ヒノキ': '#d97706',
            'HINOKI': '#d97706',
            'アカマツ': '#16a34a',
            'TALL': '#16a34a',
            'トウヒ': '#0284c7',
            'GRAN': '#0284c7',
            'シラカバ': '#ea580c',
            'BJÖRK': '#ea580c',
            'BJORK': '#ea580c',
            'コントルタ': '#8b5cf6',
            'CONTORTA': '#8b5cf6'
        };

        const getSpeciesColor = (speciesStr) => {
            if (!speciesStr) return '#10b981';
            for (const [key, color] of Object.entries(speciesColors)) {
                if (speciesStr.includes(key)) return color;
            }
            return '#059669';
        };

        const layer = L.geoJSON(geojson, {
            pointToLayer: (feature, latlng) => {
                const p = feature.properties || {};
                const color = getSpeciesColor(p.species);

                return L.circleMarker(latlng, {
                    radius: 3.5,
                    color: '#ffffff',
                    weight: 1.0,
                    fillColor: color,
                    fillOpacity: 0.92
                });
            },
            onEachFeature: (feature, l) => {
                const p = feature.properties || {};
                const color = getSpeciesColor(p.species);

                let logRowsHtml = '';
                if (p.logs && p.logs.length > 0) {
                    logRowsHtml = `
                        <div style="margin-top:6px; font-weight:bold; color:#334155; font-size:11px;">🪵 玉切り丸太内訳 (${p.logs.length}本):</div>
                        <table style="width:100%; border-collapse:collapse; margin-top:3px; font-size:10px;">
                            <thead>
                                <tr style="background:#f1f5f9; color:#475569; border-bottom:1px solid #cbd5e1;">
                                    <th style="padding:2px 4px; text-align:left;">#</th>
                                    <th style="padding:2px 4px; text-align:left;">規格</th>
                                    <th style="padding:2px 4px; text-align:right;">長さ</th>
                                    <th style="padding:2px 4px; text-align:right;">末口径</th>
                                    <th style="padding:2px 4px; text-align:right;">材積</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${p.logs.map(log => `
                                    <tr style="border-bottom:1px solid #f1f5f9;">
                                        <td style="padding:2px 4px;">${log.logKey}</td>
                                        <td style="padding:2px 4px; color:#475569;">${log.productName}</td>
                                        <td style="padding:2px 4px; text-align:right;">${log.lengthM !== null ? log.lengthM + 'm' : '-'}</td>
                                        <td style="padding:2px 4px; text-align:right;">${log.diameterCm !== null ? log.diameterCm + 'cm' : '-'}</td>
                                        <td style="padding:2px 4px; text-align:right; font-weight:bold; color:#0f172a;">${log.volumeSobM3}m³</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                }

                const popupHtml = `
                    <div style="font-size:12px; max-width:280px; line-height:1.4;">
                        <div style="font-size:13px; font-weight:bold; color:${color}; border-bottom:2px solid ${color}; padding-bottom:4px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                            <span>🌲 伐倒単木 #${p.stemNumber || p.stemKey}</span>
                            <span style="font-size:10px; background:#e0f2fe; color:#0369a1; padding:1px 5px; border-radius:3px;">${p.species}</span>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:6px; font-size:11px; background:#f8fafc; padding:6px; border-radius:4px; border:1px solid #e2e8f0;">
                            <div><b>胸高直径(DBH):</b> <span style="color:#0f172a; font-weight:bold;">${p.dbhCm !== null ? p.dbhCm + ' cm' : (p.dbhMm ? p.dbhMm + ' mm' : '-')}</span></div>
                            <div><b>単木総材積:</b> <span style="color:#dc2626; font-weight:bold;">${p.totalVolumeSobM3} m³</span></div>
                            <div><b>玉切り本数:</b> ${p.logCount || 0} 本</div>
                            <div><b>標高:</b> ${p.altitudeM !== null ? p.altitudeM + ' m' : '-'}</div>
                        </div>
                        ${logRowsHtml}
                        <div style="margin-top:6px; font-size:10px; color:#64748b; border-top:1px dashed #cbd5e1; padding-top:4px;">
                            <div>🚜 <b>機械:</b> ${p.machine || '-'} (${p.loggingForm || '間伐'})</div>
                            <div>📅 <b>日時:</b> ${p.processingDate || '-'}</div>
                            <div>📍 <b>座標:</b> ${l.getLatLng().lat.toFixed(5)}, ${l.getLatLng().lng.toFixed(5)}</div>
                        </div>
                    </div>
                `;

                l.bindPopup(popupHtml);
                l.bindTooltip(`🌲 単木 #${p.stemNumber} ${p.species}<br>幹径:${p.dbhCm || '-'}cm / 材積:${p.totalVolumeSobM3}m³`, { sticky: true });
            }
        });

        layer.addTo(this.polygonLayerGroup);
        this.polygonLayers.push(layer);
        const displayName = `${layerName} (${geojson.features.length}本 / ${geojson.metadata.totalVolumeSobM3}m³)`;
        this.layerList.push({
            name: displayName,
            type: 'hpr',
            layer: layer,
            opacity: 1.0,
            visible: true,
            geojson: geojson
        });

        if (layer.getBounds().isValid()) {
            this.map.fitBounds(layer.getBounds(), { padding: [30, 30] });
        }
    },

    /**
     * Export converted HPR GeoJSON to file
     */
    exportHprGeoJson: function(index) {
        if (index < 0 || index >= this.layerList.length) return;
        const item = this.layerList[index];
        if (!item.geojson) return;

        const blob = new Blob([JSON.stringify(item.geojson, null, 2)], { type: 'application/geo+json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const cleanName = (item.name || 'harvested_trees').replace(/[\(\)\/\s:]+/g, '_');
        a.download = `${cleanName}.geojson`;
        a.click();
        URL.revokeObjectURL(url);
    },

    /**
     * Load GeoJSON Polygon Layer
     */
    loadGeoJSON: function(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const geojson = JSON.parse(e.target.result);
                this.addPolygonLayer(geojson, file.name);
                if (callback) callback(file.name, 'polygon');
            } catch (err) {
                alert(`GeoJSONの解析に失敗しました (${file.name}): ${err.message}`);
            }
        };
        reader.readAsText(file);
    },

    /**
     * Load KML Polygon Layer (converts to GeoJSON)
     */
    loadKML: function(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parser = new DOMParser();
                const kmlDom = parser.parseFromString(e.target.result, 'text/xml');
                let geojson = null;

                if (window.toGeoJSON && window.toGeoJSON.kml) {
                    geojson = window.toGeoJSON.kml(kmlDom);
                } else {
                    throw new Error('KMLパーサーライブラリがロードされていません');
                }

                this.addPolygonLayer(geojson, file.name);
                if (callback) callback(file.name, 'kml');
            } catch (err) {
                alert(`KMLの解析に失敗しました (${file.name}): ${err.message}`);
            }
        };
        reader.readAsText(file);
    },

    /**
     * Add Polygon GeoJSON Layer to Leaflet with no fill and red border (half weight)
     */
    addPolygonLayer: function(geojson, layerName = '林班ポリゴン') {
        const layerColor = '#dc2626'; // Default red border as requested

        const layer = L.geoJSON(geojson, {
            style: {
                color: layerColor,
                weight: 1.25, // Half of 2.5
                fill: false,
                fillColor: layerColor,
                fillOpacity: this.polygonOpacity // 0.0 default
            },
            onEachFeature: (feature, l) => {
                let popupHtml = `<div style="font-size:12px; max-width:240px;"><b style="color:#dc2626;">📐 ${layerName}</b><br>`;
                if (feature.properties) {
                    for (const [key, val] of Object.entries(feature.properties)) {
                        if (typeof val !== 'object') {
                            popupHtml += `<b>${key}:</b> ${val}<br>`;
                        }
                    }
                }
                popupHtml += `</div>`;
                l.bindPopup(popupHtml);
                l.bindTooltip(feature.properties?.name || feature.properties?.林班 || layerName, { sticky: true });
            }
        });

        layer.addTo(this.polygonLayerGroup);
        this.polygonLayers.push(layer);
        this.layerList.push({ name: layerName, type: 'polygon', layer: layer, opacity: 0.0, visible: true, geojson: geojson });

        if (layer.getBounds().isValid()) {
            this.map.fitBounds(layer.getBounds(), { padding: [20, 20] });
        }
    },

    /**
     * Load GeoTIFF (Drone Ortho / Aerial Laser Ortho)
     */
    loadGeoTIFF: function(file, callback) {
        const isLarge = file.size >= (500 * 1024 * 1024); // >= 500MB
        const noticeEl = document.getElementById('geotiffNotice');
        const noticeText = document.getElementById('geotiffNoticeText');

        if (noticeEl && noticeText) {
            noticeEl.style.display = 'block';
            if (isLarge) {
                noticeText.textContent = `⚠️ 大容量GeoTIFF (${(file.size / (1024*1024)).toFixed(0)}MB) を検知。解像度を最適化して描画中...`;
                noticeEl.className = 'geotiff-notice text-warning';
            } else {
                noticeText.textContent = `🗺️ GeoTIFF (${(file.size / (1024*1024)).toFixed(1)}MB) を読み込み中...`;
                noticeEl.className = 'geotiff-notice text-info';
            }
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const arrayBuffer = e.target.result;

            if (window.parseGeoraster && window.GeoRasterLayer) {
                parseGeoraster(arrayBuffer).then(georaster => {
                    const renderResolution = isLarge ? 64 : 256;

                    const layer = new GeoRasterLayer({
                        georaster: georaster,
                        opacity: this.geotiffOpacity,
                        resolution: renderResolution,
                        debugLevel: 0
                    });

                    layer.addTo(this.geotiffLayerGroup);
                    this.geotiffLayers.push(layer);
                    this.layerList.push({ name: file.name, type: 'geotiff', layer: layer, isLarge: isLarge, visible: true });

                    if (layer.getBounds().isValid()) {
                        this.map.fitBounds(layer.getBounds(), { padding: [20, 20] });
                    }

                    if (noticeText) {
                        noticeText.textContent = `✅ ${file.name} 描画完了 ${isLarge ? '(解像度最適化済)' : ''}`;
                        noticeEl.className = 'geotiff-notice text-success';
                    }

                    if (callback) callback(file.name, 'geotiff');
                }).catch(err => {
                    alert(`GeoTIFFの解析に失敗しました: ${err.message}`);
                });
            } else {
                alert('GeoTIFFレンダラーライブラリが読み込まれていません');
            }
        };
        reader.readAsArrayBuffer(file);
    },

    /**
     * Toggle Polygon Group Visibility (表示 / 非表示)
     */
    togglePolygonVisibility: function() {
        this.isPolygonVisible = !this.isPolygonVisible;
        if (this.isPolygonVisible) {
            if (!this.map.hasLayer(this.polygonLayerGroup)) {
                this.map.addLayer(this.polygonLayerGroup);
            }
        } else {
            if (this.map.hasLayer(this.polygonLayerGroup)) {
                this.map.removeLayer(this.polygonLayerGroup);
            }
        }
        return this.isPolygonVisible;
    },

    /**
     * Toggle GeoTIFF Group Visibility (表示 / 非表示)
     */
    toggleGeotiffVisibility: function() {
        this.isGeotiffVisible = !this.isGeotiffVisible;
        if (this.isGeotiffVisible) {
            if (!this.map.hasLayer(this.geotiffLayerGroup)) {
                this.map.addLayer(this.geotiffLayerGroup);
            }
        } else {
            if (this.map.hasLayer(this.geotiffLayerGroup)) {
                this.map.removeLayer(this.geotiffLayerGroup);
            }
        }
        return this.isGeotiffVisible;
    },

    /**
     * Toggle Individual Layer Visibility by Index in layerList
     */
    toggleIndividualLayer: function(index) {
        if (index < 0 || index >= this.layerList.length) return;
        const item = this.layerList[index];
        item.visible = !item.visible;

        const targetGroup = item.type === 'geotiff' ? this.geotiffLayerGroup : this.polygonLayerGroup;

        if (item.visible) {
            if (!targetGroup.hasLayer(item.layer)) {
                targetGroup.addLayer(item.layer);
            }
        } else {
            if (targetGroup.hasLayer(item.layer)) {
                targetGroup.removeLayer(item.layer);
            }
        }
        return item.visible;
    },

    /**
     * Set Individual Layer Opacity (0.0 to 1.0)
     */
    setIndividualLayerOpacity: function(index, opacity) {
        if (index < 0 || index >= this.layerList.length) return;
        const item = this.layerList[index];
        item.opacity = opacity;

        if (item.type === 'geotiff') {
            if (item.layer && item.layer.setOpacity) {
                item.layer.setOpacity(opacity);
            }
        } else {
            if (item.layer && item.layer.setStyle) {
                item.layer.setStyle({ fillOpacity: opacity });
            }
        }
    },

    /**
     * Set Polygon Fill Opacity (0.0 to 1.0)
     */
    setPolygonOpacity: function(opacity) {
        this.polygonOpacity = opacity;
        this.polygonLayers.forEach(layer => {
            layer.setStyle({ fillOpacity: opacity });
        });
    },

    /**
     * Set GeoTIFF Opacity (0.0 to 1.0)
     */
    setGeotiffOpacity: function(opacity) {
        this.geotiffOpacity = opacity;
        this.geotiffLayers.forEach(layer => {
            if (layer.setOpacity) {
                layer.setOpacity(opacity);
            }
        });
    },

    /**
     * Create Sample Forestry Compartment Polygons & Simulated Drone Ortho
     */
    createSampleForestryLayers: function(baseLat = 36.593393, baseLon = 136.774920) {
        this.polygonLayerGroup.clearLayers();
        this.geotiffLayerGroup.clearLayers();
        this.polygonLayers = [];
        this.geotiffLayers = [];
        this.layerList = [];

        // Sample Forestry Compartments (林班 & 施業区)
        const sampleGeoJson = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    properties: {
                        name: '第102林班 (スギ・ヒノキ人工林)',
                        林班番号: '102林班',
                        面積: '4.8 ha',
                        主要樹種: 'スギ 45年生',
                        施業種別: '主伐・搬出間伐'
                    },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [[
                            [baseLon - 0.003, baseLat - 0.002],
                            [baseLon + 0.002, baseLat - 0.002],
                            [baseLon + 0.003, baseLat + 0.002],
                            [baseLon - 0.001, baseLat + 0.003],
                            [baseLon - 0.003, baseLat - 0.002]
                        ]]
                    }
                },
                {
                    type: 'Feature',
                    properties: {
                        name: '第103林班 伐採予定区 (保安林隣接)',
                        林班番号: '103林班イ小班',
                        面積: '2.1 ha',
                        主要樹種: 'ヒノキ 50年生',
                        施業種別: '間伐 (列状間伐)'
                    },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [[
                            [baseLon + 0.0005, baseLat + 0.0005],
                            [baseLon + 0.0025, baseLat + 0.001],
                            [baseLon + 0.0028, baseLat + 0.003],
                            [baseLon + 0.0008, baseLat + 0.0025],
                            [baseLon + 0.0005, baseLat + 0.0005]
                        ]]
                    }
                }
            ]
        };

        this.addPolygonLayer(sampleGeoJson, 'サンプル林班ポリゴン (102林班・103林班)');

        // 10 Sample Sugi Trees inside 102林班 polygon (StanForD 2010 HPR Data)
        const sampleHprTrees = [
            { stem: 1, dbh: 34.5, sob: 0.68, sub: 0.59, alt: 355.0, dLon: -0.0005, dLat: 0.0002, time: '09:12', logs: [{ k: 1, p: '柱材 (4.0m)', l: 4.0, d: 24, v: 0.42 }, { k: 2, p: '中目丸太 (3.0m)', l: 3.0, d: 18, v: 0.26 }] },
            { stem: 2, dbh: 28.2, sob: 0.46, sub: 0.40, alt: 358.0, dLon: 0.0002, dLat: 0.0004, time: '09:23', logs: [{ k: 1, p: '柱材 (4.0m)', l: 4.0, d: 20, v: 0.30 }, { k: 2, p: '小目丸太 (2.0m)', l: 2.0, d: 16, v: 0.16 }] },
            { stem: 3, dbh: 38.0, sob: 0.92, sub: 0.80, alt: 360.0, dLon: 0.0006, dLat: 0.0005, time: '09:36', logs: [{ k: 1, p: '大径柱材 (4.0m)', l: 4.0, d: 28, v: 0.54 }, { k: 2, p: '中目丸太 (3.0m)', l: 3.0, d: 22, v: 0.28 }, { k: 3, p: '原料材 (2.0m)', l: 2.0, d: 14, v: 0.10 }] },
            { stem: 4, dbh: 26.4, sob: 0.38, sub: 0.33, alt: 362.0, dLon: -0.0008, dLat: 0.0006, time: '09:48', logs: [{ k: 1, p: '間伐小径材 (3.0m)', l: 3.0, d: 18, v: 0.24 }, { k: 2, p: 'バイオマス原料 (2.0m)', l: 2.0, d: 14, v: 0.14 }] },
            { stem: 5, dbh: 32.8, sob: 0.62, sub: 0.54, alt: 365.0, dLon: 0.0001, dLat: 0.0008, time: '10:02', logs: [{ k: 1, p: '柱材 (4.0m)', l: 4.0, d: 22, v: 0.38 }, { k: 2, p: '中目丸太 (3.0m)', l: 3.0, d: 18, v: 0.24 }] },
            { stem: 6, dbh: 42.1, sob: 1.15, sub: 1.00, alt: 368.0, dLon: 0.0009, dLat: 0.0010, time: '10:15', logs: [{ k: 1, p: '大径柱材 (4.0m)', l: 4.0, d: 32, v: 0.68 }, { k: 2, p: '大径丸太 (3.0m)', l: 3.0, d: 26, v: 0.35 }, { k: 3, p: 'パルプ材 (2.0m)', l: 2.0, d: 16, v: 0.12 }] },
            { stem: 7, dbh: 30.6, sob: 0.55, sub: 0.48, alt: 370.0, dLon: -0.0004, dLat: 0.0012, time: '10:28', logs: [{ k: 1, p: '柱材 (4.0m)', l: 4.0, d: 22, v: 0.36 }, { k: 2, p: '小目丸太 (2.5m)', l: 2.5, d: 16, v: 0.19 }] },
            { stem: 8, dbh: 25.0, sob: 0.34, sub: 0.30, alt: 373.0, dLon: 0.0004, dLat: 0.0014, time: '10:39', logs: [{ k: 1, p: '小径柱材 (3.0m)', l: 3.0, d: 18, v: 0.22 }, { k: 2, p: '原料材 (2.0m)', l: 2.0, d: 12, v: 0.12 }] },
            { stem: 9, dbh: 36.2, sob: 0.82, sub: 0.71, alt: 375.0, dLon: 0.0008, dLat: 0.0016, time: '10:51', logs: [{ k: 1, p: '柱材 (4.0m)', l: 4.0, d: 26, v: 0.50 }, { k: 2, p: '中目丸太 (3.0m)', l: 3.0, d: 20, v: 0.32 }] },
            { stem: 10, dbh: 29.8, sob: 0.51, sub: 0.44, alt: 378.0, dLon: -0.0001, dLat: 0.0018, time: '11:05', logs: [{ k: 1, p: '柱材 (4.0m)', l: 4.0, d: 20, v: 0.32 }, { k: 2, p: '小目丸太 (2.5m)', l: 2.5, d: 16, v: 0.19 }] }
        ];

        const sampleHprFeatures = sampleHprTrees.map(t => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [baseLon + t.dLon, baseLat + t.dLat, t.alt]
            },
            properties: {
                stemKey: t.stem,
                stemNumber: t.stem,
                species: 'スギ (SUGI)',
                rawSpecies: 'SUGI',
                dbhCm: t.dbh,
                dbhMm: Math.round(t.dbh * 10),
                totalVolumeSobM3: t.sob,
                totalVolumeSubM3: t.sub,
                logCount: t.logs.length,
                altitudeM: t.alt,
                processingDate: `2026-05-18 ${t.time}`,
                machine: 'KOMATSU 931XC / 370.2',
                loggingForm: '間伐 (Thinning)',
                siteName: '金沢市大樋町 森林施業団地 (第102林班)',
                logs: t.logs.map(log => ({
                    logKey: log.k,
                    productKey: String(log.k),
                    productName: log.p,
                    stemType: '用材(Timmer)',
                    lengthM: log.l,
                    diameterCm: log.d,
                    volumeSobM3: log.v,
                    volumeSubM3: parseFloat((log.v * 0.88).toFixed(3))
                }))
            }
        }));

        const sampleHprGeoJson = {
            type: 'FeatureCollection',
            name: 'サンプル_伐倒単木(スギ10本)',
            metadata: {
                fileName: 'サンプル_伐倒単木(スギ10本).hpr',
                totalTrees: 10,
                totalVolumeSobM3: 6.43,
                totalVolumeSubM3: 5.59,
                machine: 'KOMATSU 931XC / 370.2',
                siteName: '金沢市大樋町 森林施業団地 (第102林班)',
                speciesSummary: { 'スギ (SUGI)': 10 }
            },
            features: sampleHprFeatures
        };

        this.addHprLayer(sampleHprGeoJson, 'サンプル_伐倒単木(スギ10本).hpr');
    },

    clearAll: function() {
        this.polygonLayerGroup.clearLayers();
        this.geotiffLayerGroup.clearLayers();
        this.polygonLayers = [];
        this.geotiffLayers = [];
        this.layerList = [];
    }
};
