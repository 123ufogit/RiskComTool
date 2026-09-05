/**
 * Near-Miss (ヒヤリハット) Incident Reporting & GeoJSON Manager
 */
const NearMissManager = {
    map: null,
    layerGroup: null,
    reports: [],
    isPinMode: false,
    tempLatLng: null,
    tempMarker: null,
    listContainerEl: null,
    countEl: null,
    exportBtnEl: null,
    bannerEl: null,
    modalEl: null,

    /**
     * Initialize Near-Miss Manager
     */
    init: function(map, elements = {}) {
        this.map = map;
        this.layerGroup = L.featureGroup().addTo(this.map);

        this.listContainerEl = document.getElementById(elements.listContainerId || 'nearMissFileList');
        this.countEl = document.getElementById(elements.countId || 'nearMissCount');
        this.exportBtnEl = document.getElementById(elements.exportBtnId || 'exportNearMissGeoJsonBtn');
        this.bannerEl = document.getElementById('pinModeBanner');
        this.modalEl = document.getElementById('nearMissModal');

        this.bindEvents();
        this.renderList();
    },

    /**
     * Bind UI & Map Events
     */
    bindEvents: function() {
        // Floating map button click
        const floatBtn = document.getElementById('nearMissBtn');
        if (floatBtn) {
            floatBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.isPinMode) {
                    this.cancelPinMode();
                } else {
                    this.startPinMode();
                }
            });
        }

        // Cancel banner button click
        const cancelBannerBtn = document.getElementById('cancelPinModeBtn');
        if (cancelBannerBtn) {
            cancelBannerBtn.addEventListener('click', () => {
                this.cancelPinMode();
            });
        }

        // Escape key to cancel pin mode or modal
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.modalEl && this.modalEl.style.display !== 'none') {
                    this.closeModal();
                } else if (this.isPinMode) {
                    this.cancelPinMode();
                }
            }
        });

        // Map click event for pin placement
        this.map.on('click', (e) => {
            if (this.isPinMode) {
                this.onMapClick(e.latlng);
            }
        });

        // Form submit in Modal
        const form = document.getElementById('nearMissForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleFormSubmit();
            });
        }

        // Modal close button
        const closeModalBtn = document.getElementById('closeNearMissModalBtn');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                this.closeModal();
            });
        }

        const cancelFormBtn = document.getElementById('cancelNearMissFormBtn');
        if (cancelFormBtn) {
            cancelFormBtn.addEventListener('click', () => {
                this.closeModal();
            });
        }

        // Export GeoJSON button
        if (this.exportBtnEl) {
            this.exportBtnEl.addEventListener('click', () => {
                this.exportGeoJson();
            });
        }
    },

    /**
     * Start Pin Placement Mode
     */
    startPinMode: function() {
        this.isPinMode = true;
        const mapEl = this.map.getContainer();
        mapEl.classList.add('pin-placement-mode');
        
        const floatBtn = document.getElementById('nearMissBtn');
        if (floatBtn) floatBtn.classList.add('active');

        if (this.bannerEl) this.bannerEl.style.display = 'flex';
    },

    /**
     * Cancel Pin Placement Mode
     */
    cancelPinMode: function() {
        this.isPinMode = false;
        const mapEl = this.map.getContainer();
        mapEl.classList.remove('pin-placement-mode');

        const floatBtn = document.getElementById('nearMissBtn');
        if (floatBtn) floatBtn.classList.remove('active');

        if (this.bannerEl) this.bannerEl.style.display = 'none';

        if (this.tempMarker) {
            this.map.removeLayer(this.tempMarker);
            this.tempMarker = null;
        }
        this.tempLatLng = null;
    },

    /**
     * Handle Map Click to place pin
     */
    onMapClick: function(latlng) {
        this.tempLatLng = latlng;
        
        // Remove existing temp marker
        if (this.tempMarker) {
            this.map.removeLayer(this.tempMarker);
        }

        // Place temporary marker
        this.tempMarker = L.marker(latlng, {
            icon: this.createWarningIcon('#ef4444', true)
        }).addTo(this.map);

        this.openModal(latlng);
    },

    /**
     * Open Report Form Modal
     */
    openModal: function(latlng) {
        if (!this.modalEl) return;

        // Reset form
        const form = document.getElementById('nearMissForm');
        if (form) form.reset();

        // Default datetime: now formatted as YYYY-MM-DDTHH:MM
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const defaultDatetime = `${yyyy}-${mm}-${dd}T${hh}:${min}`;

        const dtInput = document.getElementById('nmDatetime');
        if (dtInput) dtInput.value = defaultDatetime;

        // Display coordinate info
        const coordInfoEl = document.getElementById('nmCoordinatesText');
        if (coordInfoEl) {
            coordInfoEl.textContent = `📍 緯度: ${latlng.lat.toFixed(6)}, 経度: ${latlng.lng.toFixed(6)}`;
        }

        this.modalEl.style.display = 'flex';
    },

    /**
     * Close Report Form Modal
     */
    closeModal: function() {
        if (this.modalEl) this.modalEl.style.display = 'none';
        this.cancelPinMode();
    },

    /**
     * Handle Form Submission
     */
    handleFormSubmit: function() {
        if (!this.tempLatLng) {
            alert('位置情報が取得できませんでした。再度ピンを配置してください。');
            return;
        }

        const datetime = document.getElementById('nmDatetime').value || new Date().toISOString();
        const category = document.getElementById('nmCategory').value;
        const involvedTarget = document.getElementById('nmInvolvedTarget').value;
        const riskLevel = document.getElementById('nmRiskLevel').value;
        const description = document.getElementById('nmDescription').value.trim() || '特記事項なし';

        const newReport = {
            id: 'nm_' + Date.now(),
            lat: this.tempLatLng.lat,
            lon: this.tempLatLng.lng,
            datetime: datetime,
            category: category,
            involvedTarget: involvedTarget,
            riskLevel: riskLevel,
            description: description,
            createdAt: new Date().toISOString()
        };

        this.reports.push(newReport);
        this.addReportMarker(newReport);
        this.renderList();

        this.closeModal();
    },

    /**
     * Create Custom Warning Icon for Leaflet
     */
    createWarningIcon: function(color = '#facc15', isPulsing = false) {
        const pulseClass = isPulsing ? 'pulse-pin' : '';
        const svgIcon = `
            <div class="hazard-pin-wrapper ${pulseClass}">
                <svg viewBox="0 0 36 32" width="32" height="28" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
                    <path d="M18 2 L34 30 L2 30 Z" fill="${color}" stroke="#1f2937" stroke-width="2.2" stroke-linejoin="round"/>
                    <text x="18" y="24" font-family="sans-serif" font-weight="900" font-size="16" fill="#111827" text-anchor="middle">!</text>
                </svg>
            </div>
        `;
        return L.divIcon({
            html: svgIcon,
            className: 'custom-hazard-div-icon',
            iconSize: [32, 28],
            iconAnchor: [16, 26],
            popupAnchor: [0, -26]
        });
    },

    /**
     * Add Report Marker to Leaflet LayerGroup
     */
    addReportMarker: function(report) {
        let pinColor = '#facc15'; // Default Level 1 (Yellow)
        let riskBadgeBg = '#fef08a';
        let riskBadgeColor = '#854d0e';
        
        if (report.riskLevel.includes('重大') || report.riskLevel.includes('Lv.3')) {
            pinColor = '#ef4444'; // Level 3 (Red)
            riskBadgeBg = '#fee2e2';
            riskBadgeColor = '#991b1b';
        } else if (report.riskLevel.includes('中度') || report.riskLevel.includes('Lv.2')) {
            pinColor = '#f97316'; // Level 2 (Orange)
            riskBadgeBg = '#ffedd5';
            riskBadgeColor = '#9a3412';
        }

        const marker = L.marker([report.lat, report.lon], {
            icon: this.createWarningIcon(pinColor, false)
        });

        const formattedDate = report.datetime ? report.datetime.replace('T', ' ') : '-';

        const popupHtml = `
            <div class="near-miss-popup" style="font-size:12px; line-height:1.45; min-width:240px; max-width:280px;">
                <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid ${pinColor}; padding-bottom:4px; margin-bottom:6px;">
                    <b style="font-size:13px; color:#111827;"><i class="fa-solid fa-triangle-exclamation" style="color:${pinColor};"></i> ヒヤリハット報告</b>
                    <span style="font-size:10px; font-weight:bold; background:${riskBadgeBg}; color:${riskBadgeColor}; padding:1px 6px; border-radius:4px;">${report.riskLevel}</span>
                </div>
                <div style="margin-bottom:4px;">📅 <b>日時:</b> ${formattedDate}</div>
                <div style="margin-bottom:4px;">⚙️ <b>作業種別:</b> <span style="font-weight:600; color:#0f172a;">${report.category}</span></div>
                <div style="margin-bottom:4px;">👥 <b>関与対象:</b> ${report.involvedTarget}</div>
                <div style="margin-bottom:6px; background:#f8fafc; padding:6px 8px; border-radius:4px; border:1px solid #e2e8f0;">
                    <b>💬 状況・要因:</b><br>
                    <span style="color:#334155; white-space:pre-wrap;">${report.description}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; font-size:10px; color:#64748b; border-top:1px dashed #cbd5e1; padding-top:4px;">
                    <span>📍 ${report.lat.toFixed(5)}, ${report.lon.toFixed(5)}</span>
                    <button onclick="NearMissManager.deleteReport('${report.id}')" class="btn btn-outline-danger btn-xs" style="padding:1px 5px; font-size:10px;" title="この報告を削除">
                        <i class="fa-solid fa-trash"></i> 削除
                    </button>
                </div>
            </div>
        `;

        marker.bindPopup(popupHtml);
        marker.bindTooltip(`⚠️ ヒヤリハット: ${report.category} (${report.riskLevel})`, { sticky: true });

        marker.reportId = report.id;
        marker.addTo(this.layerGroup);
    },

    /**
     * Render Near-Miss List in Sidebar
     */
    renderList: function() {
        if (!this.listContainerEl) return;

        const count = this.reports.length;
        if (this.countEl) this.countEl.textContent = count;
        if (this.exportBtnEl) this.exportBtnEl.disabled = count === 0;

        if (count === 0) {
            this.listContainerEl.innerHTML = '<p class="empty-msg">ヒヤリハット報告なし</p>';
            return;
        }

        this.listContainerEl.innerHTML = this.reports.map((r, idx) => {
            let badgeBg = '#fef08a';
            let badgeColor = '#854d0e';
            let iconColor = '#ca8a04';
            if (r.riskLevel.includes('重大') || r.riskLevel.includes('Lv.3')) {
                badgeBg = '#fee2e2';
                badgeColor = '#991b1b';
                iconColor = '#dc2626';
            } else if (r.riskLevel.includes('中度') || r.riskLevel.includes('Lv.2')) {
                badgeBg = '#ffedd5';
                badgeColor = '#9a3412';
                iconColor = '#ea580c';
            }

            const timeStr = r.datetime ? (r.datetime.includes('T') ? r.datetime.split('T')[1] : r.datetime) : '';

            return `
                <div class="layer-item" style="padding: 4px 6px; cursor: pointer;" onclick="NearMissManager.zoomToReport('${r.id}')">
                    <div class="layer-info" style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; gap:4px; margin-bottom:2px;">
                            <i class="fa-solid fa-triangle-exclamation" style="color:${iconColor}; font-size:11px;"></i>
                            <span style="font-size:11px; font-weight:700; color:#1e293b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                ${r.category}
                            </span>
                            <span style="font-size:9px; font-weight:bold; background:${badgeBg}; color:${badgeColor}; padding:0 4px; border-radius:3px; margin-left:auto;">
                                ${r.riskLevel.split(' ')[0]}
                            </span>
                        </div>
                        <div style="font-size:10px; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            🕒 ${timeStr} | ${r.description}
                        </div>
                    </div>
                    <div class="layer-controls" style="margin-left:4px;">
                        <button class="layer-action-btn" style="color:#ef4444; padding:2px 4px;" onclick="event.stopPropagation(); NearMissManager.deleteReport('${r.id}')" title="削除">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Zoom to report pin on map and open popup
     */
    zoomToReport: function(id) {
        const report = this.reports.find(r => r.id === id);
        if (!report) return;

        this.map.setView([report.lat, report.lon], Math.max(this.map.getZoom(), 17));

        this.layerGroup.eachLayer(layer => {
            if (layer.reportId === id) {
                layer.openPopup();
            }
        });
    },

    /**
     * Delete Report
     */
    deleteReport: function(id) {
        const idx = this.reports.findIndex(r => r.id === id);
        if (idx === -1) return;

        this.reports.splice(idx, 1);

        this.layerGroup.eachLayer(layer => {
            if (layer.reportId === id) {
                this.layerGroup.removeLayer(layer);
            }
        });

        this.renderList();
    },

    /**
     * Export all reports as a standard GeoJSON FeatureCollection
     */
    exportGeoJson: function() {
        if (this.reports.length === 0) {
            alert('出力するヒヤリハット報告がありません。');
            return;
        }

        const features = this.reports.map(r => ({
            type: 'Feature',
            id: r.id,
            geometry: {
                type: 'Point',
                coordinates: [r.lon, r.lat]
            },
            properties: {
                type: 'NearMissHazard',
                datetime: r.datetime,
                category: r.category,
                involvedTarget: r.involvedTarget,
                riskLevel: r.riskLevel,
                description: r.description,
                createdAt: r.createdAt
            }
        }));

        const geojson = {
            type: 'FeatureCollection',
            name: 'Forestry_NearMiss_Reports',
            crs: {
                type: 'name',
                properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
            },
            metadata: {
                title: '林業現場 ヒヤリハット報告データ',
                exportDate: new Date().toISOString(),
                totalCount: this.reports.length
            },
            features: features
        };

        const jsonStr = JSON.stringify(geojson, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/geo+json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const nowStr = new Date().toISOString().slice(0, 10);
        a.download = `near_miss_reports_${nowStr}.geojson`;
        a.click();
        URL.revokeObjectURL(url);
    },

    /**
     * Load Sample Near-Miss Reports (located inside sample compartment)
     */
    loadSampleReports: function(baseLat = 36.593393, baseLon = 136.774920) {
        this.clearAll();

        const samples = [
            {
                id: 'nm_sample_1',
                lat: baseLat + 0.0007,
                lon: baseLon + 0.0004,
                datetime: '2026-05-18T09:42',
                category: '集運材・重機走行（死角・接近）',
                involvedTarget: '作業員 ⇔ 重機・車両',
                riskLevel: '中度 [Lv.2 重大事故の恐れ]',
                description: 'プロセッサ旋回時に合図不十分で後方死角に作業員が接近しそうになった。',
                createdAt: '2026-05-18T09:45:00Z'
            },
            {
                id: 'nm_sample_2',
                lat: baseLat + 0.0013,
                lon: baseLon + 0.0009,
                datetime: '2026-05-18T10:18',
                category: '伐木・造材作業（かかり木・跳ね返り）',
                involvedTarget: '作業員 ⇔ 立木・倒木',
                riskLevel: '重大 [Lv.3 死亡・重傷の危険]',
                description: '伐倒時に隣接木にかかり木となり、元玉外し作業中に急激に滑落・跳ね返りが発生。',
                createdAt: '2026-05-18T10:20:00Z'
            },
            {
                id: 'nm_sample_3',
                lat: baseLat - 0.0005,
                lon: baseLon - 0.0002,
                datetime: '2026-05-18T10:55',
                category: '足場・急傾斜地（滑落・転倒）',
                involvedTarget: '作業員単独',
                riskLevel: '軽微 [Lv.1 注意喚起]',
                description: '急傾斜の表土崩れ箇所で足を取られ転倒。下方の集材路へ滑落しかけた。',
                createdAt: '2026-05-18T11:00:00Z'
            }
        ];

        samples.forEach(s => {
            this.reports.push(s);
            this.addReportMarker(s);
        });

        this.renderList();
    },

    /**
     * Clear all reports
     */
    clearAll: function() {
        this.reports = [];
        this.layerGroup.clearLayers();
        this.cancelPinMode();
        this.renderList();
    }
};
