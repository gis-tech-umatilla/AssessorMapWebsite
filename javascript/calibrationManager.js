/**
 * calibrationManager.js
 * Stage 1: Point selection, SVG polygon/mask rendering, OSNAP indicator,
 * floating instruction badges, and inset preview card generation.
 */
(() => {
    'use strict';

    // Internal State
    let pointsNew = [];
    let pointsOld = [];
    let currentActiveTab = 'New';
    let isCalibrating = false;

    let primaryMap = null;
    let currentMapBounds = null;
    let initialCalibZoom = null;

    let spatialGridNew = null;
    let spatialGridOld = null;
    let activeSnappedPoint = null;
    let lastKnownMousePct = null;
    let lastClickTime = 0;

    // Inset Card State
    let pdfImageNew = null;
    let dimNew = { w: 0, h: 0 };
    let insetCurrentScale = 1.0;

    // DOM Elements
    let elements = {};

    function init(domElements) {
        elements = domElements;

        if (elements.insetZoomInBtn) {
            elements.insetZoomInBtn.onclick = (e) => {
                e.preventDefault();
                if (insetCurrentScale < 4.0) {
                    insetCurrentScale += 0.5;
                    updateInsetZoomTransform();
                }
            };
        }

        if (elements.insetZoomOutBtn) {
            elements.insetZoomOutBtn.onclick = (e) => {
                e.preventDefault();
                if (insetCurrentScale > 1.0) {
                    insetCurrentScale = Math.max(1.0, insetCurrentScale - 0.5);
                    updateInsetZoomTransform();
                }
            };
        }
    }

    function setPrimaryMap(map, bounds, initialZoom) {
        primaryMap = map;
        currentMapBounds = bounds;
        initialCalibZoom = initialZoom;
    }

    function setCalibrating(flag) {
        isCalibrating = flag;
        if (!flag && elements.cursorInstructionBadge) {
            elements.cursorInstructionBadge.classList.add('hidden');
        }
    }

    function setActiveTab(tab) {
        currentActiveTab = tab;
    }

    function getActiveTab() {
        return currentActiveTab;
    }

    function setNewMapImage(imgData, w, h) {
        pdfImageNew = imgData;
        dimNew = { w, h };
    }

    function setSpatialGrid(tab, grid) {
        if (tab === 'New') spatialGridNew = grid;
        else spatialGridOld = grid;
    }

    function getPoints(tab) {
        return (tab === 'New') ? pointsNew : pointsOld;
    }

    function setPoints(tab, pts) {
        if (tab === 'New') pointsNew = pts;
        else pointsOld = pts;
    }

    function clearPoints(tab) {
        if (!tab || tab === 'New') pointsNew = [];
        if (!tab || tab === 'Old') pointsOld = [];
    }

    // 50% Damped Proportional SVG Polygon & Snap Badge Drawing
    function drawQuadUI(liveMousePos = null) {
        const points = (currentActiveTab === 'New') ? pointsNew : pointsOld;
        if (!currentMapBounds || !elements.calibNodesGroup || !primaryMap) return;

        const canvasHeight = currentMapBounds[1][0];
        const canvasWidth = currentMapBounds[1][1];
        const activeColor = (currentActiveTab === 'New') ? '#8AFF47' : '#FFF547';

        const baseZoom = initialCalibZoom != null ? initialCalibZoom : primaryMap.getZoom();
        const zoomScale = Math.max(0.1, primaryMap.getZoomScale(primaryMap.getZoom(), baseZoom));
        const dampFactor = 1 / Math.sqrt(zoomScale);

        const strokeWidth = Math.max(3, Math.round((canvasWidth / 350) * dampFactor));
        const nodeRadius = Math.round(strokeWidth * 2.2);

        // 1. Draw SVG Corner Nodes
        elements.calibNodesGroup.innerHTML = '';
        points.forEach((pt) => {
            const px = (pt.x / 100) * canvasWidth;
            const py = (pt.y / 100) * canvasHeight;

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', px);
            circle.setAttribute('cy', py);
            circle.setAttribute('r', nodeRadius);
            circle.setAttribute('fill', activeColor);
            circle.setAttribute('stroke', 'none');
            elements.calibNodesGroup.appendChild(circle);
        });

        // 2. Draw Active OSNAP Diamond Badge
        if (elements.snapIndicatorGroup) {
            elements.snapIndicatorGroup.innerHTML = '';
            if (activeSnappedPoint && points.length < 4) {
                const spx = (activeSnappedPoint.xPct / 100) * canvasWidth;
                const spy = (activeSnappedPoint.yPct / 100) * canvasHeight;
                const snapSize = Math.max(8, Math.round(nodeRadius * 1.5));

                const diamond = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                diamond.setAttribute('points', `${spx},${spy - snapSize} ${spx + snapSize},${spy} ${spx},${spy + snapSize} ${spx - snapSize},${spy}`);
                diamond.setAttribute('fill', 'rgba(56, 189, 248, 0.35)');
                diamond.setAttribute('stroke', '#38bdf8');
                diamond.setAttribute('stroke-width', Math.max(2, Math.round(strokeWidth * 0.6)));
                elements.snapIndicatorGroup.appendChild(diamond);
            }
        }

        // 3. Build live active polygon and cutout mask (bounded to map dimensions)
        const posToUse = liveMousePos || lastKnownMousePct;
        let activePoints = (posToUse && points.length > 0 && points.length < 4)
            ? [...points, posToUse]
            : points;

        // Prevent bowtie/hourglass polygons when all 4 corners are placed
        if (activePoints.length === 4 && window.MapWarpMath && window.MapWarpMath.orderQuadPoints) {
            activePoints = window.MapWarpMath.orderQuadPoints(activePoints);
        }

        let ptsStr = '';
        let pathCmds = '';

        activePoints.forEach((pt, i) => {
            const px = Math.max(0, Math.min(canvasWidth, (pt.x / 100) * canvasWidth));
            const py = Math.max(0, Math.min(canvasHeight, (pt.y / 100) * canvasHeight));
            ptsStr += `${px},${py} `;
            pathCmds += (i === 0 ? `M ${px} ${py} ` : `L ${px} ${py} `);
        });

        if (activePoints.length > 0) pathCmds += 'Z';

        if (activePoints.length >= 3) {
            const outerRect = `M 0 0 H ${canvasWidth} V ${canvasHeight} H 0 Z `;
            elements.calibMaskPath.setAttribute('d', outerRect + pathCmds);
        } else {
            elements.calibMaskPath.setAttribute('d', '');
        }

        const dashSize = Math.round(strokeWidth * 1.5);
        elements.calibPoly.setAttribute('points', ptsStr.trim());
        elements.calibPoly.setAttribute('stroke', '#8c8b8b');
        elements.calibPoly.setAttribute('stroke-width', strokeWidth);
        elements.calibPoly.setAttribute('stroke-dasharray', `${dashSize},${dashSize}`);
    }

    function clearTempPreview() {
        lastKnownMousePct = null;
        activeSnappedPoint = null;
        if (elements.cursorInstructionBadge) elements.cursorInstructionBadge.classList.add('hidden');
        if (elements.calibMaskPath) elements.calibMaskPath.setAttribute('d', '');
        if (elements.calibPoly) elements.calibPoly.setAttribute('points', '');
        if (elements.calibNodesGroup) elements.calibNodesGroup.innerHTML = '';
        if (elements.snapIndicatorGroup) elements.snapIndicatorGroup.innerHTML = '';
    }

    // Cursor-Anchored Instruction Tooltip
    function updateCursorInstructionBadge(e, isSnapped = false) {
        if (!elements.cursorInstructionBadge || !isCalibrating) return;

        const points = (currentActiveTab === 'New') ? pointsNew : pointsOld;
        if (points.length >= 4) {
            elements.cursorInstructionBadge.classList.add('hidden');
            return;
        }

        const cornerNumber = points.length + 1;
        let text = "";

        if (isSnapped) {
            text = `🎯 Snap: Corner ${cornerNumber} (Click to place)`;
            elements.cursorInstructionBadge.className = "fixed pointer-events-none z-[9999] px-2.5 py-1 rounded-md text-xs font-bold shadow-2xl border border-[#38bdf8] bg-slate-900/95 text-[#38bdf8] backdrop-blur-md select-none";
        } else {
            if (cornerNumber === 1) text = "Click to set Corner 1";
            else if (cornerNumber === 2) text = "Click to set Corner 2";
            else if (cornerNumber === 3) text = "Click to set Corner 3";
            else if (cornerNumber === 4) text = "Click to set Corner 4 to close box";

            elements.cursorInstructionBadge.className = "fixed pointer-events-none z-[9999] px-2.5 py-1 rounded-md text-xs font-semibold shadow-2xl border border-slate-700 bg-slate-900/90 text-white backdrop-blur-sm select-none";
        }

        elements.cursorInstructionText.innerText = text;
        elements.cursorInstructionBadge.style.left = `${e.clientX + 16}px`;
        elements.cursorInstructionBadge.style.top = `${e.clientY + 16}px`;
        elements.cursorInstructionBadge.classList.remove('hidden');
    }

    // Primary Map Calibration Mouse Handlers
    function handleMouseMove(e) {
        if (!isCalibrating || !currentMapBounds) return;
        const points = (currentActiveTab === 'New') ? pointsNew : pointsOld;
        if (points.length >= 4) return;

        const totalWidth = currentMapBounds[1][1];
        const totalHeight = currentMapBounds[1][0];

        const mousePx = e.latlng.lng;
        const mousePy = totalHeight - e.latlng.lat;

        const activeGrid = (currentActiveTab === 'New') ? spatialGridNew : spatialGridOld;
        let isSnapped = false;
        activeSnappedPoint = null;

        if (activeGrid && primaryMap) {
            const baseZoom = initialCalibZoom != null ? initialCalibZoom : primaryMap.getZoom();
            const currentScale = primaryMap.getZoomScale(primaryMap.getZoom(), baseZoom);
            const mapRadiusTolerance = 16 / Math.max(0.1, currentScale);

            const snapMatch = activeGrid.findNearest(mousePx, mousePy, mapRadiusTolerance);
            if (snapMatch) {
                isSnapped = true;
                activeSnappedPoint = snapMatch;
            }
        }

        let targetPct;
        if (activeSnappedPoint) {
            targetPct = { x: activeSnappedPoint.xPct, y: activeSnappedPoint.yPct };
        } else {
            const xPct = Math.max(0, Math.min(100, (mousePx / totalWidth) * 100));
            const yPct = Math.max(0, Math.min(100, (mousePy / totalHeight) * 100));
            targetPct = { x: xPct, y: yPct };
        }

        lastKnownMousePct = targetPct;
        drawQuadUI(lastKnownMousePct);
        updateCursorInstructionBadge(e.originalEvent, isSnapped);
    }

    function handleClick(e, onComplete) {
        if (!isCalibrating || !currentMapBounds) return;
        const points = (currentActiveTab === 'New') ? pointsNew : pointsOld;
        if (points.length >= 4) return;

        const now = Date.now();
        if (now - lastClickTime < 150) return;
        lastClickTime = now;

        const totalWidth = currentMapBounds[1][1];
        const totalHeight = currentMapBounds[1][0];

        let pointToCommit;
        if (activeSnappedPoint) {
            pointToCommit = { x: activeSnappedPoint.xPct, y: activeSnappedPoint.yPct };
        } else {
            const xPct = Math.max(0, Math.min(100, (e.latlng.lng / totalWidth) * 100));
            const yPct = Math.max(0, Math.min(100, ((totalHeight - e.latlng.lat) / totalHeight) * 100));
            pointToCommit = { x: xPct, y: yPct };
        }

        points.push(pointToCommit);
        activeSnappedPoint = null;
        drawQuadUI();
        updateCursorInstructionBadge(e.originalEvent, false);

        if (points.length === 4) {
            if (elements.cursorInstructionBadge) elements.cursorInstructionBadge.classList.add('hidden');
            if (onComplete) onComplete();
        }
    }

    function handleMouseLeave() {
        if (elements.cursorInstructionBadge) elements.cursorInstructionBadge.classList.add('hidden');
    }

    // Inset Thumbnail Generation
    function updateInsetZoomTransform() {
        renderNewMapInsetThumbnail();
        if (elements.insetZoomOutBtn) {
            elements.insetZoomOutBtn.disabled = insetCurrentScale <= 1.001;
            elements.insetZoomOutBtn.className = (insetCurrentScale <= 1.001)
                ? "px-1.5 py-0.5 bg-slate-700 text-slate-400 text-[10px] font-bold rounded opacity-50 cursor-not-allowed"
                : "px-1.5 py-0.5 bg-[#1985a1] hover:bg-[#1985a1]/80 text-white text-[10px] font-bold rounded cursor-pointer transition";
        }
        if (elements.insetZoomInBtn) {
            elements.insetZoomInBtn.disabled = insetCurrentScale >= 4.0;
            elements.insetZoomInBtn.className = (insetCurrentScale >= 4.0)
                ? "px-1.5 py-0.5 bg-slate-700 text-slate-400 text-[10px] font-bold rounded opacity-50 cursor-not-allowed"
                : "px-1.5 py-0.5 bg-[#1985a1] hover:bg-[#1985a1]/80 text-white text-[10px] font-bold rounded cursor-pointer transition";
        }
    }

    function renderNewMapInsetThumbnail() {
        if (!pdfImageNew || pointsNew.length !== 4 || !elements.insetPreviewCanvas) return;

        elements.insetPreviewCanvas.style.transform = 'none';
        const sortedNew = window.MapWarpMath.sortQuadPoints(pointsNew);
        const pNewPx = sortedNew.map(p => ({ x: (p.x / 100) * dimNew.w, y: (p.y / 100) * dimNew.h }));

        const xs = pNewPx.map(p => p.x); const ys = pNewPx.map(p => p.y);
        const minX = Math.min(...xs); const maxX = Math.max(...xs);
        const minY = Math.min(...ys); const maxY = Math.max(...ys);

        const viewWidth = dimNew.w / insetCurrentScale;
        const viewHeight = dimNew.h / insetCurrentScale;

        const quadCenterX = (minX + maxX) / 2;
        const quadCenterY = (minY + maxY) / 2;

        let cropX = Math.max(0, Math.min(dimNew.w - viewWidth, quadCenterX - (viewWidth / 2)));
        let cropY = Math.max(0, Math.min(dimNew.h - viewHeight, quadCenterY - (viewHeight / 2)));

        elements.insetPreviewCanvas.width = viewWidth;
        elements.insetPreviewCanvas.height = viewHeight;

        const ctx = elements.insetPreviewCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.putImageData(pdfImageNew, -cropX, -cropY);

        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
        ctx.beginPath();
        ctx.rect(0, 0, viewWidth, viewHeight);
        pNewPx.forEach((pt, i) => {
            const lx = pt.x - cropX; const ly = pt.y - cropY;
            if (i === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
        });
        ctx.closePath();
        ctx.fill('evenodd');

        ctx.strokeStyle = '#8c8b8b';
        ctx.lineWidth = Math.max(4, Math.round(viewWidth / 180));
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        pNewPx.forEach((pt, i) => {
            const lx = pt.x - cropX; const ly = pt.y - cropY;
            if (i === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        elements.insetPreviewCanvas.style.aspectRatio = `${viewWidth} / ${viewHeight}`;
        elements.insetPreviewCard?.classList.remove('hidden');
    }

    // Public API
    window.CalibrationManager = {
        init,
        setPrimaryMap,
        setCalibrating,
        setActiveTab,
        getActiveTab,
        setNewMapImage,
        setSpatialGrid,
        getPoints,
        setPoints,
        clearPoints,
        drawQuadUI,
        clearTempPreview,
        handleMouseMove,
        handleClick,
        handleMouseLeave,
        renderNewMapInsetThumbnail
    };
})();