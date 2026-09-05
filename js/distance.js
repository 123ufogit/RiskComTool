/**
 * Distance Calculation & Proximity Safety Alert & 10m Risk Distribution Mesh Module
 */
const GPXDistance = {
    /**
     * Compute horizontal distances between Source GPX and Target GPX with time range and interval filter
     * @param {Object} sourceGpx 
     * @param {Object} targetGpx 
     * @param {number} dangerThresholdM 
     * @param {Object} options - { startTime: 'HH:MM', endTime: 'HH:MM', intervalMin: 1 }
     */
    calculate: function(sourceGpx, targetGpx, dangerThresholdM = 20.0, options = {}) {
        const srcPts = sourceGpx.points || [];
        const tgtPts = targetGpx.points || [];

        if (srcPts.length === 0 || tgtPts.length === 0) {
            return {
                lines: [],
                alertPoints: [],
                alertIntervals: [],
                minDistanceM: 0,
                avgDistanceM: 0,
                dangerCount: 0,
                geoJson: null
            };
        }

        const intervalSec = (parseFloat(options.intervalMin) || 1.0) * 60; // in seconds

        // Time filtering helper (HH:MM to minutes from 00:00)
        const parseMinutes = (timeStr) => {
            if (!timeStr) return null;
            const parts = timeStr.split(':').map(Number);
            return parts.length === 2 ? parts[0] * 60 + parts[1] : null;
        };

        const startMin = parseMinutes(options.startTime);
        const endMin = parseMinutes(options.endTime);

        // Filter source points by time window
        const filteredSrcPts = srcPts.filter(p => {
            if (!p.time) return true;
            const d = new Date(p.time);
            const m = d.getHours() * 60 + d.getMinutes();
            if (startMin !== null && m < startMin) return false;
            if (endMin !== null && m > endMin) return false;
            return true;
        });

        const lines = [];
        let minDistance = Infinity;
        let sumDistance = 0;
        let dangerCount = 0;
        let lastSampleTime = -Infinity;

        let targetSearchIndex = 0;

        for (let i = 0; i < filteredSrcPts.length; i++) {
            const sp = filteredSrcPts[i];
            if (!sp.time) continue;

            const sTimeSec = sp.time.getTime() / 1000.0;

            // Apply sampling interval
            if (sTimeSec - lastSampleTime < intervalSec && i > 0) {
                continue;
            }
            lastSampleTime = sTimeSec;

            // Find closest time point in target
            let bestTargetPt = tgtPts[targetSearchIndex];
            let bestDiff = Math.abs(tgtPts[targetSearchIndex].time ? tgtPts[targetSearchIndex].time.getTime() - sp.time.getTime() : Infinity);

            for (let j = targetSearchIndex; j < tgtPts.length; j++) {
                if (!tgtPts[j].time) continue;
                const diff = Math.abs(tgtPts[j].time.getTime() - sp.time.getTime());
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestTargetPt = tgtPts[j];
                    targetSearchIndex = j;
                } else if (diff > bestDiff && j > targetSearchIndex + 10) {
                    break;
                }
            }

            if (!bestTargetPt) continue;

            const distM = GPXParser.calcHorizontalDistance(sp.lat, sp.lon, bestTargetPt.lat, bestTargetPt.lon);
            const timeDiffSec = bestDiff / 1000.0;
            const isDanger = distM <= dangerThresholdM;

            if (distM < minDistance) minDistance = distM;
            sumDistance += distM;
            if (isDanger) dangerCount++;

            lines.push({
                sourcePoint: sp,
                targetPoint: bestTargetPt,
                distanceM: distM,
                timeDiffSec: timeDiffSec,
                isDanger: isDanger,
                timestamp: sp.time
            });
        }

        const count = lines.length;
        const avgDistance = count > 0 ? (sumDistance / count) : 0;
        if (minDistance === Infinity) minDistance = 0;

        // Extract Alert Points
        const alertPoints = lines.filter(l => l.isDanger);

        // Group into alert time intervals (start - end timestamps)
        const alertIntervals = [];
        let currentInterval = null;

        lines.forEach(l => {
            if (l.isDanger) {
                if (!currentInterval) {
                    currentInterval = { start: l.timestamp, end: l.timestamp, minDistance: l.distanceM };
                } else {
                    currentInterval.end = l.timestamp;
                    if (l.distanceM < currentInterval.minDistance) currentInterval.minDistance = l.distanceM;
                }
            } else {
                if (currentInterval) {
                    alertIntervals.push(currentInterval);
                    currentInterval = null;
                }
            }
        });
        if (currentInterval) alertIntervals.push(currentInterval);

        // Construct GeoJSON FeatureCollection
        const geoJson = this.createGeoJSON(sourceGpx.name, targetGpx.name, lines, dangerThresholdM);

        return {
            lines: lines,
            alertPoints: alertPoints,
            alertIntervals: alertIntervals,
            minDistanceM: minDistance,
            avgDistanceM: avgDistance,
            dangerCount: dangerCount,
            geoJson: geoJson
        };
    },

    /**
     * Create GeoJSON FeatureCollection with Point geometries only for alert incidents
     */
    createGeoJSON: function(sourceName, targetName, matchLines, dangerThresholdM) {
        const features = [];

        matchLines.forEach((item, idx) => {
            const sp = item.sourcePoint;

            // Only Point features for alert points (< threshold)
            if (item.isDanger) {
                features.push({
                    type: 'Feature',
                    id: `alert_point_${idx + 1}`,
                    geometry: {
                        type: 'Point',
                        coordinates: [sp.lon, sp.lat, sp.ele || 0]
                    },
                    properties: {
                        type: 'alert_point',
                        source_gpx: sourceName,
                        target_gpx: targetName,
                        distance_m: parseFloat(item.distanceM.toFixed(2)),
                        time_diff_sec: parseFloat(item.timeDiffSec.toFixed(1)),
                        timestamp: sp.time ? sp.time.toISOString() : null,
                        elevation_m: sp.ele || 0,
                        danger_threshold_m: dangerThresholdM,
                        risk_level: item.distanceM < 5.0 ? '極めて危険' : (item.distanceM < 10.0 ? '高危険' : '注意・警戒')
                    }
                });
            }
        });

        return {
            type: 'FeatureCollection',
            name: `${sourceName}_vs_${targetName}_Safety_Alert_Points`,
            crs: {
                type: 'name',
                properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
            },
            features: features
        };
    },

    /**
     * Generate 10m Mesh Risk Distribution Map intersecting Forestry Compartment Polygons
     * @param {Array} alertPoints - List of { sourcePoint: { lat, lon, ele, time }, distanceM }
     * @param {Array} polygonLayers - Leaflet L.geoJSON polygon layers
     * @returns {Object} GeoJSON FeatureCollection of 10m grid polygons with risk counts
     */
    generateRiskMesh10m: function(alertPoints, polygonLayers = []) {
        if (!alertPoints || alertPoints.length === 0) {
            return {
                type: 'FeatureCollection',
                name: 'Forestry_10m_Risk_Mesh',
                features: []
            };
        }

        // 1. Determine bounding box from alert points and polygons
        let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;

        alertPoints.forEach(p => {
            const sp = p.sourcePoint;
            if (sp.lat < minLat) minLat = sp.lat;
            if (sp.lat > maxLat) maxLat = sp.lat;
            if (sp.lon < minLon) minLon = sp.lon;
            if (sp.lon > maxLon) maxLon = sp.lon;
        });

        if (polygonLayers && polygonLayers.length > 0) {
            polygonLayers.forEach(layer => {
                const b = layer.getBounds();
                if (b.isValid()) {
                    if (b.getSouth() < minLat) minLat = b.getSouth();
                    if (b.getNorth() > maxLat) maxLat = b.getNorth();
                    if (b.getWest() < minLon) minLon = b.getWest();
                    if (b.getEast() > maxLon) maxLon = b.getEast();
                }
            });
        }

        // Add 20m margin
        const dLat10m = 10.0 / 111132.954; // ~10m in degrees latitude
        const midLatRad = ((minLat + maxLat) / 2.0) * (Math.PI / 180.0);
        const dLon10m = 10.0 / (111412.84 * Math.cos(midLatRad)); // ~10m in degrees longitude

        minLat -= dLat10m * 2;
        maxLat += dLat10m * 2;
        minLon -= dLon10m * 2;
        maxLon += dLon10m * 2;

        // Helper: 10-step 3-color gradient (0.0: Blue, 0.5: Yellow, 1.0: Red)
        const get10StepRiskGradient = (ratio) => {
            const clamped = Math.max(0.0, Math.min(1.0, ratio));
            // 10 discrete steps: 0, 1, 2, ..., 9
            const stepIdx = Math.min(9, Math.max(0, Math.round(clamped * 9)));
            const norm = stepIdx / 9.0; // Normalized 0.0 to 1.0

            // Blue: rgb(37, 99, 235), Yellow: rgb(234, 179, 8), Red: rgb(220, 38, 38)
            let r, g, b;
            if (norm <= 0.5) {
                const t = norm / 0.5; // 0.0 -> 1.0
                r = Math.round(37 + (234 - 37) * t);
                g = Math.round(99 + (179 - 99) * t);
                b = Math.round(235 + (8 - 235) * t);
            } else {
                const t = (norm - 0.5) / 0.5; // 0.0 -> 1.0
                r = Math.round(234 + (220 - 234) * t);
                g = Math.round(179 + (38 - 179) * t);
                b = Math.round(8 + (38 - 8) * t);
            }

            const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
            
            let label = '';
            if (stepIdx === 0) label = '安全 (透明) [Lv.1]';
            else if (stepIdx <= 2) label = `低リスク [Lv.${stepIdx + 1}]`;
            else if (stepIdx <= 4) label = `注意 [Lv.${stepIdx + 1}]`;
            else if (stepIdx === 5) label = '中リスク (黄) [Lv.6]';
            else if (stepIdx <= 7) label = `警戒 [Lv.${stepIdx + 1}]`;
            else if (stepIdx === 8) label = '高リスク [Lv.9]';
            else label = '最高リスク (赤) [Lv.10]';

            return {
                step: stepIdx + 1,
                ratio: parseFloat(norm.toFixed(2)),
                color: hex,
                label: label
            };
        };

        // 1. First pass: compute counts across all 10m grid cells spanning the entire forestry compartment area
        const rawCells = [];
        let maxCount = 0;

        for (let lat = minLat; lat < maxLat; lat += dLat10m) {
            for (let lon = minLon; lon < maxLon; lon += dLon10m) {
                const south = lat;
                const north = lat + dLat10m;
                const west = lon;
                const east = lon + dLon10m;

                const insidePts = alertPoints.filter(p => {
                    const sp = p.sourcePoint;
                    return sp.lat >= south && sp.lat < north && sp.lon >= west && sp.lon < east;
                });

                const count = insidePts.length;
                if (count > maxCount) maxCount = count;

                rawCells.push({
                    south, north, west, east,
                    insidePts,
                    count
                });
            }
        }

        if (maxCount === 0) maxCount = 1;

        // 2. Second pass: build GeoJSON polygons for dangerous mesh cells only (hide cells with 0 alert points)
        const meshFeatures = [];
        let meshId = 1;

        rawCells.forEach(cell => {
            if (cell.count === 0) return; // 危険接近点のない安全エリアは非表示

            const ratio = cell.count / maxCount;
            const grad = get10StepRiskGradient(ratio);
            const minD = cell.insidePts.length > 0 ? Math.min(...cell.insidePts.map(p => p.distanceM)) : 0;

            meshFeatures.push({
                type: 'Feature',
                id: `mesh_10m_${meshId++}`,
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [cell.west, cell.south],
                        [cell.east, cell.south],
                        [cell.east, cell.north],
                        [cell.west, cell.north],
                        [cell.west, cell.south]
                    ]]
                },
                properties: {
                    mesh_size_m: 10,
                    alert_point_count: cell.count,
                    max_count: maxCount,
                    risk_ratio: parseFloat(ratio.toFixed(3)),
                    risk_step_10: grad.step,
                    risk_level: grad.label,
                    risk_color: grad.color,
                    min_distance_m: parseFloat(minD.toFixed(1)),
                    center_lat: parseFloat(((cell.south + cell.north) / 2).toFixed(6)),
                    center_lon: parseFloat(((cell.west + cell.east) / 2).toFixed(6))
                }
            });
        });

        return {
            type: 'FeatureCollection',
            name: 'Forestry_10m_Risk_Distribution_Mesh',
            crs: {
                type: 'name',
                properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
            },
            features: meshFeatures
        };
    }
};
