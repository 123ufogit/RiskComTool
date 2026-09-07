/**
 * GIS Layer Loader Module: KML, GeoJSON Polygons, and GeoTIFF (Drone/Aerial Laser Ortho)
 * Includes file-size downsampling (>= 500MB), visibility toggles, and real-time opacity controls
 */
const GISLayerLoader = {
    map: null,
    polygonLayerGroup: null,
    geotiffLayerGroup: null,
    treePointLayerGroup: null,
    polygonLayers: [],
    geotiffLayers: [],
    treePointLayers: [],
    layerList: [],

    polygonOpacity: 0.0, // Initial 0% (塗りつぶしなし)
    geotiffOpacity: 0.7, // Initial 70%
    isPolygonVisible: true,
    isGeotiffVisible: true,
    isTreePointVisible: true,

    init: function(map, polyGroup, geoGroup, treeGroup = null) {
        this.map = map;
        this.polygonLayerGroup = polyGroup;
        this.geotiffLayerGroup = geoGroup;
        this.treePointLayerGroup = treeGroup;
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

        const targetGroup = this.treePointLayerGroup || this.polygonLayerGroup;
        layer.addTo(targetGroup);
        this.treePointLayers.push(layer);
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

            const parseFn = window.parseGeoraster || (typeof parseGeoraster !== 'undefined' ? parseGeoraster : null);
            const LayerClass = window.GeoRasterLayer || (window.L && window.L.GeoRasterLayer) || (typeof GeoRasterLayer !== 'undefined' ? GeoRasterLayer : null);

            if (parseFn && LayerClass) {
                parseFn(arrayBuffer).then(georaster => {
                    const renderResolution = isLarge ? 64 : 256;

                    const layer = new LayerClass({
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

        const targetGroup = item.type === 'geotiff' 
            ? this.geotiffLayerGroup 
            : (item.type === 'hpr' && this.treePointLayerGroup ? this.treePointLayerGroup : this.polygonLayerGroup);

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
     * Remove Individual Layer by Index in layerList
     */
    removeLayer: function(index) {
        if (index < 0 || index >= this.layerList.length) return;
        const item = this.layerList[index];
        if (item.layer) {
            const targetGroup = item.type === 'geotiff' 
                ? this.geotiffLayerGroup 
                : (item.type === 'hpr' && this.treePointLayerGroup ? this.treePointLayerGroup : this.polygonLayerGroup);
            if (targetGroup && targetGroup.hasLayer(item.layer)) {
                targetGroup.removeLayer(item.layer);
            }
        }
        if (item.type === 'polygon') {
            this.polygonLayers = this.polygonLayers.filter(l => l !== item.layer);
        } else if (item.type === 'geotiff') {
            this.geotiffLayers = this.geotiffLayers.filter(l => l !== item.layer);
        } else if (item.type === 'hpr') {
            this.treePointLayers = this.treePointLayers.filter(l => l !== item.layer);
        }
        this.layerList.splice(index, 1);
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
        if (this.treePointLayerGroup) this.treePointLayerGroup.clearLayers();
        this.polygonLayers = [];
        this.geotiffLayers = [];
        this.treePointLayers = [];
        this.layerList = [];

        // Sample Forestry Compartments (林班 & 施業区 - ユーザー提供ポリゴン)
        const sampleGeoJson = {
            type: 'FeatureCollection',
            name: 'サンプル林班ポリゴン',
            features: [
                {
                    type: 'Feature',
                    properties: {
                        name: '第102林班 (スギ・ヒノキ施業区域)',
                        林班番号: '102林班',
                        施業種別: '間伐・主伐施業区',
                        主要樹種: 'スギ・ヒノキ人工林',
                        面積: '約 2.8 ha'
                    },
                    geometry: {
                        type: 'Polygon',
                        coordinates: [
                            [
                                [136.775027, 36.592277],
                                [136.775381, 36.592768],
                                [136.775756, 36.593139],
                                [136.775885, 36.593475],
                                [136.775647, 36.593658],
                                [136.775449, 36.593555],
                                [136.775363, 36.593426],
                                [136.775293, 36.593546],
                                [136.775444, 36.593632],
                                [136.775685, 36.593749],
                                [136.775782, 36.593964],
                                [136.775942, 36.594149],
                                [136.775701, 36.594434],
                                [136.77547, 36.594554],
                                [136.775175, 36.594503],
                                [136.77509, 36.59436],
                                [136.775025, 36.594037],
                                [136.775004, 36.59393],
                                [136.774837, 36.593844],
                                [136.774623, 36.593749],
                                [136.774505, 36.593714],
                                [136.774226, 36.593753],
                                [136.774001, 36.593744],
                                [136.773925, 36.593641],
                                [136.77385, 36.593469],
                                [136.77392, 36.593318],
                                [136.773974, 36.593193],
                                [136.774124, 36.593111],
                                [136.774237, 36.592999],
                                [136.774247, 36.592836],
                                [136.77436, 36.592633],
                                [136.774508, 36.592508],
                                [136.774578, 36.592427],
                                [136.774744, 36.592323],
                                [136.774921, 36.592271],
                                [136.775027, 36.592277]
                            ]
                        ]
                    }
                }
            ]
        };

        this.addPolygonLayer(sampleGeoJson, 'サンプル林班ポリゴン (102林班)');

        // 10 Sample Sugi Trees randomly placed inside the 102林班 polygon (StanForD 2010 HPR Data)
        const sampleHprTrees = [
            { stem: 1, dbh: 34.5, sob: 0.68, sub: 0.59, alt: 346.2, lon: 136.774562, lat: 36.592626, time: '09:12', logs: [{ k: 1, p: '柱材 (4.0m)', l: 4.0, d: 24, v: 0.42 }, { k: 2, p: '中目丸太 (3.0m)', l: 3.0, d: 18, v: 0.26 }] },
            { stem: 2, dbh: 28.2, sob: 0.46, sub: 0.40, alt: 348.4, lon: 136.774624, lat: 36.592749, time: '09:23', logs: [{ k: 1, p: '柱材 (4.0m)', l: 4.0, d: 20, v: 0.30 }, { k: 2, p: '小目丸太 (2.0m)', l: 2.0, d: 16, v: 0.16 }] },
            { stem: 3, dbh: 38.0, sob: 0.92, sub: 0.80, alt: 348.9, lon: 136.774425, lat: 36.592781, time: '09:36', logs: [{ k: 1, p: '大径柱材 (4.0m)', l: 4.0, d: 28, v: 0.54 }, { k: 2, p: '中目丸太 (3.0m)', l: 3.0, d: 22, v: 0.28 }, { k: 3, p: '原料材 (2.0m)', l: 2.0, d: 14, v: 0.10 }] },
            { stem: 4, dbh: 26.4, sob: 0.38, sub: 0.33, alt: 354.6, lon: 136.775180, lat: 36.593104, time: '09:48', logs: [{ k: 1, p: '間伐小径材 (3.0m)', l: 3.0, d: 18, v: 0.24 }, { k: 2, p: 'バイオマス原料 (2.0m)', l: 2.0, d: 14, v: 0.14 }] },
            { stem: 5, dbh: 32.8, sob: 0.62, sub: 0.54, alt: 360.2, lon: 136.774307, lat: 36.593425, time: '10:02', logs: [{ k: 1, p: '柱材 (4.0m)', l: 4.0, d: 22, v: 0.38 }, { k: 2, p: '中目丸太 (3.0m)', l: 3.0, d: 18, v: 0.24 }] },
            { stem: 6, dbh: 42.1, sob: 1.15, sub: 1.00, alt: 362.1, lon: 136.774642, lat: 36.593531, time: '10:15', logs: [{ k: 1, p: '大径柱材 (4.0m)', l: 4.0, d: 32, v: 0.68 }, { k: 2, p: '大径丸太 (3.0m)', l: 3.0, d: 26, v: 0.35 }, { k: 3, p: 'パルプ材 (2.0m)', l: 2.0, d: 16, v: 0.12 }] },
            { stem: 7, dbh: 30.6, sob: 0.55, sub: 0.48, alt: 363.6, lon: 136.774311, lat: 36.593616, time: '10:28', logs: [{ k: 1, p: '柱材 (4.0m)', l: 4.0, d: 22, v: 0.36 }, { k: 2, p: '小目丸太 (2.5m)', l: 2.5, d: 16, v: 0.19 }] },
            { stem: 8, dbh: 25.0, sob: 0.34, sub: 0.30, alt: 367.1, lon: 136.775391, lat: 36.593816, time: '10:39', logs: [{ k: 1, p: '小径柱材 (3.0m)', l: 3.0, d: 18, v: 0.22 }, { k: 2, p: '原料材 (2.0m)', l: 2.0, d: 12, v: 0.12 }] },
            { stem: 9, dbh: 36.2, sob: 0.82, sub: 0.71, alt: 367.9, lon: 136.775536, lat: 36.593865, time: '10:51', logs: [{ k: 1, p: '柱材 (4.0m)', l: 4.0, d: 26, v: 0.50 }, { k: 2, p: '中目丸太 (3.0m)', l: 3.0, d: 20, v: 0.32 }] },
            { stem: 10, dbh: 29.8, sob: 0.51, sub: 0.44, alt: 369.2, lon: 136.775539, lat: 36.593937, time: '11:05', logs: [{ k: 1, p: '柱材 (4.0m)', l: 4.0, d: 20, v: 0.32 }, { k: 2, p: '小目丸太 (2.5m)', l: 2.5, d: 16, v: 0.19 }] }
        ];

        const sampleHprFeatures = sampleHprTrees.map(t => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [t.lon !== undefined ? t.lon : (baseLon + t.dLon), t.lat !== undefined ? t.lat : (baseLat + t.dLat), t.alt]
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
        if (this.treePointLayerGroup) this.treePointLayerGroup.clearLayers();
        this.polygonLayers = [];
        this.geotiffLayers = [];
        this.treePointLayers = [];
        this.layerList = [];
    }
};
