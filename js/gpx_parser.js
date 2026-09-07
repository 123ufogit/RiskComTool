/**
 * GPX Parser & Merger Module
 */
const GPXParser = {
    /**
     * Parse raw GPX XML string into structured Object
     */
    parse: function(xmlText, fileName = 'track.gpx') {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error('GPXの解析に失敗しました: ' + parseError.textContent);
        }

        const points = [];
        const trkpts = xmlDoc.querySelectorAll('trkpt');
        
        trkpts.forEach(pt => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lon = parseFloat(pt.getAttribute('lon'));
            const eleNode = pt.querySelector('ele');
            const timeNode = pt.querySelector('time');
            
            const ele = eleNode ? parseFloat(eleNode.textContent) : 0.0;
            const time = timeNode ? new Date(timeNode.textContent) : null;

            if (!isNaN(lat) && !isNaN(lon)) {
                points.push({
                    lat: lat,
                    lon: lon,
                    ele: ele,
                    time: time
                });
            }
        });

        // If no trkpt, try wpt or rtept
        if (points.length === 0) {
            const wpts = xmlDoc.querySelectorAll('wpt, rtept');
            wpts.forEach(pt => {
                const lat = parseFloat(pt.getAttribute('lat'));
                const lon = parseFloat(pt.getAttribute('lon'));
                const eleNode = pt.querySelector('ele');
                const timeNode = pt.querySelector('time');
                const ele = eleNode ? parseFloat(eleNode.textContent) : 0.0;
                const time = timeNode ? new Date(timeNode.textContent) : null;
                if (!isNaN(lat) && !isNaN(lon)) {
                    points.push({ lat, lon, ele, time });
                }
            });
        }

        // Sort by time if timestamps available
        if (points.length > 0 && points[0].time) {
            points.sort((a, b) => (a.time - b.time));
        }

        return {
            fileName: fileName,
            name: fileName.replace(/\.gpx$/i, ''),
            points: points,
            rawXml: xmlText
        };
    },

    /**
     * Compute Geodesic Horizontal Distance between 2 coordinates (Haversine formula in meters)
     */
    calcHorizontalDistance: function(lat1, lon1, lat2, lon2) {
        const R = 6371000.0; // Earth radius in meters
        const rad = Math.PI / 180.0;
        const dLat = (lat2 - lat1) * rad;
        const dLon = (lon2 - lon1) * rad;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    /**
     * Feature 2: Merge multiple GPX files into a single GPX XML string
     */
    mergeGpxFiles: function(gpxList, mergedName = 'Merged_Forestry_Tracks') {
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<gpx version="1.1" creator="Forestry-Leaflet-App" xmlns="http://www.topografix.com/GPX/1/1">\n`;
        xml += `  <metadata>\n    <name>${mergedName}</name>\n    <time>${new Date().toISOString()}</time>\n  </metadata>\n`;

        gpxList.forEach((item, idx) => {
            xml += `  <trk>\n    <name>${item.name || 'Track_' + (idx + 1)}</name>\n    <trkseg>\n`;
            item.points.forEach(pt => {
                xml += `      <trkpt lat="${pt.lat}" lon="${pt.lon}">\n`;
                if (pt.ele !== undefined && pt.ele !== null) {
                    xml += `        <ele>${pt.ele.toFixed(2)}</ele>\n`;
                }
                if (pt.time) {
                    xml += `        <time>${pt.time.toISOString()}</time>\n`;
                }
                xml += `      </trkpt>\n`;
            });
            xml += `    </trkseg>\n  </trk>\n`;
        });

        xml += `</gpx>`;
        return xml;
    },

    /**
     * Smooth GPX Track Points by averaging coordinates over preceding window (past W seconds, e.g. 60s to 300s)
     */
    smoothTrack: function(gpx, windowSec = 120) {
        if (!gpx || !gpx.points || gpx.points.length === 0) {
            throw new Error('平滑化対象のGPXポイントデータが存在しません');
        }

        const smoothedPoints = [];
        const pts = gpx.points;
        const windowMs = windowSec * 1000;

        for (let i = 0; i < pts.length; i++) {
            const currentPt = pts[i];

            if (!currentPt.time) {
                // Fallback if no timestamps available: average over past index window (assume ~30s interval)
                const windowCount = Math.max(1, Math.round(windowSec / 30));
                const startIdx = Math.max(0, i - windowCount + 1);
                const windowPts = pts.slice(startIdx, i + 1);

                const avgLat = windowPts.reduce((sum, p) => sum + p.lat, 0) / windowPts.length;
                const avgLon = windowPts.reduce((sum, p) => sum + p.lon, 0) / windowPts.length;
                const avgEle = windowPts.reduce((sum, p) => sum + (p.ele || 0), 0) / windowPts.length;

                smoothedPoints.push({
                    lat: avgLat,
                    lon: avgLon,
                    ele: avgEle,
                    time: null
                });
                continue;
            }

            const currTimeMs = currentPt.time.getTime();
            const minTimeMs = currTimeMs - windowMs;

            // Find all points in [currTime - windowSec, currTime]
            const windowPts = [];
            for (let j = 0; j <= i; j++) {
                if (pts[j].time) {
                    const t = pts[j].time.getTime();
                    if (t >= minTimeMs && t <= currTimeMs) {
                        windowPts.push(pts[j]);
                    }
                }
            }

            if (windowPts.length === 0) {
                windowPts.push(currentPt);
            }

            const avgLat = windowPts.reduce((sum, p) => sum + p.lat, 0) / windowPts.length;
            const avgLon = windowPts.reduce((sum, p) => sum + p.lon, 0) / windowPts.length;
            const avgEle = windowPts.reduce((sum, p) => sum + (p.ele || 0), 0) / windowPts.length;

            smoothedPoints.push({
                lat: avgLat,
                lon: avgLon,
                ele: avgEle,
                time: new Date(currentPt.time.getTime())
            });
        }

        const newName = `${gpx.name} (平均化)`;
        const newFileName = gpx.fileName.replace(/\.gpx$/i, '') + ' (平均化).gpx';

        return {
            fileName: newFileName,
            name: newName,
            points: smoothedPoints,
            isSmoothed: true
        };
    }
};
