/**
 * Statistical Analysis Module (Feature 3 & 4)
 */
const GPXStats = {
    /**
     * Compute 1-hour interval statistics starting at :00, plus daily cumulative and elevation extremes
     */
    analyze: function(gpxData) {
        const points = gpxData.points;
        if (!points || points.length < 2) {
            return {
                hourly: [],
                totalHorizontalDistM: 0,
                totalClimbM: 0,
                totalDescentM: 0,
                minElevationM: points.length === 1 ? points[0].ele : 0,
                maxElevationM: points.length === 1 ? points[0].ele : 0,
                elevationDiffM: 0,
                avgHourlyDistM: 0,
                elevationProfile: []
            };
        }

        let totalHorizontal = 0;
        let totalClimb = 0;
        let totalDescent = 0;

        let minEle = points[0].ele;
        let maxEle = points[0].ele;

        // Group points by hour block: "YYYY-MM-DD HH:00"
        const hourBins = {};
        const elevProfile = [];

        for (let i = 0; i < points.length; i++) {
            const pt = points[i];
            
            // Track min/max elevation
            if (pt.ele < minEle) minEle = pt.ele;
            if (pt.ele > maxEle) maxEle = pt.ele;

            elevProfile.push({
                time: pt.time,
                ele: pt.ele,
                lat: pt.lat,
                lon: pt.lon,
                idx: i
            });

            if (i > 0) {
                const prev = points[i - 1];
                const dHoriz = GPXParser.calcHorizontalDistance(prev.lat, prev.lon, pt.lat, pt.lon);
                const dEle = pt.ele - prev.ele;

                totalHorizontal += dHoriz;
                if (dEle > 0) totalClimb += dEle;
                else totalDescent += Math.abs(dEle);

                // Determine hour bin (based on pt.time, or fallback if no timestamp)
                let binKey = '全区間';
                let binLabel = '全区間';
                if (pt.time) {
                    const d = new Date(pt.time);
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    const hh = String(d.getHours()).padStart(2, '0');
                    binKey = `${yyyy}-${mm}-${dd} ${hh}:00`;
                    binLabel = `${hh}:00〜${String((d.getHours() + 1) % 24).padStart(2, '0')}:00`;
                }

                if (!hourBins[binKey]) {
                    hourBins[binKey] = {
                        key: binKey,
                        label: binLabel,
                        horizontalDistM: 0,
                        climbM: 0,
                        descentM: 0,
                        minEle: pt.ele,
                        maxEle: pt.ele,
                        pointCount: 0,
                        startTime: pt.time,
                        endTime: pt.time
                    };
                }

                const b = hourBins[binKey];
                b.horizontalDistM += dHoriz;
                if (dEle > 0) b.climbM += dEle;
                else b.descentM += Math.abs(dEle);
                if (pt.ele < b.minEle) b.minEle = pt.ele;
                if (pt.ele > b.maxEle) b.maxEle = pt.ele;
                b.pointCount++;
                b.endTime = pt.time;
            }
        }

        // Format hourly list
        const hourlyList = Object.values(hourBins).map(b => {
            let durationMin = 60.0;
            if (b.startTime && b.endTime) {
                const diffMin = (b.endTime - b.startTime) / (1000 * 60);
                durationMin = Math.max(1, diffMin);
            }
            const avgPerMin = b.horizontalDistM / durationMin;

            return {
                label: b.label,
                horizontalDistM: b.horizontalDistM,
                avgPerMinM: avgPerMin,
                climbM: b.climbM,
                descentM: b.descentM,
                minEle: b.minEle,
                maxEle: b.maxEle,
                pointCount: b.pointCount
            };
        });

        const totalHours = Math.max(1, hourlyList.length);
        const avgHourly = totalHorizontal / totalHours;

        return {
            hourly: hourlyList,
            totalHorizontalDistM: totalHorizontal,
            totalClimbM: totalClimb,
            totalDescentM: totalDescent,
            minElevationM: minEle,
            maxElevationM: maxEle,
            elevationDiffM: (maxEle - minEle),
            avgHourlyDistM: avgHourly,
            elevationProfile: elevProfile
        };
    },

    /**
     * Feature 4: Format calculation results into a downloadable CSV / Text string
     */
    formatAsText: function(gpxName, stats) {
        let txt = `=======================================================\n`;
        txt += ` 林業GPX移動統計 & 標高集計レポート\n`;
        txt += ` 対象ファイル: ${gpxName}\n`;
        txt += ` 出力日時: ${new Date().toLocaleString('ja-JP')}\n`;
        txt += `=======================================================\n\n`;

        txt += `【1日累積サマリー】\n`;
        txt += `- 1日総水平移動距離: ${(stats.totalHorizontalDistM / 1000).toFixed(3)} km (${stats.totalHorizontalDistM.toFixed(1)} m)\n`;
        txt += `- 1日総垂直上昇量: ${stats.totalClimbM.toFixed(1)} m\n`;
        txt += `- 1日総垂直下降量: ${stats.totalDescentM.toFixed(1)} m\n`;
        txt += `- 1時間当たり平均水平移動: ${(stats.avgHourlyDistM).toFixed(1)} m/時間\n`;
        txt += `- 標高範囲: 最低 ${stats.minElevationM.toFixed(1)} m 〜 最高 ${stats.maxElevationM.toFixed(1)} m (最大標高差: ${stats.elevationDiffM.toFixed(1)} m)\n\n`;

        txt += `【1時間区間別集計表 (毎時00分開始)】\n`;
        txt += `時間帯,水平移動合計(m),水平移動平均(m/分),垂直上昇(m),垂直下降(m),最低標高(m),最高標高(m),測位点数\n`;

        stats.hourly.forEach(h => {
            txt += `${h.label},${h.horizontalDistM.toFixed(1)},${h.avgPerMinM.toFixed(1)},${h.climbM.toFixed(1)},${h.descentM.toFixed(1)},${h.minEle.toFixed(1)},${h.maxEle.toFixed(1)},${h.pointCount}\n`;
        });

        return txt;
    }
};
