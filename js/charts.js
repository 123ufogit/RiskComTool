/**
 * Chart.js Visualization & Bidirectional Hover Synchronization Module
 */
const GPXCharts = {
    hourlyChartInstance: null,
    elevationChartInstance: null,
    onElevationHoverCallback: null,
    onHourlyHoverCallback: null,
    currentProfileData: [],

    /**
     * Set hover callbacks from Leaflet Map
     */
    setHoverCallbacks: function(onElevationHover, onHourlyHover) {
        this.onElevationHoverCallback = onElevationHover;
        this.onHourlyHoverCallback = onHourlyHover;
    },

    /**
     * Render or update 1-hour interval distance bar chart (supports 1 or 2 GPX tracks)
     * @param {string} canvasId 
     * @param {Array} gpxListForChart - Array of { name, color, hourlyData }
     */
    renderHourlyBarChart: function(canvasId, gpxListForChart) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (this.hourlyChartInstance) {
            this.hourlyChartInstance.destroy();
        }

        if (!gpxListForChart || gpxListForChart.length === 0) return;

        // Collect all unique labels across tracks in chronological order
        const labelSet = new Set();
        gpxListForChart.forEach(item => {
            if (item.hourlyData) {
                item.hourlyData.forEach(h => labelSet.add(h.label));
            }
        });
        const labels = Array.from(labelSet).sort();

        const datasets = [];
        if (gpxListForChart.length === 1) {
            const item = gpxListForChart[0];
            const hourlyMap = new Map(item.hourlyData.map(h => [h.label, h]));
            const horizDist = labels.map(l => hourlyMap.has(l) ? Math.round(hourlyMap.get(l).horizontalDistM) : 0);
            const climbDist = labels.map(l => hourlyMap.has(l) ? Math.round(hourlyMap.get(l).climbM) : 0);

            datasets.push(
                {
                    label: `[${item.name}] 水平移動距離 (m)`,
                    data: horizDist,
                    backgroundColor: 'rgba(46, 125, 50, 0.75)',
                    borderColor: '#1b5e20',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: `[${item.name}] 垂直上昇量 (m)`,
                    data: climbDist,
                    backgroundColor: 'rgba(230, 81, 0, 0.75)',
                    borderColor: '#e65100',
                    borderWidth: 1,
                    yAxisID: 'y1'
                }
            );
        } else {
            // 2 GPX tracks comparison
            gpxListForChart.forEach((item, idx) => {
                const hourlyMap = new Map(item.hourlyData.map(h => [h.label, h]));
                const horizDist = labels.map(l => hourlyMap.has(l) ? Math.round(hourlyMap.get(l).horizontalDistM) : 0);
                const climbDist = labels.map(l => hourlyMap.has(l) ? Math.round(hourlyMap.get(l).climbM) : 0);
                const baseColor = item.color || (idx === 0 ? '#1565c0' : '#e65100');

                datasets.push(
                    {
                        label: `[${item.name}] 水平移動 (m)`,
                        data: horizDist,
                        backgroundColor: idx === 0 ? 'rgba(37, 99, 235, 0.7)' : 'rgba(220, 38, 38, 0.7)',
                        borderColor: idx === 0 ? '#1d4ed8' : '#b91c1c',
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        label: `[${item.name}] 垂直上昇 (m)`,
                        data: climbDist,
                        backgroundColor: idx === 0 ? 'rgba(96, 165, 250, 0.5)' : 'rgba(251, 146, 60, 0.5)',
                        borderColor: idx === 0 ? '#3b82f6' : '#f97316',
                        borderWidth: 1,
                        yAxisID: 'y1'
                    }
                );
            });
        }

        const titleText = gpxListForChart.length > 1
            ? `📊 1時間当たり移動距離グラフ比較: ${gpxListForChart.map(g => g.name).join(' vs ')}`
            : `📊 1時間当たり移動距離グラフ (毎時00分開始) - ${gpxListForChart[0].name}`;

        this.hourlyChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onHover: (event, activeElements) => {
                    if (this.onHourlyHoverCallback) {
                        if (activeElements && activeElements.length > 0) {
                            const dataIndex = activeElements[0].index;
                            const targetLabel = labels[dataIndex];
                            // Pass all available hour items from loaded GPX tracks matching this label
                            const matchedHours = [];
                            gpxListForChart.forEach(item => {
                                if (item.hourlyData) {
                                    const found = item.hourlyData.find(h => h.label === targetLabel);
                                    if (found) matchedHours.push({ name: item.name, color: item.color, hourData: found });
                                }
                            });
                            this.onHourlyHoverCallback(matchedHours, targetLabel);
                        } else {
                            this.onHourlyHoverCallback([], '');
                        }
                    }
                },
                plugins: {
                    title: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    },
                    legend: {
                        position: 'top',
                        labels: { boxWidth: 14, font: { size: 11 } }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: '時間帯 (JST)' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: '水平移動距離 (m)' },
                        beginAtZero: true
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: '垂直上昇量 (m)' },
                        grid: { drawOnChartArea: false },
                        beginAtZero: true
                    }
                }
            }
        });
    },

    /**
     * Render continuous elevation profile line chart (straight lines, tension: 0)
     * Supports overlaying 1 or 2 GPX tracks on the same chart, with integrated 2-point proximity distance bar chart,
     * and alert time intervals highlighted via background color bands
     * @param {string} canvasId
     * @param {Array} gpxListForProfile - Array of { name, color, profileData }
     * @param {Array} alertIntervals - Array of { start: Date, end: Date, minDistance: number }
     * @param {Object|null} proximityResult - Result object from GPXDistance.calculate containing lines and threshold
     */
    renderElevationLineChart: function(canvasId, gpxListForProfile, alertIntervals = [], proximityResult = null) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (this.elevationChartInstance) {
            this.elevationChartInstance.destroy();
        }

        if (!gpxListForProfile || gpxListForProfile.length === 0) return;

        this.currentProfileData = gpxListForProfile[0].profileData || [];

        // Build labels (using time if available, or point index)
        const maxLen = Math.max(...gpxListForProfile.map(g => (g.profileData ? g.profileData.length : 0)));
        const sampleStep = maxLen > 2500 ? Math.ceil(maxLen / 2500) : 1;

        const primaryGpx = gpxListForProfile[0];
        const primarySampled = primaryGpx.profileData.filter((_, idx) => idx % sampleStep === 0);

        const labels = primarySampled.map(p => {
            if (p.time) {
                const d = new Date(p.time);
                return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
            }
            return `Pt ${p.idx}`;
        });

        const datasets = [];
        const defaultColors = ['#2563eb', '#dc2626'];

        // 1. Distance Bar Chart Dataset (Integrated into Elevation Profile Chart during proximity analysis period)
        let hasDistanceData = false;
        if (proximityResult && proximityResult.lines && proximityResult.lines.length > 0) {
            const lines = proximityResult.lines;
            const threshold = proximityResult.threshold || 20.0;
            const firstLineTime = new Date(lines[0].timestamp).getTime();
            const lastLineTime = new Date(lines[lines.length - 1].timestamp).getTime();
            const minTime = Math.min(firstLineTime, lastLineTime);
            const maxTime = Math.max(firstLineTime, lastLineTime);

            const distValues = [];
            const bgColors = [];
            const borderColors = [];

            primarySampled.forEach(p => {
                if (!p.time) {
                    distValues.push(null);
                    bgColors.push('rgba(0,0,0,0)');
                    borderColors.push('rgba(0,0,0,0)');
                    return;
                }

                const ptTime = new Date(p.time).getTime();
                // 棒グラフは解析期間の間だけ表示 (Only within analysis period)
                if (ptTime < minTime - 30000 || ptTime > maxTime + 30000) {
                    distValues.push(null);
                    bgColors.push('rgba(0,0,0,0)');
                    borderColors.push('rgba(0,0,0,0)');
                    return;
                }

                // Find closest match in calculated proximity lines
                let closestLine = null;
                let minDiff = Infinity;
                for (let i = 0; i < lines.length; i++) {
                    const lTime = new Date(lines[i].timestamp).getTime();
                    const diff = Math.abs(lTime - ptTime);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestLine = lines[i];
                    }
                }

                // If match is within 3 minutes of the sampled point
                if (closestLine && minDiff <= 180000) {
                    const distVal = parseFloat(closestLine.distanceM.toFixed(1));
                    distValues.push(distVal);
                    if (closestLine.isDanger || distVal <= threshold) {
                        // アラート区間の中: 赤系の色 (Reddish for alert intervals)
                        bgColors.push('rgba(239, 68, 68, 0.78)');
                        borderColors.push('#dc2626');
                    } else {
                        // それ以外: 薄い青色 (Light blue outside alert intervals)
                        bgColors.push('rgba(147, 197, 253, 0.65)');
                        borderColors.push('#60a5fa');
                    }
                } else {
                    distValues.push(null);
                    bgColors.push('rgba(0,0,0,0)');
                    borderColors.push('rgba(0,0,0,0)');
                }
            });

            if (distValues.some(v => v !== null)) {
                hasDistanceData = true;
                datasets.push({
                    type: 'bar',
                    label: `2地点間 離隔距離 (m) [閾値: ${threshold}m]`,
                    data: distValues,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1,
                    borderRadius: 2,
                    yAxisID: 'y1',
                    order: 2,
                    barPercentage: 0.85
                });
            }
        }

        // 2. Continuous Elevation Profile Line Datasets
        gpxListForProfile.forEach((item, gIdx) => {
            if (!item.profileData) return;
            const sampled = item.profileData.filter((_, idx) => idx % sampleStep === 0);
            const elevations = sampled.map(p => parseFloat(p.ele.toFixed(1)));
            const lineColor = item.color || defaultColors[gIdx % defaultColors.length];

            datasets.push({
                type: 'line',
                label: `${item.name} 標高 (m)`,
                data: elevations,
                borderColor: lineColor,
                backgroundColor: gIdx === 0 ? 'rgba(37, 99, 235, 0.08)' : 'rgba(220, 38, 38, 0.08)',
                fill: gpxListForProfile.length === 1 && !hasDistanceData,
                tension: 0, // No smoothing - straight polyline segments
                borderWidth: 2.5,
                pointRadius: sampled.length > 200 ? 0 : 2,
                pointBackgroundColor: lineColor,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 1,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: lineColor,
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 2,
                yAxisID: 'y',
                order: 1
            });
        });

        // Custom plugin to draw red-tinted background highlight bands for alert time intervals
        const alertBackgroundPlugin = {
            id: 'alertBackgroundHighlight',
            beforeDatasetsDraw(chart) {
                if (!alertIntervals || alertIntervals.length === 0) return;
                const { ctx, chartArea, scales } = chart;
                if (!chartArea || !scales.x) return;

                const { top, bottom, height, left, right } = chartArea;
                const xScale = scales.x;

                alertIntervals.forEach(inv => {
                    const sTime = inv.start ? new Date(inv.start).getTime() : 0;
                    const eTime = inv.end ? new Date(inv.end).getTime() : 0;
                    if (!sTime || !eTime) return;

                    let startIdx = -1;
                    let endIdx = -1;

                    primarySampled.forEach((p, idx) => {
                        if (p.time) {
                            const ptTime = new Date(p.time).getTime();
                            if (ptTime >= sTime && ptTime <= eTime) {
                                if (startIdx === -1) startIdx = idx;
                                endIdx = idx;
                            }
                        }
                    });

                    if (startIdx !== -1 && endIdx !== -1) {
                        const xStart = Math.max(left, xScale.getPixelForValue(startIdx) - 8);
                        const xEnd = Math.min(right, xScale.getPixelForValue(endIdx) + 8);
                        const bandWidth = Math.max(xEnd - xStart, 18);

                        ctx.save();
                        // Translucent Soft Red Background
                        ctx.fillStyle = 'rgba(239, 68, 68, 0.20)';
                        ctx.fillRect(xStart, top, bandWidth, height);

                        // Top Red Accent Border
                        ctx.fillStyle = 'rgba(220, 38, 38, 0.85)';
                        ctx.fillRect(xStart, top, bandWidth, 3);

                        // Top Label
                        ctx.font = 'bold 10px sans-serif';
                        ctx.fillStyle = '#b91c1c';
                        ctx.fillText(`⚠️ 接近アラート区間 (${inv.minDistance ? inv.minDistance.toFixed(1) + 'm' : ''})`, xStart + 4, top + 14);
                        ctx.restore();
                    }
                });
            }
        };

        const chartTitle = hasDistanceData
            ? `📈 連続標高プロファイル & 2地点間離隔距離 (複合グラフ): ${gpxListForProfile.map(g => g.name).join(' vs ')}${alertIntervals.length > 0 ? ' [⚠️ 接近アラート時間帯: 赤色棒 / 背景強調]' : ''}`
            : (gpxListForProfile.length > 1
                ? `📈 連続標高プロファイル重ね合わせ比較 (折れ線): ${gpxListForProfile.map(g => g.name).join(' vs ')}`
                : `📈 時系列 連続標高プロファイル (折れ線・平滑化なし) - ${gpxListForProfile[0].name}`);

        this.elevationChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            plugins: [alertBackgroundPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                onHover: (event, activeElements) => {
                    if (this.onElevationHoverCallback) {
                        if (activeElements && activeElements.length > 0) {
                            const pointsList = [];
                            activeElements.forEach(el => {
                                const ds = datasets[el.datasetIndex];
                                if (!ds || ds.type === 'bar') return;
                                const dsIdx = el.datasetIndex;
                                const sampleIdx = el.index;
                                const activeGpxItem = gpxListForProfile.find(g => ds.label && ds.label.includes(g.name));
                                if (activeGpxItem && activeGpxItem.profileData) {
                                    const sampled = activeGpxItem.profileData.filter((_, idx) => idx % sampleStep === 0);
                                    const pt = sampled[sampleIdx] || activeGpxItem.profileData[sampleIdx];
                                    if (pt) {
                                        pointsList.push({
                                            point: pt,
                                            datasetIndex: dsIdx,
                                            color: activeGpxItem.color || defaultColors[0],
                                            name: activeGpxItem.name
                                        });
                                    }
                                }
                            });
                            this.onElevationHoverCallback(pointsList);
                        } else {
                            this.onElevationHoverCallback([]);
                        }
                    }
                },
                plugins: {
                    title: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (context) => {
                                if (context.dataset.yAxisID === 'y1' || context.dataset.type === 'bar') {
                                    const val = context.parsed.y;
                                    if (val === null || val === undefined || isNaN(val)) return '';
                                    const thresh = (proximityResult && proximityResult.threshold) || 20;
                                    const isD = val <= thresh;
                                    return `2地点間 離隔距離: ${val.toFixed(1)} m ${isD ? '(⚠️ 接近アラート)' : '(安全)'}`;
                                }
                                return `${context.dataset.label}: ${context.parsed.y} m`;
                            }
                        }
                    },
                    legend: {
                        position: 'top',
                        labels: { boxWidth: 14, font: { size: 11 } }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: '時刻 / 測位点 (JST)' },
                        ticks: { maxTicksLimit: 12 }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: '標高 (m)' },
                        ticks: { precision: 0 }
                    },
                    y1: {
                        type: 'linear',
                        display: hasDistanceData,
                        position: 'right',
                        title: { display: true, text: '2地点間 離隔距離 (m)' },
                        grid: { drawOnChartArea: false },
                        beginAtZero: true,
                        ticks: { precision: 0 }
                    }
                }
            }
        });
    },

    /**
     * Map to Chart: Highlight closest chart point from Map Hover
     */
    highlightChartFromMapPoint: function(pointIndex) {
        if (!this.elevationChartInstance || !this.currentProfileData || this.currentProfileData.length === 0) return;

        // If downsampled, find corresponding index in sampled array
        const dataset = this.elevationChartInstance.data.datasets[0];
        const dataCount = dataset.data.length;
        const totalOrig = this.currentProfileData.length;

        const chartIndex = Math.round((pointIndex / totalOrig) * (dataCount - 1));

        if (chartIndex >= 0 && chartIndex < dataCount) {
            this.elevationChartInstance.setActiveElements([{ datasetIndex: 0, index: chartIndex }]);
            this.elevationChartInstance.tooltip.setActiveElements([{ datasetIndex: 0, index: chartIndex }], { x: 0, y: 0 });
            this.elevationChartInstance.update();
        }
    },

    /**
     * Save chart canvas to PNG file with white background
     */
    saveChartAsPng: function(chartInstance, defaultFilename = 'chart.png') {
        if (!chartInstance) {
            alert('保存するグラフが表示されていません');
            return;
        }

        const canvas = chartInstance.canvas;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(canvas, 0, 0);

        const imgUri = tempCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = defaultFilename;
        link.href = imgUri;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
