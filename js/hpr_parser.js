/**
 * StanForD 2010 (.hpr - Harvested Production) Parser
 * Converts forestry harvester production XML into GeoJSON FeatureCollection of single harvested trees.
 */
const HPRParser = {
    /**
     * Parse HPR XML string into standard GeoJSON FeatureCollection
     * @param {string} xmlText - XML content of .hpr file
     * @param {string} fileName - File name
     * @returns {Object} GeoJSON FeatureCollection
     */
    parse: function(xmlText, fileName = 'harvested_production.hpr') {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            throw new Error(`XMLの解析に失敗しました: ${parserError.textContent}`);
        }

        // 1. Extract Machine Information
        let machineCategory = 'Harvester';
        let machineKey = '';
        let headManufacturer = '';
        let headModel = '';
        const machineEl = xmlDoc.getElementsByTagName('Machine')[0];
        if (machineEl) {
            machineCategory = machineEl.getAttribute('machineCategory') || 'Harvester';
            machineKey = this.getNodeText(machineEl, 'MachineKey');
            headManufacturer = this.getNodeText(machineEl, 'MachineHeadManufacturer');
            const headModelEl = machineEl.getElementsByTagName('MachineHeadModel')[0];
            if (headModelEl) {
                headModel = headModelEl.textContent || '';
                const yr = headModelEl.getAttribute('headModelYear');
                if (yr) headModel += ` (${yr}年製)`;
            }
        }

        // 2. Extract Header Info
        const headerEl = xmlDoc.getElementsByTagName('HarvestedProductionHeader')[0];
        const creationDate = headerEl ? this.getNodeText(headerEl, 'CreationDate') : '';
        const senderApp = headerEl ? this.getNodeText(headerEl, 'SenderApplication') : '';

        // 3. Extract Species Groups Dictionary
        const speciesDict = {};
        const speciesGroupEls = xmlDoc.getElementsByTagName('SpeciesGroupDefinition');
        for (let i = 0; i < speciesGroupEls.length; i++) {
            const sg = speciesGroupEls[i];
            const name = this.getNodeText(sg, 'SpeciesGroupName') || `樹種_${i + 1}`;
            const userId = this.getNodeText(sg, 'SpeciesGroupUserID') || '';
            const keyAttr = sg.getAttribute('speciesGroupKey') || '';
            const keyEl = this.getNodeText(sg, 'SpeciesGroupKey') || '';
            const key = keyAttr || keyEl || userId || String(i + 1);

            // Friendly Japanese name mapping
            let friendlyName = name;
            const upper = (name + ' ' + userId).toUpperCase();
            if (upper.includes('SUGI') || upper.includes('スギ') || upper.includes('CEDAR') || upper.includes('CRYPTOMERIA')) {
                friendlyName = `スギ (${name})`;
            } else if (upper.includes('HINOKI') || upper.includes('ヒノキ') || upper.includes('CYPRESS')) {
                friendlyName = `ヒノキ (${name})`;
            } else if (upper.includes('TALL') || upper.includes('PINE') || upper.includes('アカマツ') || upper.includes('マツ')) {
                friendlyName = `アカマツ (${name})`;
            } else if (upper.includes('GRAN') || upper.includes('SPRUCE') || upper.includes('トウヒ')) {
                friendlyName = `トウヒ (${name})`;
            } else if (upper.includes('BJÖRK') || upper.includes('BJORK') || upper.includes('BIRCH') || upper.includes('カバ')) {
                friendlyName = `シラカバ (${name})`;
            } else if (upper.includes('CONTORTA')) {
                friendlyName = `コントルタパイン (${name})`;
            }

            const order = this.getNodeText(sg, 'SpeciesGroupPresentationOrder') || String(i + 1);

            const info = {
                name: friendlyName,
                rawName: name,
                userId: userId,
                order: order,
                dbhHeight: this.getNodeText(sg, 'DBHHeight') || '110'
            };

            if (key) speciesDict[key] = info;
            if (userId) speciesDict[userId] = info;
            if (name) speciesDict[name] = info;
            if (order) speciesDict[order] = info;
            speciesDict[String(i + 1)] = info;
            // Also map common StanForD offsets (e.g. 317 + i)
            speciesDict[String(317 + i)] = info;
        }

        // 4. Extract Product Definitions Dictionary
        const productDict = {};
        const productEls = xmlDoc.getElementsByTagName('ProductDefinition');
        for (let i = 0; i < productEls.length; i++) {
            const p = productEls[i];
            const pKey = this.getNodeText(p, 'ProductKey') || p.getAttribute('productKey') || String(i + 1);
            const pName = this.getNodeText(p, 'ProductName') || this.getNodeText(p, 'ProductGroupName') || `製品_${pKey}`;
            const pUser = this.getNodeText(p, 'ProductUserID') || '';
            const stemType = this.getNodeText(p, 'StemTypeCode') === '1' ? '用材(Timmer)' : '原料材/パルプ(Massaved)';
            productDict[pKey] = {
                key: pKey,
                name: pName,
                userId: pUser,
                stemType: stemType
            };
        }

        // 5. Extract Site / Object Definition
        const objEl = xmlDoc.getElementsByTagName('ObjectDefinition')[0];
        const siteName = objEl ? (this.getNodeText(objEl, 'ObjectName') || this.getNodeText(objEl, 'ObjectUserID')) : '';
        const realEstate = objEl ? this.getNodeText(objEl, 'RealEstateIDObject') : '';
        const subObjEl = xmlDoc.getElementsByTagName('SubObject')[0];
        const subObjName = subObjEl ? this.getNodeText(subObjEl, 'SubObjectName') : '';
        const loggingForm = subObjEl ? this.getNodeText(subObjEl, 'LoggingFormDescription') : (objEl ? this.getNodeText(objEl, 'LoggingFormDescription') : '');

        // 6. Extract Stems (Harvested Trees)
        const stemEls = xmlDoc.getElementsByTagName('Stem');
        const features = [];
        let totalVolSob = 0.0;
        let totalVolSub = 0.0;
        let totalLogCount = 0;

        for (let i = 0; i < stemEls.length; i++) {
            const stem = stemEls[i];
            
            // Look for coordinates in StemCoordinates or SingleTreeCoordinates
            let lat = null, lon = null, alt = null;
            const coordsEl = stem.getElementsByTagName('StemCoordinates')[0] || stem.getElementsByTagName('SingleTreeCoordinates')[0];
            if (coordsEl) {
                const latText = this.getNodeText(coordsEl, 'Latitude');
                const lonText = this.getNodeText(coordsEl, 'Longitude');
                const altText = this.getNodeText(coordsEl, 'Altitude');
                if (latText && lonText) {
                    lat = parseFloat(latText);
                    lon = parseFloat(lonText);
                    if (altText) alt = parseFloat(altText);
                }
            }

            // Skip if no valid GPS position
            if (lat === null || isNaN(lat) || lon === null || isNaN(lon)) {
                continue;
            }

            const stemKey = this.getNodeText(stem, 'StemKey') || String(i + 1);
            const stemNumber = this.getNodeText(stem, 'StemNumber') || stemKey;
            const speciesKey = this.getNodeText(stem, 'SpeciesGroupKey') || this.getNodeText(stem, 'SpeciesGroupUserID');
            const speciesInfo = speciesDict[speciesKey] || speciesDict[String(i + 1)] || { name: `樹種(${speciesKey || '不明'})`, rawName: speciesKey || '不明' };
            const processingDate = this.getNodeText(stem, 'ProcessingDate');
            const operatorKey = this.getNodeText(stem, 'OperatorKey');

            // DBH and single tree properties
            const singleTreeEl = stem.getElementsByTagName('SingleTreeProcessedStem')[0];
            let dbhMm = null;
            let refDiamMm = null;
            let stemGrade = '';
            if (singleTreeEl) {
                const dbhText = this.getNodeText(singleTreeEl, 'DBH');
                if (dbhText) dbhMm = parseFloat(dbhText);
                const refText = this.getNodeText(singleTreeEl, 'ReferenceDiameter');
                if (refText) refDiamMm = parseFloat(refText);
                stemGrade = this.getNodeText(singleTreeEl, 'StemGrade');
            }
            if (dbhMm === null) {
                const fallbackDbh = this.getNodeText(stem, 'DBH');
                if (fallbackDbh) dbhMm = parseFloat(fallbackDbh);
            }

            const dbhCm = dbhMm !== null ? parseFloat((dbhMm / 10).toFixed(1)) : null;

            // Logs (玉切り丸太)
            const logEls = stem.getElementsByTagName('Log');
            const logsDetail = [];
            let stemVolSob = 0.0;
            let stemVolSub = 0.0;
            let stemVolPrice = 0.0;

            for (let j = 0; j < logEls.length; j++) {
                const log = logEls[j];
                const lKey = this.getNodeText(log, 'LogKey') || String(j + 1);
                const pKey = this.getNodeText(log, 'ProductKey');
                const pInfo = productDict[pKey] || { name: `製品#${pKey}`, stemType: '一般丸太' };
                
                // Volumes
                let vSob = 0.0, vSub = 0.0, vPrice = 0.0;
                const volEls = log.getElementsByTagName('LogVolume');
                for (let k = 0; k < volEls.length; k++) {
                    const vEl = volEls[k];
                    const cat = vEl.getAttribute('logVolumeCategory') || '';
                    const val = parseFloat(vEl.textContent || '0');
                    if (cat === 'm3sob') vSob = val;
                    else if (cat === 'm3sub') vSub = val;
                    else if (cat.includes('price')) vPrice = val;
                }

                // If single volume tag without category
                if (vSob === 0 && vSub === 0 && volEls.length === 1) {
                    vSob = parseFloat(volEls[0].textContent || '0');
                    vSub = vSob;
                }

                // Length & Diameter
                let lenCm = null;
                const lenText = this.getNodeText(log, 'LogLength') || this.getNodeText(log, 'Length');
                if (lenText) lenCm = parseFloat(lenText);

                let diamMm = null;
                const diamText = this.getNodeText(log, 'TopDiameter') || this.getNodeText(log, 'LogDiameter');
                if (diamText) diamMm = parseFloat(diamText);

                stemVolSob += vSob;
                stemVolSub += vSub;
                stemVolPrice += vPrice;

                logsDetail.push({
                    logKey: lKey,
                    productName: pInfo.name,
                    stemType: pInfo.stemType,
                    lengthM: lenCm !== null ? parseFloat((lenCm / 100).toFixed(2)) : null,
                    lengthCm: lenCm,
                    diameterCm: diamMm !== null ? parseFloat((diamMm / 10).toFixed(1)) : null,
                    diameterMm: diamMm,
                    volumeSobM3: parseFloat(vSob.toFixed(3)),
                    volumeSubM3: parseFloat(vSub.toFixed(3))
                });
            }

            totalVolSob += stemVolSob;
            totalVolSub += stemVolSub;
            totalLogCount += logEls.length;

            const feature = {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: alt !== null ? [lon, lat, alt] : [lon, lat]
                },
                properties: {
                    title: `🌲 伐倒単木 #${stemNumber}`,
                    stemKey: stemKey,
                    stemNumber: stemNumber,
                    species: speciesInfo.name,
                    speciesRaw: speciesInfo.rawName,
                    dbhCm: dbhCm,
                    dbhMm: dbhMm,
                    referenceDiameterMm: refDiamMm,
                    stemGrade: stemGrade,
                    logCount: logEls.length,
                    totalVolumeSobM3: parseFloat(stemVolSob.toFixed(3)),
                    totalVolumeSubM3: parseFloat(stemVolSub.toFixed(3)),
                    altitudeM: alt,
                    processingDate: processingDate,
                    operatorKey: operatorKey,
                    machine: `${headManufacturer} ${headModel}`.trim() || 'Harvester',
                    siteName: siteName || realEstate || '林業施業現場',
                    subObjectName: subObjName,
                    loggingForm: loggingForm || '伐倒作業',
                    logs: logsDetail
                }
            };

            features.push(feature);
        }

        const geojson = {
            type: 'FeatureCollection',
            metadata: {
                standard: 'StanForD 2010 (hpr)',
                fileName: fileName,
                senderApp: senderApp,
                creationDate: creationDate,
                machine: `${headManufacturer} ${headModel}`.trim() || machineCategory,
                siteName: siteName || realEstate || '',
                loggingForm: loggingForm || '',
                treeCount: features.length,
                totalLogs: totalLogCount,
                totalVolumeSobM3: parseFloat(totalVolSob.toFixed(3)),
                totalVolumeSubM3: parseFloat(totalVolSub.toFixed(3)),
                convertedAt: new Date().toISOString()
            },
            features: features
        };

        return geojson;
    },

    getNodeText: function(parentEl, tagName) {
        if (!parentEl) return '';
        const el = parentEl.getElementsByTagName(tagName)[0];
        return el ? (el.textContent || '').trim() : '';
    }
};
