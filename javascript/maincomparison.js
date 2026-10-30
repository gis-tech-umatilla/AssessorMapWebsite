/**
 * maincomparison.js
 * Primary Controller: App state, Leaflet lifecycle, directory population,
 * stage orchestration, and stable high-DPI compositing (Zero-Flicker).
 */
(() => {
    'use strict';

    // Global State
    let isFullViewMode = true; // Full View ON by default
    let activeNewPageNum = 1;
    let activeOldPageNum = 1;

    let activeNewMapSource = null;
    let activeNewMapName = '';
    let activeOldMapSource = null;
    let activeOldMapName = '';

    let activeNewBlobUrl = null;
    let activeOldBlobUrl = null;
    let activeNewFileObj = null;
    let activeOldFileObj = null;

    let primaryMap = null;
    let calibOverlay = null;
    let svgOverlayLayer = null;
    let currentMapBounds = null;
    let initialCalibZoom = null;
    let lockedComparisonMinZoom = null; // Preserved across Full View / Cropped View toggles

    let pdfImageNew = null;
    let pdfImageOld = null;
    let dimNew = { w: 0, h: 0 };
    let dimOld = { w: 0, h: 0 };

    // DOM Elements
    const primaryMapEl = document.getElementById('leafletPrimaryMap');
    const vectorDrawingOverlay = document.getElementById('vectorDrawingOverlay');
    const placeholderText = document.getElementById('placeholderText');
    const zoomControls = document.getElementById('zoomControls');
    const customSelectBtn = document.getElementById('customSelectBtn');
    const customSelectMenu = document.getElementById('customSelectMenu');
    const areaConfirmModal = document.getElementById('areaConfirmModal');
    const toggleFullViewBtn = document.getElementById('toggleFullViewBtn');
    const fullViewStatusText = document.getElementById('fullViewStatusText');
    const mapViewport = document.getElementById('mapViewport');

    // Initialize Submodules
    window.CalibrationManager.init({
        vectorDrawingOverlay,
        calibMaskPath: document.getElementById('calibMaskPath'),
        calibPoly: document.getElementById('calibPoly'),
        calibNodesGroup: document.getElementById('calibNodesGroup'),
        snapIndicatorGroup: document.getElementById('snapIndicatorGroup'),
        cursorInstructionBadge: document.getElementById('cursorInstructionBadge'),
        cursorInstructionText: document.getElementById('cursorInstructionText'),
        insetPreviewCard: document.getElementById('insetPreviewCard'),
        insetPreviewCanvas: document.getElementById('insetPreviewCanvas'),
        insetZoomInBtn: document.getElementById('insetZoomInBtn'),
        insetZoomOutBtn: document.getElementById('insetZoomOutBtn')
    });

    window.ComparisonTools.init({
        primaryMapEl,
        swipeHandle: document.getElementById('swipeHandle'),
        swipeHandleLine: document.getElementById('swipeHandleLine'),
        swipeHandleButton: document.getElementById('swipeHandleButton'),
        sideBySideContainer: document.getElementById('sideBySideContainer'),
        modeBtnOpacity: document.getElementById('modeBtnOpacity'),
        modeBtnTransparency: document.getElementById('modeBtnTransparency'),
        modeBtnSwipe: document.getElementById('modeBtnSwipe'),
        modeBtnSideBySide: document.getElementById('modeBtnSideBySide'),
        panelOpacityControl: document.getElementById('panelOpacityControl'),
        sliderNewOpacity: document.getElementById('sliderNewOpacity'),
        sliderOldOpacity: document.getElementById('sliderOldOpacity'),
        valNewOpacity: document.getElementById('valNewOpacity'),
        valOldOpacity: document.getElementById('valOldOpacity'),
        panelTransparencyControl: document.getElementById('panelTransparencyControl'),
        sliderNewTransparency: document.getElementById('sliderNewTransparency'),
        sliderOldTransparency: document.getElementById('sliderOldTransparency'),
        valNewTransparency: document.getElementById('valNewTransparency'),
        valOldTransparency: document.getElementById('valOldTransparency')
    });

    // Bounded Zoom Wheel Filter
    if (mapViewport && !mapViewport._wheelFilterBound) {
        mapViewport._wheelFilterBound = true;
        mapViewport.addEventListener('wheel', (e) => {
            const activeMap = window.ComparisonTools.getActiveLeaflet();
            const bounds = window.ComparisonTools.getCompBounds() || currentMapBounds;
            if (!activeMap || !bounds) return;

            const containerPoint = activeMap.mouseEventToContainerPoint(e);
            const latLng = activeMap.containerPointToLatLng(containerPoint);
            const mapBounds = L.latLngBounds(bounds);

            if (!mapBounds.contains(latLng)) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, { capture: true, passive: false });
    }

    // ========================================================
    // AUTH & DROPDOWN INTEGRATION
    // ========================================================
    window.addEventListener('auth:success', (e) => {
        populateMapDropdown(e.detail.prefix);
    });

    if (customSelectBtn && customSelectMenu) {
        customSelectBtn.onclick = (e) => {
            e.stopPropagation();
            customSelectMenu.classList.toggle('hidden');
        };

        window.addEventListener('click', (e) => {
            if (!customSelectMenu.contains(e.target) && e.target !== customSelectBtn) {
                customSelectMenu.classList.add('hidden');
            }
        });
    }

    async function populateMapDropdown(currentUserPrefix) {
        if (!customSelectMenu) return;

        const { tree } = await window.MapService.getOrganizedDirectory(currentUserPrefix);

        customSelectMenu.innerHTML = '';
        if (tree.length === 0) {
            customSelectMenu.innerHTML = '<p class="text-xs text-slate-400 italic p-3">No maps available.</p>';
            return;
        }

        tree.forEach(creatorBranch => {
            const creatorCard = document.createElement('div');
            creatorCard.className = "bg-[#58646e] rounded-xl mb-2.5 border border-black/20 shadow-sm flex flex-col overflow-hidden";

            const creatorHex = window.getUserHexColor
                ? window.getUserHexColor(creatorBranch.creatorPrefix || creatorBranch.creatorName)
                : '#94a3b8';

            const creatorHeader = document.createElement('div');
            creatorHeader.className = "bg-[#36424a] px-3 py-2 flex items-center justify-between border-b border-black/20 select-none";
            creatorHeader.innerHTML = `<h3 class="text-xs font-extrabold tracking-wider" style="color: ${creatorHex}">${creatorBranch.creatorName}</h3>`;
            creatorCard.appendChild(creatorHeader);

            const creatorBody = document.createElement('div');
            creatorBody.className = "p-2 flex flex-col space-y-2";

            creatorBranch.groups.forEach(folder => {
                if (folder.maps.length === 0) return;

                const folderCard = document.createElement('div');
                folderCard.className = "flex flex-col bg-[#44535d] rounded-lg overflow-hidden border border-black/20 text-slate-100 shadow-sm";

                const folderHeader = document.createElement('div');
                folderHeader.className = "w-full flex justify-between items-center bg-[#36424a] px-2.5 py-1.5 text-xs font-bold text-slate-200 border-b border-black/20 select-none";
                folderHeader.innerHTML = `<span class="flex items-center space-x-1.5"><span>📂</span><span class="tracking-wide">${folder.name}</span></span>`;
                folderCard.appendChild(folderHeader);

                const mapsWrapper = document.createElement('div');
                mapsWrapper.className = "p-1.5 space-y-1 bg-[#44535d]";

                folder.maps.forEach(m => {
                    const baseName = m.map_name.replace(/\.(pdf|tif|tiff)$/i, '');
                    const itemBtn = document.createElement('div');
                    itemBtn.className = "w-full text-left px-2.5 py-1.5 bg-[#44535d] hover:bg-[#3d4b54] text-slate-200 hover:text-white rounded-md text-xs flex justify-between items-center cursor-pointer transition select-none shadow-xs";

                    const labelSpan = document.createElement('span');
                    labelSpan.className = "truncate pr-2 font-medium flex items-center space-x-1.5 pointer-events-none";
                    labelSpan.innerHTML = `<span class="opacity-70">📄</span><span>${baseName}</span>`;

                    const badgeWrapper = document.createElement('div');
                    badgeWrapper.className = "flex items-center space-x-1 shrink-0 pointer-events-none";

                    const sortedReviewers = window.MapService.sortReviewers(m.reviewed_by || []);
                    sortedReviewers.forEach(prefix => {
                        const badge = document.createElement('span');
                        const badgeColor = window.getUserHexColor ? window.getUserHexColor(prefix) : '#64748b';
                        const initials = window.MapService.getReviewerInitials(prefix);

                        badge.className = "w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center text-white border border-black/20 shadow-xs shrink-0";
                        badge.style.backgroundColor = badgeColor;
                        badge.innerText = initials;
                        badge.title = `Reviewed by ${prefix}`;
                        badgeWrapper.appendChild(badge);
                    });

                    itemBtn.appendChild(labelSpan);
                    itemBtn.appendChild(badgeWrapper);

                    itemBtn.onclick = async (e) => {
                        e.stopPropagation();
                        customSelectMenu.classList.add('hidden');

                        const labelElem = document.getElementById('customSelectLabel');
                        if (labelElem) {
                            labelElem.innerText = baseName;
                            labelElem.className = "truncate text-white font-bold";
                        }

                        applyNewMapChoiceLock('dropdown');
                        document.getElementById('uploadNewMap').value = '';
                        document.getElementById('lblNewMap').innerText = 'Upload';
                        if (activeNewBlobUrl) { URL.revokeObjectURL(activeNewBlobUrl); activeNewBlobUrl = null; }
                        activeNewFileObj = null;

                        loadCalibrationMap(m.file_url, baseName, 'New');
                    };

                    mapsWrapper.appendChild(itemBtn);
                });

                folderCard.appendChild(mapsWrapper);
                creatorBody.appendChild(folderCard);
            });

            creatorCard.appendChild(creatorBody);
            customSelectMenu.appendChild(creatorCard);
        });
    }

    function applyNewMapChoiceLock(mode) {
        const divider = document.getElementById('dividerOr');
        const containerSelect = document.getElementById('containerSelectNew');
        const containerUpload = document.getElementById('containerUploadNew');

        if (mode === 'dropdown') {
            divider?.classList.add('hidden');
            containerUpload?.classList.add('hidden');
        } else if (mode === 'upload') {
            divider?.classList.add('hidden');
            containerSelect?.classList.add('hidden');
        } else {
            divider?.classList.remove('hidden');
            containerSelect?.classList.remove('hidden');
            containerUpload?.classList.remove('hidden');
        }
    }

    // ========================================================
    // PRIMARY LEAFLET MAP LIFECYCLE
    // ========================================================
    function getOrCreatePrimaryMap() {
        if (!primaryMap) {
            primaryMap = L.map('leafletPrimaryMap', {
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

            primaryMap.createPane('issuesPane');
            primaryMap.getPane('issuesPane').style.zIndex = 650;

            primaryMap.on('move zoom', () => window.ComparisonTools.updateSwipePosition());
            primaryMap.on('zoom', () => window.CalibrationManager.drawQuadUI());

            primaryMap.on('mousemove', (e) => window.CalibrationManager.handleMouseMove(e));
            primaryMap.on('click', (e) => {
                window.CalibrationManager.handleClick(e, () => {
                    areaConfirmModal.classList.remove('hidden');
                });
            });

            primaryMap.getContainer().addEventListener('mouseleave', () => {
                window.CalibrationManager.handleMouseLeave();
            });
        }
        return primaryMap;
    }

    async function loadCalibrationMap(source, baseName, tabType) {
        window.CalibrationManager.setActiveTab(tabType);
        window.CalibrationManager.setCalibrating(true);

        if (tabType === 'New') {
            activeNewMapSource = source;
            activeNewMapName = baseName;
        } else {
            activeOldMapSource = source;
            activeOldMapName = baseName;
        }

        placeholderText.innerHTML = "<p class='text-[#1985a1] font-semibold animate-pulse'>Rendering High-DPI Map Sheet...</p>";
        placeholderText.classList.remove('hidden');
        placeholderText.style.display = 'block';

        try {
            const pageNum = (tabType === 'New') ? activeNewPageNum : activeOldPageNum;
            // AFTER (300 DPI with higher ceiling):
            const targetDpiScale = 200 / 72; // 4.1667
            const maxPixelCeiling = 11000;    // Allows standard 24" x 36" sheets to hit full 300 DPI without downscaling

            const res = window.SharedMapLoader.isTiffSource(source)
                ? await window.SharedMapLoader.loadTiff(source, maxPixelCeiling)
                : await window.SharedMapLoader.loadPdfPage(source, pageNum, targetDpiScale, maxPixelCeiling);

            if (tabType === 'New') {
                pdfImageNew = res.imgData;
                dimNew = { w: res.w, h: res.h };
                window.CalibrationManager.setNewMapImage(res.imgData, res.w, res.h);
                document.getElementById('instructionNewMap')?.classList.remove('hidden');
            } else {
                pdfImageOld = res.imgData;
                dimOld = { w: res.w, h: res.h };
                document.getElementById('instructionOldMap')?.classList.remove('hidden');
            }

            placeholderText.classList.add('hidden');
            placeholderText.style.display = 'none';

            primaryMapEl.classList.remove('hidden');
            primaryMapEl.style.display = 'block';
            primaryMapEl.classList.add('calib-mode');

            zoomControls.classList.remove('hidden');
            zoomControls.style.display = 'flex';

            const map = getOrCreatePrimaryMap();
            currentMapBounds = [[0, 0], [res.h, res.w]];

            if (calibOverlay) map.removeLayer(calibOverlay);
            calibOverlay = L.imageOverlay(res.imgUrl, currentMapBounds, { pane: 'tilePane', zIndex: 10 }).addTo(map);

            if (vectorDrawingOverlay) {
                vectorDrawingOverlay.setAttribute('viewBox', `0 0 ${res.w} ${res.h}`);
                vectorDrawingOverlay.classList.remove('hidden');

                if (svgOverlayLayer) map.removeLayer(svgOverlayLayer);
                svgOverlayLayer = L.svgOverlay(vectorDrawingOverlay, currentMapBounds, {
                    pane: 'issuesPane',
                    interactive: false
                }).addTo(map);
            }

            map.invalidateSize();
            map.fitBounds(currentMapBounds, { padding: [15, 15], animate: false });
            initialCalibZoom = map.getZoom();
            map.setMinZoom(initialCalibZoom);

            window.CalibrationManager.setPrimaryMap(map, currentMapBounds, initialCalibZoom);
            updateHeaderTitle(baseName);
            document.getElementById('resetSetupBtnCalib')?.classList.remove('hidden');

            window.CalibrationManager.clearTempPreview();
            window.CalibrationManager.drawQuadUI();

            // Background OSNAP vertex indexing
            window.MapWarpMath.extractPdfVectorVertices(source, pageNum, res.w, res.h).then(grid => {
                window.CalibrationManager.setSpatialGrid(tabType, grid);
            });

        } catch (err) {
            console.error("Error loading calibration map:", err);
            placeholderText.innerHTML = `<p class='text-red-400'>Error loading map file.</p>`;
        }
    }

    // Modal Confirmation Handlers
    document.getElementById('btnConfirmAreaNo')?.addEventListener('click', () => {
        areaConfirmModal.classList.add('hidden');
        window.CalibrationManager.clearPoints(window.CalibrationManager.getActiveTab());
        window.CalibrationManager.clearTempPreview();
        window.CalibrationManager.drawQuadUI();
    });

    document.getElementById('btnConfirmAreaYes')?.addEventListener('click', async () => {
        areaConfirmModal.classList.add('hidden');
        document.getElementById('redoDrawingsBtnCalib')?.classList.remove('hidden');

        const pointsNew = window.CalibrationManager.getPoints('New');
        const pointsOld = window.CalibrationManager.getPoints('Old');

        if (pointsNew.length === 4 && pointsOld.length < 4) {
            document.getElementById('phaseNewMap').classList.add('hidden');
            document.getElementById('phaseOldMap').classList.remove('hidden');
            window.CalibrationManager.renderNewMapInsetThumbnail();

            const oldSource = activeOldFileObj || activeOldBlobUrl;
            if (oldSource) {
                const baseName = getCleanFileName(oldSource);
                loadCalibrationMap(oldSource, baseName, 'Old');
            } else {
                if (calibOverlay && primaryMap) {
                    primaryMap.removeLayer(calibOverlay);
                    calibOverlay = null;
                }
                if (svgOverlayLayer && primaryMap) {
                    primaryMap.removeLayer(svgOverlayLayer);
                    svgOverlayLayer = null;
                }
                window.CalibrationManager.clearTempPreview();

                primaryMapEl.classList.add('hidden');
                primaryMapEl.style.display = 'none';

                zoomControls.classList.add('hidden');
                zoomControls.style.display = 'none';

                placeholderText.innerHTML = `
                    <p class="text-lg font-bold opacity-80 text-[#4c5c68]">New Map Selection Confirmed</p>
                    <p class="text-sm text-slate-500 font-medium">Please Upload an Old Map from the Left Sidebar to Continue</p>
                `;
                placeholderText.classList.remove('hidden');
                placeholderText.style.display = 'block';
            }
        } else {
            startComparisonMode();
        }
    });

    // ========================================================
    // COMPARISON PIPELINE & WARPING
    // ========================================================
    function startComparisonMode() {
        window.CalibrationManager.setCalibrating(false);

        primaryMapEl.classList.remove('calib-mode');
        primaryMapEl.classList.remove('hidden');
        primaryMapEl.style.display = 'block';

        zoomControls.classList.remove('hidden');
        zoomControls.style.display = 'flex';

        placeholderText.classList.add('hidden');
        placeholderText.style.display = 'none';

        document.getElementById('insetPreviewCard')?.classList.add('hidden');
        document.getElementById('sidebarStageCalib')?.classList.add('hidden');
        document.getElementById('sidebarStageOverlay')?.classList.remove('hidden');

        if (calibOverlay && primaryMap) {
            primaryMap.removeLayer(calibOverlay);
            calibOverlay = null;
        }
        if (svgOverlayLayer && primaryMap) {
            primaryMap.removeLayer(svgOverlayLayer);
            svgOverlayLayer = null;
        }

        if (vectorDrawingOverlay) {
            vectorDrawingOverlay.classList.add('hidden');
        }
        window.CalibrationManager.clearTempPreview();

        alignAndComposite();
    }

    function alignAndComposite() {
        const rawNew = window.CalibrationManager.getPoints('New');
        const rawOld = window.CalibrationManager.getPoints('Old');

        const orderedNew = window.MapWarpMath.orderQuadPoints(rawNew);
        const orderedOld = window.MapWarpMath.orderQuadPoints(rawOld);

        const pOldPx = orderedOld.map(p => ({ x: (p.x / 100) * dimOld.w, y: (p.y / 100) * dimOld.h }));
        const pNewPx = orderedNew.map(p => ({ x: (p.x / 100) * dimNew.w, y: (p.y / 100) * dimNew.h }));

        const transformResult = window.MapWarpMath.computeSmartTransform(pOldPx, pNewPx);
        const M_old_to_new = transformResult.matrix;

        let cropW, cropH;
        let offsetX = 0;
        let offsetY = 0;

        const cOld = document.createElement('canvas');
        const cNew = document.createElement('canvas');
        const ctxOld = cOld.getContext('2d');
        const ctxNew = cNew.getContext('2d');

        if (isFullViewMode) {
            cropW = dimOld.w;
            cropH = dimOld.h;
            cOld.width = cropW;  cOld.height = cropH;
            cNew.width = cropW;  cNew.height = cropH;

            ctxOld.putImageData(pdfImageOld, 0, 0);

            window.MapWarpMath.warpImageMatrix(
                ctxNew, pdfImageNew, dimNew.w, dimNew.h,
                M_old_to_new, cropW, cropH, 0, 0
            );
        } else {
            const xs = pOldPx.map(p => p.x);
            const ys = pOldPx.map(p => p.y);
            offsetX = Math.floor(Math.min(...xs));
            offsetY = Math.floor(Math.min(...ys));
            cropW = Math.ceil(Math.max(...xs)) - offsetX;
            cropH = Math.ceil(Math.max(...ys)) - offsetY;

            cOld.width = cropW;  cOld.height = cropH;
            cNew.width = cropW;  cNew.height = cropH;

            ctxOld.putImageData(pdfImageOld, -offsetX, -offsetY);

            window.MapWarpMath.warpImageMatrix(
                ctxNew, pdfImageNew, dimNew.w, dimNew.h,
                M_old_to_new, cropW, cropH, offsetX, offsetY
            );
        }

        cOld.toBlob(blobOld => {
            cNew.toBlob(blobNew => {
                const urlOld = URL.createObjectURL(blobOld);
                const urlNew = URL.createObjectURL(blobNew);
                const compBounds = [[0, 0], [cropH, cropW]];

                const map = getOrCreatePrimaryMap();
                map.invalidateSize();

                // Lock minZoom strictly ONCE on initial Full View fit and never alter it on toggle
                if (lockedComparisonMinZoom === null) {
                    map.fitBounds(compBounds, { padding: [10, 10], animate: false });
                    lockedComparisonMinZoom = map.getZoom();
                    map.setMinZoom(lockedComparisonMinZoom);
                } else {
                    map.fitBounds(compBounds, { padding: [10, 10], animate: false });
                }

                window.ComparisonTools.startComparison({
                    urlOld,
                    urlNew,
                    bounds: compBounds,
                    map,
                    initialZoom: lockedComparisonMinZoom
                });
            }, 'image/png');
        }, 'image/png');
    }

    // Toggle Full View Button
    if (toggleFullViewBtn) {
        toggleFullViewBtn.onclick = () => {
            isFullViewMode = !isFullViewMode;
            if (isFullViewMode) {
                fullViewStatusText.innerText = 'ON';
                fullViewStatusText.className = 'text-[#8AFF47] font-bold uppercase';
                toggleFullViewBtn.className = 'text-[10px] font-bold px-2 py-1 rounded bg-[#1985a1] text-white border border-[#8AFF47]/50 transition cursor-pointer flex items-center gap-1 shrink-0 shadow-md';
            } else {
                fullViewStatusText.innerText = 'OFF';
                fullViewStatusText.className = 'text-slate-400 uppercase';
                toggleFullViewBtn.className = 'text-[10px] font-bold px-2 py-1 rounded bg-black/30 hover:bg-black/50 text-slate-200 border border-white/10 transition cursor-pointer flex items-center gap-1 shrink-0';
            }
            if (window.CalibrationManager.getPoints('Old').length === 4 && window.CalibrationManager.getPoints('New').length === 4) {
                alignAndComposite();
            }
        };
    }

    // Zoom Controls
    const zReset = document.getElementById('zoomReset');
    const zIn = document.getElementById('zoomIn');
    const zOut = document.getElementById('zoomOut');

    if (zReset) {
        zReset.onclick = () => {
            const map = window.ComparisonTools.getActiveLeaflet();
            const b = window.ComparisonTools.getCompBounds() || currentMapBounds;
            if (map && b) map.fitBounds(b, { padding: [10, 10], animate: false });
        };
    }
    if (zIn) zIn.onclick = () => window.ComparisonTools.getActiveLeaflet()?.zoomIn(0.5);
    if (zOut) zOut.onclick = () => window.ComparisonTools.getActiveLeaflet()?.zoomOut(0.5);

    // Upload Handlers
    document.getElementById('uploadNewMap')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        applyNewMapChoiceLock('upload');
        const baseName = getCleanFileName(file);
        activeNewFileObj = file;
        loadCalibrationMap(file, baseName, 'New');
    });

    document.getElementById('uploadOldMap')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const baseName = getCleanFileName(file);
        activeOldFileObj = file;
        loadCalibrationMap(file, baseName, 'Old');
    });

    // Reset & Restart Handlers
    const handleRestartSetup = () => window.location.reload();
    document.getElementById('resetSetupBtnCalib')?.addEventListener('click', handleRestartSetup);
    document.getElementById('resetSetupBtnOverlay')?.addEventListener('click', handleRestartSetup);

    function handleRestartDrawing() {
        window.CalibrationManager.clearPoints('New');
        window.CalibrationManager.clearPoints('Old');
        window.CalibrationManager.setActiveTab('New');
        window.CalibrationManager.setCalibrating(true);
        lockedComparisonMinZoom = null;

        window.ComparisonTools.destroy();

        if (calibOverlay && primaryMap) {
            primaryMap.removeLayer(calibOverlay);
            calibOverlay = null;
        }
        if (svgOverlayLayer && primaryMap) {
            primaryMap.removeLayer(svgOverlayLayer);
            svgOverlayLayer = null;
        }

        document.getElementById('sidebarStageOverlay')?.classList.add('hidden');
        document.getElementById('sidebarStageCalib')?.classList.remove('hidden');
        document.getElementById('phaseOldMap')?.classList.add('hidden');
        document.getElementById('phaseNewMap')?.classList.remove('hidden');
        document.getElementById('instructionOldMap')?.classList.add('hidden');
        document.getElementById('instructionNewMap')?.classList.remove('hidden');
        document.getElementById('redoDrawingsBtnCalib')?.classList.add('hidden');

        primaryMapEl.classList.remove('hidden');
        primaryMapEl.style.display = 'block';

        const source = activeNewMapSource || activeNewFileObj || activeNewBlobUrl;
        const name = activeNewMapName || document.getElementById('customSelectLabel')?.innerText || '';

        if (source) {
            loadCalibrationMap(source, name, 'New');
        } else {
            window.CalibrationManager.clearTempPreview();
            window.CalibrationManager.drawQuadUI();
        }
    }

    document.getElementById('redoDrawingsBtnCalib')?.addEventListener('click', handleRestartDrawing);
    document.getElementById('redoDrawingsBtn')?.addEventListener('click', handleRestartDrawing);

    function getCleanFileName(file) {
        if (!file) return 'Upload';
        return file.name.replace(/\.[^/.]+$/, "");
    }

    function updateHeaderTitle(mapName) {
        const headerElem = document.getElementById('headerMapName');
        if (headerElem) headerElem.innerText = mapName ? `- ${mapName}` : '';
    }

})();