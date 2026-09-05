/**
 * Near-Miss (ヒヤリハット) Incident Reporting & GeoJSON Manager
 * 項目構成:
 * - 分類①: 伐木 / 造材 / 集材 / 運材 / その他
 * - 分類②: 墜落・転落 / 転倒 / 激突 / 飛来・落下 / はさまれ・巻き込まれ / 切れ / その他
 * - いつ: 発生日付 (date) + 時間帯 (timeSlot)
 * - 誰が・何が (who): 作業者（チェンソー） / 作業者（荷掛け） / ラプトル / タワーヤーダ / その他（自由入力）
 * - 何を (what): 移動 / 伐倒 / 木寄せ / 集材 / 枝払い / 造材 / 積み込み / 積み下ろし / その他（自由入力）
 * - どのようにして (how): 自由入力
 * - どうなった (result): 自由入力
 * - 対応策 (countermeasure): 自由入力
 */
const NearMissManager = {
    map: null,
    layerGroup: null,
    reports: [],
    editingReportId: null,
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

        // Toggle "Other" text fields
        const whoSelect = document.getElementById('nmWho');
        const whoOtherInput = document.getElementById('nmWhoOther');
        if (whoSelect && whoOtherInput) {
            whoSelect.addEventListener('change', () => {
                if (whoSelect.value === 'その他') {
                    whoOtherInput.style.display = 'block';
                    whoOtherInput.required = true;
                    whoOtherInput.focus();
                } else {
                    whoOtherInput.style.display = 'none';
                    whoOtherInput.required = false;
                    whoOtherInput.value = '';
                }
            });
        }

        const whatSelect = document.getElementById('nmWhat');
        const whatOtherInput = document.getElementById('nmWhatOther');
        if (whatSelect && whatOtherInput) {
            whatSelect.addEventListener('change', () => {
                if (whatSelect.value === 'その他') {
                    whatOtherInput.style.display = 'block';
                    whatOtherInput.required = true;
                    whatOtherInput.focus();
                } else {
                    whatOtherInput.style.display = 'none';
                    whatOtherInput.required = false;
                    whatOtherInput.value = '';
                }
            });
        }

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
        this.editingReportId = null;
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

        this.openModal(latlng, null);
    },

    /**
     * Open Report Form Modal (for creation or editing)
     */
    openModal: function(latlng, reportToEdit = null) {
        if (!this.modalEl) return;

        const modalTitleEl = document.getElementById('nearMissModalTitle');
        const submitBtnEl = document.getElementById('submitNearMissFormBtn');
        const form = document.getElementById('nearMissForm');
        if (form) form.reset();

        const whoOtherInput = document.getElementById('nmWhoOther');
        const whatOtherInput = document.getElementById('nmWhatOther');
        const whoSelect = document.getElementById('nmWho');
        const whatSelect = document.getElementById('nmWhat');

        if (reportToEdit) {
            // Edit Mode
            this.editingReportId = reportToEdit.id;
            this.tempLatLng = { lat: reportToEdit.lat, lng: reportToEdit.lon };

            if (modalTitleEl) {
                modalTitleEl.innerHTML = '<i class="fa-solid fa-pen-to-square" style="color: #ca8a04;"></i> ヒヤリハット報告の編集';
            }
            if (submitBtnEl) {
                submitBtnEl.innerHTML = '<i class="fa-solid fa-save"></i> 変更を更新';
            }

            document.getElementById('nmCategory1').value = reportToEdit.category1 || '伐木';
            document.getElementById('nmCategory2').value = reportToEdit.category2 || '墜落・転落';
            document.getElementById('nmDate').value = reportToEdit.date || '';
            document.getElementById('nmTimeSlot').value = reportToEdit.timeSlot || '09:00〜10:00';

            // Check if who is standard option
            let whoMatched = false;
            if (whoSelect) {
                for (let opt of whoSelect.options) {
                    if (opt.value === reportToEdit.who) {
                        whoSelect.value = reportToEdit.who;
                        whoMatched = true;
                        break;
                    }
                }
                if (!whoMatched) {
                    whoSelect.value = 'その他';
                    if (whoOtherInput) {
                        whoOtherInput.style.display = 'block';
                        whoOtherInput.required = true;
                        whoOtherInput.value = reportToEdit.who || '';
                    }
                } else if (whoOtherInput) {
                    whoOtherInput.style.display = 'none';
                    whoOtherInput.required = false;
                }
            }

            // Check if what is standard option
            let whatMatched = false;
            if (whatSelect) {
                for (let opt of whatSelect.options) {
                    if (opt.value === reportToEdit.what) {
                        whatSelect.value = reportToEdit.what;
                        whatMatched = true;
                        break;
                    }
                }
                if (!whatMatched) {
                    whatSelect.value = 'その他';
                    if (whatOtherInput) {
                        whatOtherInput.style.display = 'block';
                        whatOtherInput.required = true;
                        whatOtherInput.value = reportToEdit.what || '';
                    }
                } else if (whatOtherInput) {
                    whatOtherInput.style.display = 'none';
                    whatOtherInput.required = false;
                }
            }

            document.getElementById('nmHow').value = reportToEdit.how || '';
            document.getElementById('nmResult').value = reportToEdit.result || '';
            document.getElementById('nmCountermeasure').value = reportToEdit.countermeasure || '';

            const coordInfoEl = document.getElementById('nmCoordinatesText');
            if (coordInfoEl) {
                coordInfoEl.textContent = `📍 緯度: ${reportToEdit.lat.toFixed(6)}, 経度: ${reportToEdit.lon.toFixed(6)}`;
            }
        } else {
            // New Registration Mode
            this.editingReportId = null;

            if (modalTitleEl) {
                modalTitleEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: #ca8a04;"></i> ヒヤリハット報告の登録';
            }
            if (submitBtnEl) {
                submitBtnEl.innerHTML = '<i class="fa-solid fa-check"></i> 報告を登録';
            }

            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const dateInput = document.getElementById('nmDate');
            if (dateInput) dateInput.value = `${yyyy}-${mm}-${dd}`;

            const curHour = now.getHours();
            const timeSlotSelect = document.getElementById('nmTimeSlot');
            if (timeSlotSelect) {
                if (curHour < 8) timeSlotSelect.value = '08:00以前（早朝）';
                else if (curHour >= 17) timeSlotSelect.value = '17:00以降（夕方・夜間）';
                else {
                    const startH = String(curHour).padStart(2, '0');
                    const endH = String(curHour + 1).padStart(2, '0');
                    const targetSlot = `${startH}:00〜${endH}:00`;
                    for (let opt of timeSlotSelect.options) {
                        if (opt.value === targetSlot) {
                            timeSlotSelect.value = targetSlot;
                            break;
                        }
                    }
                }
            }

            if (whoOtherInput) {
                whoOtherInput.style.display = 'none';
                whoOtherInput.required = false;
            }
            if (whatOtherInput) {
                whatOtherInput.style.display = 'none';
                whatOtherInput.required = false;
            }

            const coordInfoEl = document.getElementById('nmCoordinatesText');
            if (coordInfoEl && latlng) {
                coordInfoEl.textContent = `📍 緯度: ${latlng.lat.toFixed(6)}, 経度: ${latlng.lng.toFixed(6)}`;
            }
        }

        this.modalEl.style.display = 'flex';
    },

    /**
     * Edit an existing report by ID
     */
    editReport: function(id) {
        const report = this.reports.find(r => r.id === id);
        if (!report) return;

        this.openModal({ lat: report.lat, lng: report.lon }, report);
    },

    /**
     * Close Report Form Modal
     */
    closeModal: function() {
        if (this.modalEl) this.modalEl.style.display = 'none';
        this.editingReportId = null;
        this.cancelPinMode();
    },

    /**
     * Handle Form Submission (Create or Update)
     */
    handleFormSubmit: function() {
        if (!this.tempLatLng) {
            alert('位置情報が取得できませんでした。');
            return;
        }

        const category1 = document.getElementById('nmCategory1').value;
        const category2 = document.getElementById('nmCategory2').value;
        const date = document.getElementById('nmDate').value || new Date().toISOString().slice(0, 10);
        const timeSlot = document.getElementById('nmTimeSlot').value;

        const whoSelect = document.getElementById('nmWho').value;
        const whoOther = document.getElementById('nmWhoOther').value.trim();
        const who = (whoSelect === 'その他') ? (whoOther || 'その他') : whoSelect;

        const whatSelect = document.getElementById('nmWhat').value;
        const whatOther = document.getElementById('nmWhatOther').value.trim();
        const what = (whatSelect === 'その他') ? (whatOther || 'その他') : whatSelect;

        const how = document.getElementById('nmHow').value.trim();
        const result = document.getElementById('nmResult').value.trim();
        const countermeasure = document.getElementById('nmCountermeasure').value.trim();

        if (this.editingReportId) {
            // Update existing report
            const report = this.reports.find(r => r.id === this.editingReportId);
            if (report) {
                report.category1 = category1;
                report.category2 = category2;
                report.date = date;
                report.timeSlot = timeSlot;
                report.who = who;
                report.what = what;
                report.how = how;
                report.result = result;
                report.countermeasure = countermeasure;
                report.updatedAt = new Date().toISOString();

                // Update marker on map
                this.updateReportMarker(report);
            }
        } else {
            // Create new report
            const newReport = {
                id: 'nm_' + Date.now(),
                lat: this.tempLatLng.lat,
                lon: this.tempLatLng.lng,
                category1: category1,
                category2: category2,
                date: date,
                timeSlot: timeSlot,
                who: who,
                what: what,
                how: how,
                result: result,
                countermeasure: countermeasure,
                createdAt: new Date().toISOString()
            };

            this.reports.push(newReport);
            this.addReportMarker(newReport);
        }

        this.renderList();
        this.closeModal();
    },

    /**
     * Get Color for Category1
     */
    getCategoryColor: function(cat1) {
        switch (cat1) {
            case '伐木': return '#ef4444'; // 赤
            case '造材': return '#0284c7'; // 青
            case '集材': return '#8b5cf6'; // 紫
            case '運材': return '#16a34a'; // 緑
            default: return '#f59e0b';     // アンバー/黄
        }
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
     * Build Popup HTML for a report
     */
    buildPopupHtml: function(report) {
        const pinColor = this.getCategoryColor(report.category1);

        return `
            <div class="near-miss-popup" style="font-size:12px; line-height:1.45; min-width:270px; max-width:320px;">
                <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid ${pinColor}; padding-bottom:4px; margin-bottom:6px;">
                    <b style="font-size:13px; color:#111827;"><i class="fa-solid fa-triangle-exclamation" style="color:${pinColor};"></i> ヒヤリハット報告</b>
                    <span style="font-size:10px; font-weight:bold; background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:1px 6px; border-radius:4px;">
                        [${report.category1}] ${report.category2}
                    </span>
                </div>
                <div style="margin-bottom:3px;">📅 <b>いつ:</b> ${report.date} (${report.timeSlot})</div>
                <div style="margin-bottom:3px;">👤 <b>誰が・何が:</b> <span style="font-weight:700; color:#0f172a;">${report.who}</span></div>
                <div style="margin-bottom:5px;">🎯 <b>何を:</b> <span style="font-weight:700; color:#0f172a;">${report.what}</span></div>
                
                <div style="background:#f8fafc; padding:6px 8px; border-radius:4px; border:1px solid #e2e8f0; margin-bottom:5px;">
                    ${report.how ? `
                    <div style="margin-bottom:4px;">
                        <b style="color:#475569;">🔍 どのようにして:</b><br>
                        <span style="color:#1e293b; white-space:pre-wrap;">${report.how}</span>
                    </div>` : ''}
                    <div style="margin-bottom:4px; color:#b91c1c;">
                        <b style="color:#dc2626;">💥 どうなった:</b><br>
                        <span style="color:#991b1b; white-space:pre-wrap;">${report.result || '-'}</span>
                    </div>
                    ${report.countermeasure ? `
                    <div style="border-top:1px dashed #cbd5e1; padding-top:4px; margin-top:4px;">
                        <b style="color:#15803d;">🛡️ 対応策:</b><br>
                        <span style="color:#166534; white-space:pre-wrap;">${report.countermeasure}</span>
                    </div>` : ''}
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; font-size:10px; color:#64748b; border-top:1px dashed #cbd5e1; padding-top:4px;">
                    <span>📍 ${report.lat.toFixed(5)}, ${report.lon.toFixed(5)}</span>
                    <div>
                        <button onclick="NearMissManager.editReport('${report.id}')" class="btn btn-outline-primary btn-xs" style="padding:1px 6px; font-size:10px; margin-right:4px;" title="この報告を編集">
                            <i class="fa-solid fa-pen-to-square"></i> 編集
                        </button>
                        <button onclick="NearMissManager.deleteReport('${report.id}')" class="btn btn-outline-danger btn-xs" style="padding:1px 6px; font-size:10px;" title="この報告を削除">
                            <i class="fa-solid fa-trash"></i> 削除
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Add Report Marker to Leaflet LayerGroup
     */
    addReportMarker: function(report) {
        const pinColor = this.getCategoryColor(report.category1);

        const marker = L.marker([report.lat, report.lon], {
            icon: this.createWarningIcon(pinColor, false)
        });

        marker.bindPopup(this.buildPopupHtml(report));
        marker.bindTooltip(`⚠️ [${report.category1}/${report.category2}] ${report.who} (${report.what})`, { sticky: true });

        marker.reportId = report.id;
        marker.addTo(this.layerGroup);
    },

    /**
     * Update existing Report Marker on Leaflet map
     */
    updateReportMarker: function(report) {
        const pinColor = this.getCategoryColor(report.category1);

        this.layerGroup.eachLayer(layer => {
            if (layer.reportId === report.id) {
                layer.setIcon(this.createWarningIcon(pinColor, false));
                layer.setPopupContent(this.buildPopupHtml(report));
                layer.unbindTooltip();
                layer.bindTooltip(`⚠️ [${report.category1}/${report.category2}] ${report.who} (${report.what})`, { sticky: true });
            }
        });
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

        this.listContainerEl.innerHTML = this.reports.map((r) => {
            const iconColor = this.getCategoryColor(r.category1);
            const detailText = r.how ? `🔍 ${r.how}` : `💥 ${r.result}`;

            return `
                <div class="layer-item" style="padding: 5px 6px; cursor: pointer;" onclick="NearMissManager.zoomToReport('${r.id}')">
                    <div class="layer-info" style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; gap:4px; margin-bottom:2px;">
                            <i class="fa-solid fa-triangle-exclamation" style="color:${iconColor}; font-size:11px;"></i>
                            <span style="font-size:11px; font-weight:700; color:#1e293b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                [${r.category1}] ${r.category2}
                            </span>
                            <span style="font-size:9px; font-weight:bold; background:#f1f5f9; color:#475569; padding:0 4px; border-radius:3px; margin-left:auto; border:1px solid #e2e8f0;">
                                ${r.who.split('（')[0]}
                            </span>
                        </div>
                        <div style="font-size:10px; color:#475569; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-bottom:1px;">
                            🕒 ${r.date} ${r.timeSlot} | 🎯 ${r.what}
                        </div>
                        <div style="font-size:10px; color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            ${detailText}
                        </div>
                    </div>
                    <div class="layer-controls" style="margin-left:4px; display:flex; align-items:center;">
                        <button class="layer-action-btn" style="color:#0284c7; padding:2px 4px; margin-right:2px;" onclick="event.stopPropagation(); NearMissManager.editReport('${r.id}')" title="編集">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
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
                category1: r.category1,
                category2: r.category2,
                date: r.date,
                timeSlot: r.timeSlot,
                who: r.who,
                what: r.what,
                how: r.how,
                result: r.result,
                countermeasure: r.countermeasure,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt || null
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
                category1: '集材',
                category2: 'はさまれ・巻き込まれ',
                date: '2026-05-18',
                timeSlot: '09:00〜10:00',
                who: '作業者（荷掛け）',
                what: '木寄せ',
                how: 'タワーヤーダによる集材木寄せ作業中、合図と同時に荷掛け側ワイヤーが急激に跳ね上がり、',
                result: '作業者の足元かすめてワイヤーが通過。直前に退避動作を取り接触・怪我は免れた。',
                countermeasure: '集材木寄せ時は荷掛け位置から樹高の2倍以上の安全退避距離を確保し、無線合図の復唱を徹底する。',
                createdAt: '2026-05-18T09:45:00Z'
            },
            {
                id: 'nm_sample_2',
                lat: baseLat + 0.0013,
                lon: baseLon + 0.0009,
                category1: '伐木',
                category2: '飛来・落下',
                date: '2026-05-18',
                timeSlot: '10:00〜11:00',
                who: '作業者（チェンソー）',
                what: '伐倒',
                how: '直径38cmのスギ立木をチェンソーで伐倒中、隣接木の上部から枯れ枝（直径約8cm・長さ約1.5m）が折れて落下。',
                result: '作業者のヘルメットのつばをかすめて足元に落下。作業者に負傷なし。',
                countermeasure: '伐倒作業前に必ず樹冠・上空の枯れ枝・つる絡みを360度点検し、退避場所の刈り払いとヘルメットあご紐締結を励行する。',
                createdAt: '2026-05-18T10:20:00Z'
            },
            {
                id: 'nm_sample_3',
                lat: baseLat - 0.0005,
                lon: baseLon - 0.0002,
                category1: '運材',
                category2: '転倒',
                date: '2026-05-18',
                timeSlot: '13:00〜14:00',
                who: 'ラプトル',
                what: '積み込み',
                how: '作業道肩の軟弱地盤上で長尺丸太をグラップルで掴み旋回させた際、',
                result: '谷側の履帯が土砂沈下して車体が25度傾斜。咄嗟にグラップルを接地させて転倒を回避した。',
                countermeasure: '積込位置の路肩地盤耐力を事前確認し、排土板・アタッチメントの接地と旋回速度の抑制を義務付ける。',
                createdAt: '2026-05-18T13:30:00Z'
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
