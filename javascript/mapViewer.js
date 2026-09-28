console.log('[MapViewer Debug] mapViewer.js loaded with L.svgOverlay engine.');

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
if (typeof window.sheet1Bounds === 'undefined') window.sheet1Bounds = null;
if (typeof window.sheet2Bounds === 'undefined') window.sheet2Bounds = null;

// DOM References
var mapViewport = document.getElementById('mapViewport');
var placeholderText = document.getElementById('placeholderText');
var zoomControls = document.getElementById('zoomControls');
var drawingToolbar = document.getElementById('drawingToolbar');

var vectorDrawingOverlay = document.getElementById('vectorDrawingOverlay');
var dotsContainer = document.getElementById('dotsContainer');

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
            console.log('[MapViewer Debug] Wheel zoom blocked: Cursor outside map bounds.');
        }
    }, { capture: true, passive: false });
}

function adjustPinScaling() {
    // Intentionally no-op: SVG overlay handles scaling natively
}

function hidePatchOverlay() {
    if (activeRenderTask) {
        try { activeRenderTask.cancel(); } catch (e) {}
        activeRenderTask = null;
    }

    if (patchOverlay && leafletMap) {
        console.log('[MapViewer Debug] Removing viewport patch overlay layer.');
        leafletMap.removeLayer(patchOverlay);
        patchOverlay = null;
    }
    activePatchBounds = null;
    lastPatchZoom = null;
}

function scheduleViewportPatch() {
    if (!leafletMap || !currentPage1 || !sheet1Bounds) return;

    const currentZoom = leafletMap.getZoom();

    if (currentZoom <= initialFitZoom + 0.15) {
        hidePatchOverlay();
        clearTimeout(patchDebounceTimer);
        return;
    }

    if (patchOverlay && activePatchBounds && leafletMap) {
        const visibleBounds = leafletMap.getBounds();
        const zoomDiff = Math.abs(currentZoom - (lastPatchZoom || 0));

        if (zoomDiff < 0.12 && activePatchBounds.contains(visibleBounds)) {
            return;
        }
    }

    clearTimeout(patchDebounceTimer);
    patchDebounceTimer = setTimeout(async () => {
        const taskId = ++activePatchTaskId;

        const visibleBounds = leafletMap.getBounds();
        let south = visibleBounds.getSouth();
        let north = visibleBounds.getNorth();
        let west = visibleBounds.getWest();
        let east = visibleBounds.getEast();

        const h1 = sheet1Bounds[1][0];
        const w1 = sheet1Bounds[1][1];

        south = Math.max(0, Math.min(h1, south));
        north = Math.max(0, Math.min(h1, north));
        west = Math.max(0, Math.min(w1, west));
        east = Math.max(0, Math.min(w1, east));

        if (east <= west || north <= south) {
            hidePatchOverlay();
            return;
        }

        const padLng = (east - west) * 0.60;
        const padLat = (north - south) * 0.60;

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
        const cropScreenPixelH = Math.abs(swPoint.y - nePoint.y);

        const dpr = window.devicePixelRatio || 1;
        const qualityMultiplier = 1.5;
        
        const scaleX = (cropScreenPixelW / cropPdfW) * dpr * qualityMultiplier;
        const scaleY = (cropScreenPixelH / cropPdfH) * dpr * qualityMultiplier;
        let targetScale = Math.max(scaleX, scaleY);

        targetScale = Math.max(2.5, targetScale);

        let patchPixelW = Math.round(cropPdfW * targetScale);
        let patchPixelH = Math.round(cropPdfH * targetScale);

        const MAX_DIM = 4096;
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

        if (activeRenderTask) {
            try { activeRenderTask.cancel(); } catch (e) {}
            activeRenderTask = null;
        }

        try {
            activeRenderTask = currentPage1.render({ 
                canvasContext: ctx, 
                viewport: renderViewport, 
                transform: transformMatrix 
            });

            await activeRenderTask.promise;
            activeRenderTask = null;

            if (taskId === activePatchTaskId) {
                const patchBounds = [[cropSouth, cropWest], [cropNorth, cropEast]];
                const patchDataUrl = patchCanvas.toDataURL('image/png');

                activePatchBounds = L.latLngBounds([cropSouth, cropWest], [cropNorth, cropEast]);
                lastPatchZoom = currentZoom;

                if (patchOverlay && leafletMap) {
                    console.log(`[MapViewer Debug] Task #${taskId} seamlessly updating patch overlay bounds.`);
                    patchOverlay.setBounds(patchBounds);
                    patchOverlay.setUrl(patchDataUrl);
                } else {
                    console.log(`[MapViewer Debug] Task #${taskId} creating patch image overlay layer at pane 'tilePane' (zIndex 200).`);
                    patchOverlay = L.imageOverlay(patchDataUrl, patchBounds, { pane: 'tilePane', zIndex: 200 }).addTo(leafletMap);
                }
            }
        } catch (err) {}
    }, 200);
}

function resetToInitialView() {
    hidePatchOverlay();
    if (!leafletMap || !initialCenterPoint) return;

    leafletMap.setView(initialCenterPoint, initialFitZoom, { animate: false });
    
    scheduleViewportPatch();
    if (typeof hideIssuePopover === 'function') hideIssuePopover();
    if (typeof renderUI === 'function') renderUI();
}

async function loadActiveMap(mapObj) {
    console.log('[MapViewer Debug] loadActiveMap invoked with object:', mapObj);

    if (!mapObj || !mapObj.file_url) return;

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
        const pdf = await pdfjsLib.getDocument(mapObj.file_url).promise;
        const hasSecondPage = pdf.numPages >= 2;

        currentPage1 = await pdf.getPage(1);
        const viewport1 = currentPage1.getViewport({ scale: 2.5 });

        const canvas1 = document.createElement('canvas');
        canvas1.width = viewport1.width;
        canvas1.height = viewport1.height;
        const context1 = canvas1.getContext('2d');

        await currentPage1.render({ canvasContext: context1, viewport: viewport1 }).promise;
        const imgUrl1 = canvas1.toDataURL('image/png');

        let imgUrl2 = null;
        let viewport2 = null;
        if (hasSecondPage) {
            currentPage2 = await pdf.getPage(2);
            viewport2 = currentPage2.getViewport({ scale: 2.5 });

            const canvas2 = document.createElement('canvas');
            canvas2.width = viewport2.width;
            canvas2.height = viewport2.height;
            const context2 = canvas2.getContext('2d');

            await currentPage2.render({ canvasContext: context2, viewport: viewport2 }).promise;
            imgUrl2 = canvas2.toDataURL('image/png');
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

        // CREATE A DEDICATED HIGH-LEVEL PANE FOR SVG ISSUES
        leafletMap.createPane('issuesPane');
        leafletMap.getPane('issuesPane').style.zIndex = 650; // Sits above overlayPane (400) and tilePane (200)

        sheet1BaseOverlay = L.imageOverlay(imgUrl1, sheet1Bounds, { pane: 'tilePane', zIndex: 100 }).addTo(leafletMap);

        if (hasSecondPage && imgUrl2 && viewport2) {
            const boundsSheet2 = [[0, w1 + gap], [viewport2.height, w1 + gap + viewport2.width]];
            sheet2BaseOverlay = L.imageOverlay(imgUrl2, boundsSheet2, { pane: 'tilePane', zIndex: 100 }).addTo(leafletMap);
        }

        // MOUNT SVG OVERLAY DIRECTLY TO LEAFLET 'issuesPane' (zIndex 650)
        const totalWidth = combinedBounds[1][1];
        const totalHeight = combinedBounds[1][0];

        if (vectorDrawingOverlay) {
            vectorDrawingOverlay.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
            vectorDrawingOverlay.setAttribute('width', `${totalWidth}`);
            vectorDrawingOverlay.setAttribute('height', `${totalHeight}`);
            
            console.log(`[MapViewer Debug] Attaching L.svgOverlay to issuesPane (Bounds: ${totalWidth}x${totalHeight})...`);

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

        leafletMap.on('zoomstart movestart', () => {
            if (activeRenderTask) {
                try { activeRenderTask.cancel(); } catch (err) {}
                activeRenderTask = null;
            }
        });

        leafletMap.on('zoomstart', () => {
            activePatchBounds = null;
        });

        leafletMap.on('zoomend moveend', () => {
            scheduleViewportPatch();
            if (typeof hideIssuePopover === 'function') hideIssuePopover();
            if (typeof renderUI === 'function') renderUI();
        });

        leafletMap.on('click', (e) => {
            console.log('[MapViewer Debug] Leaflet map clicked at LatLng:', e.latlng);
            if (typeof handleMapClick === 'function') {
                const mapCoords = screenToMapCoords(e.originalEvent.clientX, e.clientY || e.originalEvent.clientY);
                if (mapCoords) {
                    handleMapClick(e.originalEvent, mapCoords);
                }
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
        placeholderText.innerHTML = `<p class='text-red-400'>Error loading resource asset frame into Leaflet.</p>`;
        console.error('[MapViewer Debug] Fatal exception encountered during Leaflet map load:', err);
    }
}

function screenToMapCoords(clientX, clientY) {
    if (!leafletMap || !currentMapBounds) return null;
    const containerPoint = leafletMap.mouseEventToContainerPoint({ clientX, clientY });
    const latLng = leafletMap.containerPointToLatLng(containerPoint);

    // Validate that click is inside Sheet 1 or Sheet 2 bounds
    const inSheet1 = typeof sheet1Bounds !== 'undefined' && sheet1Bounds && L.latLngBounds(sheet1Bounds).contains(latLng);
    const inSheet2 = typeof sheet2Bounds !== 'undefined' && sheet2Bounds && L.latLngBounds(sheet2Bounds).contains(latLng);

    if (!inSheet1 && !inSheet2) {
        return null; // Click is in the outer gray background
    }

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