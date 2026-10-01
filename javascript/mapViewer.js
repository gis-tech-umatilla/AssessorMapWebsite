// =================================================================
// 🚀 ASSESSOR MAP QA PERFORMANCE PROFILER & LAG DEBUGGER
// =================================================================
window.QAProfiler = (function() {
    // Configurable lag thresholds (in milliseconds)
    const THRESHOLDS = {
        WARN: 16,    // Anything > 16ms drops a 60fps frame
        SLOW: 50,    // Anything > 50ms is a noticeable delay
        FREEZE: 150  // Anything > 150ms feels frozen to the user
    };

    // Store history for summary reporting
    const stats = {};

    function logExecution(name, durationMs, details = '') {
        if (!stats[name]) stats[name] = { count: 0, totalMs: 0, maxMs: 0, slowCount: 0 };
        stats[name].count++;
        stats[name].totalMs += durationMs;
        stats[name].maxMs = Math.max(stats[name].maxMs, durationMs);
        if (durationMs > THRESHOLDS.WARN) stats[name].slowCount++;

        // Only log if it crosses the frame-drop threshold (> 16ms)
        if (durationMs >= THRESHOLDS.WARN) {
            let color = '#f59e0b'; // Amber (Warn)
            let badge = '⚠️ SLOW';

            if (durationMs >= THRESHOLDS.FREEZE) {
                color = '#ef4444'; // Red (Freeze)
                badge = '🔥 FREEZE';
            } else if (durationMs >= THRESHOLDS.SLOW) {
                color = '#f97316'; // Orange (Noticeable Lag)
                badge = '🐢 LAG';
            }

            console.log(
                `%c[QA Profiler] %c${badge}%c ${name} took %c${durationMs.toFixed(2)}ms%c ${details}`,
                'color: #8b5cf6; font-weight: bold;',
                `background: ${color}; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;`,
                'color: #e2e8f0; font-weight: bold;',
                `color: ${color}; font-weight: bold; text-decoration: underline;`,
                'color: #94a3b8; italic;'
            );
        }
    }

    // Wraps synchronous and asynchronous functions
    function profileFunction(targetObj, fnName) {
        if (!targetObj || typeof targetObj[fnName] !== 'function') return;
        const originalFn = targetObj[fnName];

        targetObj[fnName] = function(...args) {
            const start = performance.now();
            
            try {
                const result = originalFn.apply(this, args);
                
                if (result && typeof result.then === 'function') {
                    return result.then(res => {
                        const duration = performance.now() - start;
                        logExecution(fnName, duration, '(async)');
                        return res;
                    }).catch(err => {
                        const duration = performance.now() - start;
                        logExecution(`${fnName} (failed)`, duration);
                        throw err;
                    });
                }

                const duration = performance.now() - start;
                logExecution(fnName, duration);
                return result;
            } catch (err) {
                const duration = performance.now() - start;
                logExecution(`${fnName} (error)`, duration);
                throw err;
            }
        };
    }

    // Detect browser-level Main Thread freezes (layout thrashing, heavy GC, style recalculations)
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                console.warn(
                    `%c[QA Profiler] 🚨 MAIN THREAD BLOCK%c Browser frozen for %c${entry.duration.toFixed(2)}ms%c`,
                    'color: #ef4444; font-weight: bold;',
                    'color: #f87171;',
                    'color: #f87171; font-weight: bold; text-decoration: underline;',
                    'color: #f87171;'
                );
            }
        });
        observer.observe({ entryTypes: ['longtask'] });
    }

    // Auto-patch key candidate functions in global window scope
    function init() {
        const targetFunctions = [
            'renderUI',
            'fetchPins',
            'scheduleViewportPatch',
            'loadActiveMap',
            'highlightSelectedFeature',
            'updatePopoverPosition',
            'triggerIssuePopover',
            'renderCommentsSync'
        ];

        targetFunctions.forEach(fnName => profileFunction(window, fnName));

        console.log(
            '%c[QA Profiler] Active! Monitoring functions & main-thread freezes...\nType QAProfiler.summary() in console at any time for aggregated statistics.',
            'color: #10b981; font-weight: bold; font-size: 12px;'
        );
    }

    if (document.readyState === 'complete') {
        setTimeout(init, 500);
    } else {
        window.addEventListener('load', () => setTimeout(init, 500));
    }

    return {
        summary() {
            console.table(
                Object.entries(stats).map(([fn, s]) => ({
                    Function: fn,
                    Calls: s.count,
                    'Slow Calls (>16ms)': s.slowCount,
                    'Avg Ms': (s.totalMs / s.count).toFixed(2),
                    'Max Ms': s.maxMs.toFixed(2),
                    'Total Ms': s.totalMs.toFixed(2)
                }))
            );
        },
        reset() {
            Object.keys(stats).forEach(k => delete stats[k]);
            console.log('[QA Profiler] Stats reset.');
        }
    };
})();
// Ensure PDF.js native worker is configured on the main thread
if (typeof pdfjsLib !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Safe Global State Declarations
if (typeof window.leafletMap === 'undefined') window.leafletMap = null;
if (typeof window.sheet1BaseOverlay === 'undefined') window.sheet1BaseOverlay = null;
if (typeof window.sheet2BaseOverlay === 'undefined') window.sheet2BaseOverlay = null;
if (typeof window.patchOverlay === 'undefined') window.patchOverlay = null;
if (typeof window.svgOverlayLayer === 'undefined') window.svgOverlayLayer = null;

if (typeof window.currentMapBounds === 'undefined') window.currentMapBounds = null;
if (typeof window.sheet1Bounds === 'undefined') window.sheet1Bounds = null;
if (typeof window.activePatchBounds === 'undefined') window.activePatchBounds = null;
if (typeof window.lastPatchZoom === 'undefined') window.lastPatchZoom = null;

if (typeof window.currentPage1 === 'undefined') window.currentPage1 = null;
if (typeof window.currentPage2 === 'undefined') window.currentPage2 = null;

if (typeof window.initialFitZoom === 'undefined') window.initialFitZoom = -2;
if (typeof window.initialCenterPoint === 'undefined') window.initialCenterPoint = null;

if (typeof window.patchDebounceTimer === 'undefined') window.patchDebounceTimer = null;
if (typeof window.activePatchTaskId === 'undefined') window.activePatchTaskId = 0;
if (typeof window.activeRenderTask === 'undefined') window.activeRenderTask = null;
if (typeof window.sheet2Bounds === 'undefined') window.sheet2Bounds = null;
if (typeof window.activePatchObjUrl === 'undefined') window.activePatchObjUrl = null;

// DOM References
var mapViewport = document.getElementById('mapViewport');
var placeholderText = document.getElementById('placeholderText');
var zoomControls = document.getElementById('zoomControls');
var drawingToolbar = document.getElementById('drawingToolbar');
var vectorDrawingOverlay = document.getElementById('vectorDrawingOverlay');

// Protect Toolbar Stacking
if (drawingToolbar) {
    drawingToolbar.style.zIndex = '10000';
    drawingToolbar.style.pointerEvents = 'auto';
}
if (zoomControls) {
    zoomControls.style.zIndex = '10000';
    zoomControls.style.pointerEvents = 'auto';
}

// Wheel Listener: Blocks zooming outside the map sheet
if (mapViewport && !mapViewport._wheelFilterBound) {
    mapViewport._wheelFilterBound = true;
    mapViewport.addEventListener('wheel', (e) => {
        if (!leafletMap || !currentMapBounds) return;
        const containerPoint = leafletMap.mouseEventToContainerPoint(e);
        const latLng = leafletMap.containerPointToLatLng(containerPoint);
        const mapBounds = L.latLngBounds(currentMapBounds);

        if (!mapBounds.contains(latLng)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, { capture: true, passive: false });
}

function adjustPinScaling() {}

function hidePatchOverlay() {
    if (activeRenderTask) {
        try { activeRenderTask.cancel(); } catch (e) {}
        activeRenderTask = null;
    }

    if (patchOverlay && leafletMap) {
        leafletMap.removeLayer(patchOverlay);
        patchOverlay = null;
        if (window.activePatchObjUrl) {
            URL.revokeObjectURL(window.activePatchObjUrl);
            window.activePatchObjUrl = null;
        }
    }
    activePatchBounds = null;
    lastPatchZoom = null;
}

// Keep track of active patch Object URL to revoke memory
if (typeof window.activePatchObjUrl === 'undefined') window.activePatchObjUrl = null;

let isPatchRendering = false;

function scheduleViewportPatch(isMoving = false) {
    if (!leafletMap || !currentPage1 || !sheet1Bounds) return;

    const currentZoom = leafletMap.getZoom();
    if (currentZoom <= initialFitZoom + 0.15) {
        hidePatchOverlay();
        clearTimeout(patchDebounceTimer);
        return;
    }

    const visibleBounds = leafletMap.getBounds();

    // If active patch already covers current screen space (plus 40% margin), keep it!
    if (patchOverlay && activePatchBounds) {
        const zoomDiff = Math.abs(currentZoom - (lastPatchZoom || 0));
        if (zoomDiff < 0.12 && activePatchBounds.contains(visibleBounds)) {
            return;
        }
    }

    if (isPatchRendering) return;

    clearTimeout(patchDebounceTimer);

    // Fast 100ms delay during slow floating / 30ms when gesture completes
    const delay = isMoving ? 100 : 30;

    patchDebounceTimer = setTimeout(async () => {
        if (isPatchRendering) return;
        const taskId = ++activePatchTaskId;

        let south = Math.max(0, Math.min(sheet1Bounds[1][0], visibleBounds.getSouth()));
        let north = Math.max(0, Math.min(sheet1Bounds[1][0], visibleBounds.getNorth()));
        let west = Math.max(0, Math.min(sheet1Bounds[1][1], visibleBounds.getWest()));
        let east = Math.max(0, Math.min(sheet1Bounds[1][1], visibleBounds.getEast()));

        if (east <= west || north <= south) {
            hidePatchOverlay();
            return;
        }

        const h1 = sheet1Bounds[1][0];
        const w1 = sheet1Bounds[1][1];

        // 40% Cushion so slow floating stays sharp without triggering new renders constantly
        const padLng = (east - west) * 0.40;
        const padLat = (north - south) * 0.40;

        const cropWest = Math.max(0, west - padLng);
        const cropEast = Math.min(w1, east + padLng);
        const cropSouth = Math.max(0, south - padLat);
        const cropNorth = Math.min(h1, north + padLat);

        const pdfViewport1 = currentPage1.getViewport({ scale: 1.0 });
        const pdfW = pdfViewport1.width;
        const pdfH = pdfViewport1.height;

        const cropPdfX = (cropWest / w1) * pdfW;
        const cropPdfW = ((cropEast - cropWest) / w1) * pdfW;
        const cropPdfY = ((h1 - cropNorth) / h1) * pdfH;
        const cropPdfH = ((cropNorth - cropSouth) / h1) * pdfH;

        const swPoint = leafletMap.latLngToContainerPoint(L.latLng(cropSouth, cropWest));
        const nePoint = leafletMap.latLngToContainerPoint(L.latLng(cropNorth, cropEast));
        const cropScreenPixelW = Math.abs(nePoint.x - swPoint.x);

        const dpr = window.devicePixelRatio || 1;
        let targetScale = Math.max(1.8, (cropScreenPixelW / cropPdfW) * dpr * 1.15);

        let patchPixelW = Math.round(cropPdfW * targetScale);
        let patchPixelH = Math.round(cropPdfH * targetScale);

        // Cap to 1800px max dimension so PDF.js vector drawing completes in ~80ms
        const MAX_DIM = 1800;
        if (patchPixelW > MAX_DIM || patchPixelH > MAX_DIM) {
            const clampRatio = Math.min(MAX_DIM / patchPixelW, MAX_DIM / patchPixelH);
            targetScale = targetScale * clampRatio;
            patchPixelW = Math.round(cropPdfW * targetScale);
            patchPixelH = Math.round(cropPdfH * targetScale);
        }

        const patchCanvas = document.createElement('canvas');
        patchCanvas.width = patchPixelW;
        patchCanvas.height = patchPixelH;

        const ctx = patchCanvas.getContext('2d');
        const renderViewport = currentPage1.getViewport({ scale: targetScale });
        const transformMatrix = [1, 0, 0, 1, -cropPdfX * targetScale, -cropPdfY * targetScale];

        isPatchRendering = true;

        try {
            activeRenderTask = currentPage1.render({ 
                canvasContext: ctx, 
                viewport: renderViewport, 
                transform: transformMatrix 
            });

            await activeRenderTask.promise;
            activeRenderTask = null;

            if (taskId === activePatchTaskId) {
                const patchBlob = await new Promise(resolve => patchCanvas.toBlob(resolve, 'image/jpeg', 0.85));
                if (patchBlob && taskId === activePatchTaskId) {
                    const patchBounds = [[cropSouth, cropWest], [cropNorth, cropEast]];
                    const newObjUrl = URL.createObjectURL(patchBlob);

                    // Double-buffer swap (no flashing)
                    const newPatchOverlay = L.imageOverlay(newObjUrl, patchBounds, { pane: 'tilePane', zIndex: 205 });

                    newPatchOverlay.once('load', () => {
                        if (taskId === activePatchTaskId) {
                            if (patchOverlay && leafletMap) leafletMap.removeLayer(patchOverlay);
                            if (window.activePatchObjUrl) URL.revokeObjectURL(window.activePatchObjUrl);

                            patchOverlay = newPatchOverlay;
                            patchOverlay.setZIndex(200);
                            window.activePatchObjUrl = newObjUrl;

                            activePatchBounds = L.latLngBounds([cropSouth, cropWest], [cropNorth, cropEast]);
                            lastPatchZoom = currentZoom;
                        } else {
                            if (leafletMap) leafletMap.removeLayer(newPatchOverlay);
                            URL.revokeObjectURL(newObjUrl);
                        }
                    });

                    newPatchOverlay.addTo(leafletMap);
                }
            }
        } catch (err) {
        } finally {
            isPatchRendering = false;
        }
    }, delay);
}

function resetToInitialView() {
    hidePatchOverlay();
    if (!leafletMap || !initialCenterPoint) return;
    leafletMap.setView(initialCenterPoint, initialFitZoom, { animate: false });
    scheduleViewportPatch();
    if (typeof renderUI === 'function') renderUI();
}

// Velocity Tracking State
let lastPanPos = null;
let lastPanTime = 0;
let currentPanVelocity = 0; // pixels per millisecond
let throttledPatchTimer = null;

function updatePanVelocity() {
    if (!leafletMap) return;

    const now = performance.now();
    const center = leafletMap.getCenter();
    const currentPos = leafletMap.latLngToContainerPoint(center);

    if (lastPanPos && lastPanTime) {
        const dt = now - lastPanTime;
        if (dt > 0) {
            const distance = currentPos.distanceTo(lastPanPos); // Screen distance in pixels
            currentPanVelocity = distance / dt; // px/ms
        }
    }

    lastPanPos = currentPos;
    lastPanTime = now;
}

function scheduleViewportPatchThrottled() {
    if (throttledPatchTimer) return;

    // Throttle low-velocity renders to max 1 per 250ms
    throttledPatchTimer = setTimeout(() => {
        throttledPatchTimer = null;
        scheduleViewportPatch();
    }, 250);
}

async function loadActiveMap(mapObj) {
    const rawUrl = mapObj?.file_url || mapObj?.url || mapObj?.fileUrl;
    if (!mapObj || !rawUrl) return;

    currentMapId = mapObj.id;
    if (typeof fetchMapsDirectory === 'function') fetchMapsDirectory();

    placeholderText.innerHTML = "<p class='text-[#1985a1] font-semibold animate-pulse'>Loading Map Sheets into Leaflet...</p>";
    if (drawingToolbar) drawingToolbar.classList.add('hidden');
    if (zoomControls) zoomControls.classList.add('hidden');
    if (typeof hideIssuePopover === 'function') hideIssuePopover();

    hidePatchOverlay();
    if (leafletMap) {
        leafletMap.remove();
        leafletMap = null;
        sheet1BaseOverlay = null;
        sheet2BaseOverlay = null;
        initialCenterPoint = null;
        svgOverlayLayer = null;
    }

    try {
        const pdf = await pdfjsLib.getDocument(rawUrl).promise;
        const hasSecondPage = pdf.numPages >= 2;

        currentPage1 = await pdf.getPage(1);
        const viewport1 = currentPage1.getViewport({ scale: 1.8 });

        const canvas1 = document.createElement('canvas');
        canvas1.width = viewport1.width;
        canvas1.height = viewport1.height;
        const context1 = canvas1.getContext('2d');

        await currentPage1.render({ canvasContext: context1, viewport: viewport1 }).promise;

        const blob1 = await new Promise(resolve => canvas1.toBlob(resolve, 'image/jpeg', 0.85));
        const imgUrl1 = URL.createObjectURL(blob1);

        let imgUrl2 = null;
        let viewport2 = null;

        if (hasSecondPage) {
            currentPage2 = await pdf.getPage(2);
            viewport2 = currentPage2.getViewport({ scale: 1.8 });

            const canvas2 = document.createElement('canvas');
            canvas2.width = viewport2.width;
            canvas2.height = viewport2.height;
            const context2 = canvas2.getContext('2d');

            await currentPage2.render({ canvasContext: context2, viewport: viewport2 }).promise;
            const blob2 = await new Promise(resolve => canvas2.toBlob(resolve, 'image/jpeg', 0.85));
            imgUrl2 = URL.createObjectURL(blob2);
        } else {
            currentPage2 = null;
        }

        placeholderText.classList.add('hidden');
        if (drawingToolbar) drawingToolbar.classList.remove('hidden');
        if (zoomControls) zoomControls.classList.remove('hidden');

        const gap = 60;
        const h1 = viewport1.height;
        const w1 = viewport1.width;

        sheet1Bounds = [[0, 0], [h1, w1]];
        let combinedBounds = sheet1Bounds;

        if (hasSecondPage && viewport2) {
            const h2 = viewport2.height;
            const w2 = viewport2.width;
            sheet2Bounds = [[0, w1 + gap], [h2, w1 + gap + w2]];
            combinedBounds = [[0, 0], [Math.max(h1, h2), w1 + gap + w2]];
        } else {
            sheet2Bounds = null;
        }

        currentMapBounds = combinedBounds;

        leafletMap = L.map('mapViewport', {
            crs: L.CRS.Simple,
            minZoom: -10,
            maxZoom: 7,
            zoomSnap: 0.05,
            zoomDelta: 0.2,
            wheelPxPerZoomLevel: 80,
            wheelDebounceTime: 0,
            zoomAnimation: false,
            fadeAnimation: false,
            markerZoomAnimation: false,
            attributionControl: false,
            zoomControl: false
        });

        leafletMap.createPane('issuesPane');
        leafletMap.getPane('issuesPane').style.zIndex = 650;

        sheet1BaseOverlay = L.imageOverlay(imgUrl1, sheet1Bounds, { pane: 'tilePane', zIndex: 100 }).addTo(leafletMap);

        if (hasSecondPage && imgUrl2 && sheet2Bounds) {
            sheet2BaseOverlay = L.imageOverlay(imgUrl2, sheet2Bounds, { pane: 'tilePane', zIndex: 100 }).addTo(leafletMap);
        }

        const totalWidth = combinedBounds[1][1];
        const totalHeight = combinedBounds[1][0];

        if (vectorDrawingOverlay) {
            vectorDrawingOverlay.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
            vectorDrawingOverlay.setAttribute('width', `${totalWidth}`);
            vectorDrawingOverlay.setAttribute('height', `${totalHeight}`);
            
            svgOverlayLayer = L.svgOverlay(vectorDrawingOverlay, combinedBounds, {
                pane: 'issuesPane',
                interactive: true
            }).addTo(leafletMap);
        }

        leafletMap.invalidateSize();
        leafletMap.fitBounds(combinedBounds, { padding: [10, 10], animate: false });
        initialFitZoom = leafletMap.getZoom();
        initialCenterPoint = leafletMap.getCenter();
        leafletMap.setMinZoom(initialFitZoom);

        // -------------------------------------------------------------
        // VELOCITY-AWARE MAP LISTENERS
        // -------------------------------------------------------------
        leafletMap.on('zoomstart', () => {
            activePatchBounds = null;
            if (activeRenderTask) {
                try { activeRenderTask.cancel(); } catch (e) {}
                activeRenderTask = null;
            }
        });

        // Trigger patches during movement if map floats beyond the 40% cushion
        leafletMap.on('move', () => {
            scheduleViewportPatch(true);
        });

        leafletMap.on('zoomend moveend', () => {
            scheduleViewportPatch(false);
        });

        leafletMap.on('click', (e) => {
            if (typeof handleMapClick === 'function') {
                const mapCoords = screenToMapCoords(e.originalEvent.clientX, e.clientY || e.originalEvent.clientY);
                if (mapCoords) handleMapClick(e.originalEvent, mapCoords);
            }
        });

        const zoomResetBtn = document.getElementById('zoomReset');
        const zoomInBtn = document.getElementById('zoomIn');
        const zoomOutBtn = document.getElementById('zoomOut');

        if (zoomResetBtn) zoomResetBtn.onclick = () => resetToInitialView();
        if (zoomInBtn) zoomInBtn.onclick = () => { leafletMap.zoomIn(0.5, { animate: false }); scheduleViewportPatch(); };
        if (zoomOutBtn) zoomOutBtn.onclick = () => { 
            const targetZoom = Math.max(initialFitZoom, leafletMap.getZoom() - 0.5);
            leafletMap.setZoom(targetZoom, { animate: false });
            scheduleViewportPatch(); 
        };

        const toolViewBtn = document.getElementById('tool-view');
        if (toolViewBtn) toolViewBtn.click();
        if (typeof fetchPins === 'function') fetchPins();

    } catch (err) {
        placeholderText.innerHTML = `<p class='text-red-400'>Error loading PDF map.</p>`;
        console.error('[MapViewer Debug] Exception loading PDF:', err);
    }
}

function screenToMapCoords(clientX, clientY) {
    if (!leafletMap || !currentMapBounds) return null;
    const containerPoint = leafletMap.mouseEventToContainerPoint({ clientX, clientY });
    const latLng = leafletMap.containerPointToLatLng(containerPoint);

    const inSheet1 = typeof sheet1Bounds !== 'undefined' && sheet1Bounds && L.latLngBounds(sheet1Bounds).contains(latLng);
    const inSheet2 = typeof sheet2Bounds !== 'undefined' && sheet2Bounds && L.latLngBounds(sheet2Bounds).contains(latLng);

    if (!inSheet1 && !inSheet2) return null;

    const totalWidth = currentMapBounds[1][1];
    const totalHeight = currentMapBounds[1][0];
    const xPercent = (latLng.lng / totalWidth) * 100;
    const yPercent = ((totalHeight - latLng.lat) / totalHeight) * 100;

    return {
        xPercent: Math.max(0, Math.min(100, xPercent)),
        yPercent: Math.max(0, Math.min(100, yPercent)),
        latLng
    };
}

function mapToScreenCoords(xPercent, yPercent) {
    if (!leafletMap || !currentMapBounds) return { x: 0, y: 0 };
    const totalWidth = currentMapBounds[1][1];
    const totalHeight = currentMapBounds[1][0];

    const lng = (xPercent / 100) * totalWidth;
    const lat = totalHeight - ((yPercent / 100) * totalHeight);

    const containerPoint = leafletMap.latLngToContainerPoint(L.latLng(lat, lng));
    return {
        x: containerPoint.x,
        y: containerPoint.y
    };
}