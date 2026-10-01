var vectorDrawingOverlay = document.getElementById('vectorDrawingOverlay');
var dotsContainer = document.getElementById('dotsContainer');
var toolHint = document.getElementById('toolHint');
var drawingToolbar = document.getElementById('drawingToolbar');

if (typeof window.activeTool === 'undefined') window.activeTool = 'view';
if (typeof window.activeSize === 'undefined') window.activeSize = 'medium';
if (typeof window.firstPointClicked === 'undefined') window.firstPointClicked = null;
if (typeof window.shapePoints === 'undefined') window.shapePoints = [];
if (typeof window.lastClickTime === 'undefined') window.lastClickTime = 0;

// PREVENT TOOLBAR CLICKS FROM TRIGGERING MAP ACTIONS
if (drawingToolbar) {
    ['click', 'mousedown', 'mouseup', 'dblclick', 'pointerdown'].forEach(evt => {
        drawingToolbar.addEventListener(evt, (e) => e.stopPropagation());
    });
    if (typeof L !== 'undefined' && L.DomEvent) {
        L.DomEvent.disableClickPropagation(drawingToolbar);
        L.DomEvent.disableScrollPropagation(drawingToolbar);
    }
}

// PREVENT ZOOM CONTROLS CLICKS FROM TRIGGERING MAP ACTIONS
var zoomControlsBlocker = document.getElementById('zoomControls');
if (zoomControlsBlocker) {
    ['click', 'mousedown', 'mouseup', 'dblclick', 'pointerdown'].forEach(evt => {
        zoomControlsBlocker.addEventListener(evt, (e) => e.stopPropagation());
    });
    if (typeof L !== 'undefined' && L.DomEvent) {
        L.DomEvent.disableClickPropagation(zoomControlsBlocker);
        L.DomEvent.disableScrollPropagation(zoomControlsBlocker);
    }
}

// FLOATING CURSOR TOOLTIP HELPERS
function updateCursorTooltip(e, text) {
    let tooltip = document.getElementById('cursorDrawingTooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'cursorDrawingTooltip';
        tooltip.className = 'fixed z-[9999] pointer-events-none bg-slate-900/90 text-slate-100 text-[9px] font-medium px-1.5 py-0.5 rounded shadow-md backdrop-blur-xs border border-white/15 transition-opacity duration-75';
        document.body.appendChild(tooltip);
    }
    
    tooltip.innerText = text;
    tooltip.style.left = `${e.clientX + 10}px`;
    tooltip.style.top = `${e.clientY + 10}px`;
    tooltip.classList.remove('hidden');
}

function hideCursorTooltip() {
    const tooltip = document.getElementById('cursorDrawingTooltip');
    if (tooltip) tooltip.classList.add('hidden');
}

// HELPER TO RENDER TEMPORARY SVG VERTEX NODES
function renderTempShapeNodes(isSnapping = false) {
    let nodesGroup = document.getElementById('temp-shape-nodes-group');
    if (!nodesGroup) {
        nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodesGroup.id = 'temp-shape-nodes-group';
        nodesGroup.setAttribute('pointer-events', 'none');
    }
    
    // Always append to the end of the SVG so nodes render ON TOP of the polygon stroke
    if (vectorDrawingOverlay) {
        vectorDrawingOverlay.appendChild(nodesGroup);
    }
    
    nodesGroup.innerHTML = '';

    if (!shapePoints || shapePoints.length === 0) return;

    let canvasWidth = 1000;
    let canvasHeight = 1000;
    if (typeof currentMapBounds !== 'undefined' && currentMapBounds) {
        canvasHeight = currentMapBounds[1][0];
        canvasWidth = currentMapBounds[1][1];
    }

    // Dynamically calculate node sizes relative to line stroke width
    let sizeKey = 'medium';
    const rawSize = activeSize ? activeSize.toLowerCase() : 'medium';
    if (rawSize === 'small' || rawSize === 's') sizeKey = 'small';
    else if (rawSize === 'large' || rawSize === 'l') sizeKey = 'large';

    const fallbackSizes = { small: 13, medium: 18, large: 25 };
    const baseSize = (typeof ISSUE_SIZES !== 'undefined' && ISSUE_SIZES[sizeKey])
        ? ISSUE_SIZES[sizeKey]
        : fallbackSizes[sizeKey];

    const strokeWidthVal = Math.round(baseSize * (8 / 18));
    const nodeRadius = Math.round(strokeWidthVal * 1.5); 
    const originRadius = isSnapping ? Math.round(strokeWidthVal * 2.3) : Math.round(strokeWidthVal * 1.8);
    const borderWidth = Math.max(2, Math.round(strokeWidthVal * 0.25));

    shapePoints.forEach((pt, idx) => {
        const px = (pt.x / 100) * canvasWidth;
        const py = (pt.y / 100) * canvasHeight;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', px);
        circle.setAttribute('cy', py);

        if (idx === 0) {
            circle.id = 'temp-origin-node';
            circle.setAttribute('r', originRadius);
            circle.setAttribute('fill', isSnapping ? '#34d399' : '#ef4444');
            circle.setAttribute('stroke', '#ffffff');
            circle.setAttribute('stroke-width', borderWidth);
        } else {
            circle.setAttribute('class', 'temp-shape-node');
            circle.setAttribute('r', nodeRadius);
            circle.setAttribute('fill', '#ef4444');
            circle.setAttribute('stroke', '#ffffff');
            circle.setAttribute('stroke-width', borderWidth);
        }
        nodesGroup.appendChild(circle);
    });
}

function calculateNextAvailableErrorNumber() {
    const usedNumbers = (typeof activeErrors !== 'undefined' ? activeErrors : [])
        .map(e => e.error_number)
        .filter(n => n != null);
    let candidate = 1;
    while (usedNumbers.includes(candidate)) { candidate++; }
    return candidate;
}

function clearTempPreview() {
    firstPointClicked = null;
    shapePoints = [];
    hideCursorTooltip();

    const oldTemp = document.getElementById('temp-start-indicator');
    if (oldTemp) oldTemp.remove();
    const liveLine = document.getElementById('temp-live-line');
    if (liveLine) liveLine.remove();
    const liveCircle = document.getElementById('temp-live-circle');
    if (liveCircle) liveCircle.remove();
    const liveShape = document.getElementById('temp-live-shape');
    if (liveShape) liveShape.remove();
    const liveText = document.getElementById('temp-live-text-group');
    if (liveText) liveText.remove();
    
    // Remove temporary SVG vertex nodes group
    const nodesGroup = document.getElementById('temp-shape-nodes-group');
    if (nodesGroup) nodesGroup.remove();

    document.querySelectorAll('.temp-shape-node').forEach(node => node.remove());
}

// FINISH & SUBMIT POLYGON SHAPE
async function finishPolygonCreation() {
    if (shapePoints.length < 3) return;

    const geometryString = JSON.stringify({ points: shapePoints });
    const targetNum = calculateNextAvailableErrorNumber();
    const startPt = shapePoints[0];

    let emailPrefix = 'staff';
    try {
        const { data: authSession } = await supabaseClient.auth.getSession();
        if (authSession && authSession.session && authSession.session.user) {
            emailPrefix = getEmailPrefix(authSession.session.user.email);
        }
    } catch (err) {}

    const payload = {
        map_id: currentMapId,
        x_percent: startPt.x,
        y_percent: startPt.y,
        description: '',
        tool_type: 'shape',
        geometry_data: geometryString,
        status: 'open',
        error_number: targetNum,
        created_by: emailPrefix,
        issue_size: activeSize
    };

    clearTempPreview();

    const { data, error } = await supabaseClient.from('map_errors').insert([payload]).select();
    if (!error && data && data.length > 0) {
        if (typeof newlyCreatedPinId !== 'undefined') newlyCreatedPinId = data[0].id;
        if (typeof fetchPins === 'function') await fetchPins();
        if (typeof renderUI === 'function') renderUI();
    }

    if (toolHint) toolHint.innerText = "Click points. Double-click or click start point to finish polygon.";
}

// Symbology size buttons (S, M, L)
document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.size-btn').forEach(b => {
            b.className = "size-btn flex-1 py-1.5 bg-black/20 hover:bg-black/30 text-[10px] font-bold rounded cursor-pointer transition";
        });
        
        activeSize = btn.id.replace('size-', '');
        btn.className = "size-btn flex-1 py-1.5 bg-[#1985a1] text-white text-[10px] font-bold rounded cursor-pointer transition shadow-md";
    });
});

// Tool selector buttons
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.tool-btn').forEach(b => {
            b.className = "tool-btn px-3 py-1.5 bg-black/20 hover:bg-black/30 text-left text-xs font-semibold rounded flex items-center space-x-2 cursor-pointer transition";
        });
        
        const selectedTool = btn.id.replace('tool-', '');
        activeTool = selectedTool;
        clearTempPreview();
        
        // SHOW / HIDE SIZE SELECTOR PANEL
        const sizePanel = document.getElementById('sizeSelectorPanel');
        if (sizePanel) {
            if (activeTool === 'view') {
                sizePanel.classList.add('hidden');
            } else {
                sizePanel.classList.remove('hidden');
            }
        }

        if (typeof hideIssuePopover === 'function') hideIssuePopover();
        btn.className = "tool-btn px-3 py-1.5 bg-[#1985a1] text-white text-left text-xs font-semibold rounded flex items-center space-x-2 cursor-pointer transition shadow-md";

        // Enable/Disable Leaflet dragging based on tool
        if (typeof leafletMap !== 'undefined' && leafletMap) {
            if (activeTool === 'view') {
                leafletMap.dragging.enable();
            } else {
                leafletMap.dragging.disable();
            }
        }

        // Configure overlay pointer events
        if (vectorDrawingOverlay) {
            if (activeTool === 'view') {
                vectorDrawingOverlay.style.cursor = 'grab';
                vectorDrawingOverlay.style.pointerEvents = 'none';
            } else {
                vectorDrawingOverlay.style.cursor = 'crosshair';
                vectorDrawingOverlay.style.pointerEvents = 'auto';
            }
        }

        if (toolHint) {
            if (activeTool === 'view') toolHint.innerText = "Viewing / Pan-Zoom";
            else if (activeTool === 'point') toolHint.innerText = "Place Point";
            else if (activeTool === 'text') toolHint.innerText = "Type in Right Sidebar to Insert Text";
            else if (activeTool === 'circle') toolHint.innerText = "Click Center, then Click Radius";
            else if (activeTool === 'shape') toolHint.innerText = "Click points. Double-click or click start point to finish polygon.";
            else if (activeTool === 'highlight') toolHint.innerText = "Click start and end to highlight area";
            else toolHint.innerText = "Click The Start And End";
        }
       
        if (typeof renderUI === 'function') renderUI();
    });
});

// Leaflet map click connector for issue creation
window.handleMapClick = async function(e, mapCoords) {
    if (typeof currentMapId === 'undefined' || !currentMapId || activeTool === 'view') {
        return;
    }

    if (typeof hideIssuePopover === 'function') hideIssuePopover();

    if (!mapCoords && typeof screenToMapCoords === 'function' && e) {
        mapCoords = screenToMapCoords(e.clientX, e.clientY);
    }

    if (!mapCoords) return;

    const currentTime = Date.now();
    if (currentTime - lastClickTime < 150) return;
    lastClickTime = currentTime;

    let xPercent = mapCoords.xPercent;
    let yPercent = mapCoords.yPercent;

    let emailPrefix = 'staff';
    try {
        const { data: authSession } = await supabaseClient.auth.getSession();
        if (authSession && authSession.session && authSession.session.user) {
            emailPrefix = getEmailPrefix(authSession.session.user.email);
        }
    } catch (authErr) {
        const userBadge = document.getElementById('userBadge');
        if (userBadge && userBadge.innerText) emailPrefix = userBadge.innerText.split('@')[0];
    }

    if (activeTool === 'point') {
        // SINGLE-CLICK POINT PLACEMENT
        const targetNum = calculateNextAvailableErrorNumber();
        const temporaryId = 'temp-' + Date.now();

        if (typeof activeErrors !== 'undefined') {
            activeErrors.push({ id: temporaryId, error_number: targetNum, status: 'open' });
        }

        const payload = {
            map_id: currentMapId,
            x_percent: xPercent,
            y_percent: yPercent,
            description: '',
            tool_type: 'dot',
            gis_layer: null,
            status: 'open',
            error_number: targetNum,
            created_by: emailPrefix,
            issue_size: activeSize
        };

        const { data, error } = await supabaseClient.from('map_errors').insert([payload]).select();
        if (typeof activeErrors !== 'undefined') {
            activeErrors = activeErrors.filter(err => err.id !== temporaryId);
        }

        if (!error && data && data.length > 0) {
            if (typeof newlyCreatedPinId !== 'undefined') newlyCreatedPinId = data[0].id;
            if (typeof fetchPins === 'function') await fetchPins();
            if (typeof renderUI === 'function') renderUI();
        }
    } else if (activeTool === 'text') {
        // 2-CLICK ROTATIONAL MAP TEXT PLACEMENT
        if (!firstPointClicked) {
            firstPointClicked = { x: xPercent, y: yPercent };
            if (toolHint) toolHint.innerText = "Move mouse to adjust text rotation angle. Click to place.";

            const tempIndicator = document.createElement('div');
            tempIndicator.id = "temp-start-indicator";
            tempIndicator.className = "absolute bg-amber-500 w-3 h-3 rounded-full border border-white animate-ping z-50 -translate-x-1/2 -translate-y-1/2";
            tempIndicator.style.left = `${xPercent}%`;
            tempIndicator.style.top = `${yPercent}%`;
            if (dotsContainer) dotsContainer.appendChild(tempIndicator);
        } else {
            let canvasWidth = 1000;
            let canvasHeight = 1000;
            if (typeof currentMapBounds !== 'undefined' && currentMapBounds) {
                canvasHeight = currentMapBounds[1][0];
                canvasWidth = currentMapBounds[1][1];
            }

            const startX = (firstPointClicked.x / 100) * canvasWidth;
            const startY = (firstPointClicked.y / 100) * canvasHeight;
            const currX = (xPercent / 100) * canvasWidth;
            const currY = (yPercent / 100) * canvasHeight;

            let angleDeg = Math.atan2(currY - startY, currX - startX) * (180 / Math.PI);
            const roundedAngle = Math.round(angleDeg * 10) / 10;

            const geometryString = JSON.stringify({ angle: roundedAngle });
            const targetNum = calculateNextAvailableErrorNumber();
            const temporaryId = 'temp-' + Date.now();

            if (typeof activeErrors !== 'undefined') {
                activeErrors.push({ id: temporaryId, error_number: targetNum, status: 'open' });
            }

            const payload = {
                map_id: currentMapId,
                x_percent: firstPointClicked.x,
                y_percent: firstPointClicked.y,
                description: 'Enter Text Here...',
                tool_type: 'text',
                geometry_data: geometryString,
                angle: roundedAngle, // Explicitly save to Supabase 'angle' column
                status: 'open',
                error_number: targetNum,
                created_by: emailPrefix,
                issue_size: activeSize
            };

            clearTempPreview();

            const { data, error } = await supabaseClient.from('map_errors').insert([payload]).select();
            if (typeof activeErrors !== 'undefined') {
                activeErrors = activeErrors.filter(err => err.id !== temporaryId);
            }

            if (!error && data && data.length > 0) {
                if (typeof newlyCreatedPinId !== 'undefined') newlyCreatedPinId = data[0].id;
                if (typeof fetchPins === 'function') await fetchPins();
                if (typeof renderUI === 'function') renderUI();
            } else if (error) {
                console.error('[Text Placement Debug] Error inserting text issue:', error.message);
            }

            if (toolHint) toolHint.innerText = "Click to set text location";
        }
} else if (activeTool === 'line' || activeTool === 'dash' || activeTool === 'arrow' || activeTool === 'circle' || activeTool === 'highlight') {
        if (!firstPointClicked) {
            firstPointClicked = { x: xPercent, y: yPercent };
            if (toolHint) {
                toolHint.innerText = activeTool === 'circle' 
                    ? "Center set! Click outer edge to set radius." 
                    : activeTool === 'highlight' 
                    ? "Start set! Click where highlight ends."
                    : "Start Set! Click Where shape Should End.";
            }
           
            const tempIndicator = document.createElement('div');
            tempIndicator.id = "temp-start-indicator";
            tempIndicator.className = "absolute bg-amber-500 w-3 h-3 rounded-full border border-white animate-ping z-50 -translate-x-1/2 -translate-y-1/2";
            tempIndicator.style.left = `${xPercent}%`;
            tempIndicator.style.top = `${yPercent}%`;
            if (dotsContainer) dotsContainer.appendChild(tempIndicator);
        } else {
            const endPoint = { x: xPercent, y: yPercent };

            const geometryString = JSON.stringify({
                cx: firstPointClicked.x, cy: firstPointClicked.y,
                x1: firstPointClicked.x, y1: firstPointClicked.y,
                x2: endPoint.x, y2: endPoint.y,
                edgeX: endPoint.x, edgeY: endPoint.y
            });

            clearTempPreview();
            const targetNum = calculateNextAvailableErrorNumber();
            const temporaryId = 'temp-' + Date.now();

            if (typeof activeErrors !== 'undefined') {
                activeErrors.push({ id: temporaryId, error_number: targetNum, status: 'open' });
            }

            const payload = {
                map_id: currentMapId,
                x_percent: firstPointClicked ? firstPointClicked.x : xPercent,
                y_percent: firstPointClicked ? firstPointClicked.y : yPercent,
                description: '',
                tool_type: activeTool,
                geometry_data: geometryString,
                status: 'open',
                error_number: targetNum,
                created_by: emailPrefix,
                issue_size: activeSize
            };

            const { data, error } = await supabaseClient.from('map_errors').insert([payload]).select();
            if (typeof activeErrors !== 'undefined') {
                activeErrors = activeErrors.filter(err => err.id !== temporaryId);
            }

            if (!error && data && data.length > 0) {
                if (typeof newlyCreatedPinId !== 'undefined') newlyCreatedPinId = data[0].id;
                if (typeof fetchPins === 'function') await fetchPins();
                if (typeof renderUI === 'function') renderUI();
            }

            if (toolHint) toolHint.innerText = activeTool === 'circle' ? "Click Center, then Click Radius" : "Click The Start And End";
        }
    } else if (activeTool === 'shape') {
        // CHECK IF CLICK SNAPS TO ORIGIN VERTEX TO FINISH POLYGON
        if (shapePoints.length >= 3 && typeof mapToScreenCoords === 'function') {
            const startScreen = mapToScreenCoords(shapePoints[0].x, shapePoints[0].y);
            const viewportRect = mapViewport.getBoundingClientRect();
            const cursorX = e.clientX - viewportRect.left;
            const cursorY = e.clientY - viewportRect.top;
            const screenDist = Math.hypot(cursorX - startScreen.x, cursorY - startScreen.y);

            if (screenDist < 22) {
                await finishPolygonCreation();
                return;
            }
        }

        shapePoints.push({ x: xPercent, y: yPercent });
        if (typeof renderTempShapeNodes === 'function') renderTempShapeNodes(false);

        if (toolHint) toolHint.innerText = `Point ${shapePoints.length} added. Double-click or click start point to finish polygon.`;
    }
};

if (vectorDrawingOverlay) {
    // CLICK EVENT TO PLACE POINTS
    vectorDrawingOverlay.addEventListener('click', (e) => {
        if (typeof window.handleMapClick === 'function') {
            const mapCoords = screenToMapCoords(e.clientX, e.clientY);
            if (mapCoords) window.handleMapClick(e, mapCoords);
        }
    });

    // DOUBLE-CLICK TO COMPLETE SHAPE / POLYGON (ARCGIS PRO BEHAVIOR)
    vectorDrawingOverlay.addEventListener('dblclick', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (activeTool === 'shape' && shapePoints.length >= 2) {
            // Strip out duplicate point pushed by second click event
            const last = shapePoints[shapePoints.length - 1];
            const prev = shapePoints[shapePoints.length - 2];
            if (Math.abs(last.x - prev.x) < 0.1 && Math.abs(last.y - prev.y) < 0.1) {
                shapePoints.pop();
            }

            if (shapePoints.length >= 3) {
                await finishPolygonCreation();
            }
        }
    });

    // LIVE PREVIEW ON MOUSE MOVE & CURSOR TOOLTIP
    vectorDrawingOverlay.addEventListener('mousemove', (e) => {
        if (typeof screenToMapCoords !== 'function') return;
        const mapCoords = screenToMapCoords(e.clientX, e.clientY);
        
        if (!mapCoords) {
            hideCursorTooltip();
            return;
        }

        let canvasWidth = 1000;
        let canvasHeight = 1000;
        if (typeof currentMapBounds !== 'undefined' && currentMapBounds) {
            canvasHeight = currentMapBounds[1][0];
            canvasWidth = currentMapBounds[1][1];
        }

        let sizeKey = 'medium';
        const rawSize = activeSize ? activeSize.toLowerCase() : 'medium';
        if (rawSize === 'small' || rawSize === 's') sizeKey = 'small';
        else if (rawSize === 'large' || rawSize === 'l') sizeKey = 'large';

        const fallbackSizes = { small: 13, medium: 18, large: 25 };
        const baseSize = (typeof ISSUE_SIZES !== 'undefined' && ISSUE_SIZES[sizeKey])
            ? ISSUE_SIZES[sizeKey]
            : fallbackSizes[sizeKey];
        const strokeWidthVal = Math.round(baseSize * (8 / 18));

        // 0. POINT TOOLTIP
        if (activeTool === 'point') {
            updateCursorTooltip(e, "Click to place point");
        }

        // 1. LINE / DASH / ARROW / HIGHLIGHT LIVE PREVIEW
        else if (activeTool === 'line' || activeTool === 'dash' || activeTool === 'arrow' || activeTool === 'highlight') {
            if (firstPointClicked) {
                updateCursorTooltip(e, activeTool === 'highlight' ? "Click to finish highlight" : "Click to set end point");

                let liveLine = document.getElementById('temp-live-line');
                if (!liveLine) {
                    liveLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    liveLine.id = 'temp-live-line';
                    liveLine.setAttribute('pointer-events', 'none');
                    vectorDrawingOverlay.appendChild(liveLine);
                }

                const startX = (firstPointClicked.x / 100) * canvasWidth;
                const startY = (firstPointClicked.y / 100) * canvasHeight;
                const endX = (mapCoords.xPercent / 100) * canvasWidth;
                const endY = (mapCoords.yPercent / 100) * canvasHeight;

                liveLine.setAttribute('x1', startX); liveLine.setAttribute('y1', startY);
                liveLine.setAttribute('x2', endX); liveLine.setAttribute('y2', endY);

                if (activeTool === 'highlight') {
                    const highlightWidth = strokeWidthVal * 3.5;
                    liveLine.setAttribute('stroke', '#dc2626');
                    liveLine.setAttribute('stroke-opacity', '0.3');
                    liveLine.setAttribute('stroke-width', highlightWidth);
                    liveLine.setAttribute('stroke-linecap', 'round');
                    liveLine.style.mixBlendMode = 'multiply';
                    liveLine.removeAttribute('stroke-dasharray');
                    liveLine.removeAttribute('marker-end');
                } else {
                    liveLine.setAttribute('stroke', '#dc2626');
                    liveLine.setAttribute('stroke-opacity', '1');
                    liveLine.setAttribute('stroke-width', strokeWidthVal);
                    liveLine.setAttribute('stroke-linecap', 'butt');
                    liveLine.style.mixBlendMode = 'normal';
                    liveLine.setAttribute('class', 'opacity-70');

                    if (activeTool === 'dash') liveLine.setAttribute('stroke-dasharray', `${strokeWidthVal * 2},${strokeWidthVal * 2}`);
                    else liveLine.removeAttribute('stroke-dasharray');

                    if (activeTool === 'arrow') liveLine.setAttribute('marker-end', 'url(#arrowhead)');
                    else liveLine.removeAttribute('marker-end');
                }
            } else {
                updateCursorTooltip(e, activeTool === 'highlight' ? "Click start of highlight" : "Click to set start point");
            }
        }

        // 2. CIRCLE LIVE PREVIEW
        else if (activeTool === 'circle') {
            if (firstPointClicked) {
                updateCursorTooltip(e, "Click outer edge to set radius");

                let liveCircle = document.getElementById('temp-live-circle');
                if (!liveCircle) {
                    liveCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    liveCircle.id = 'temp-live-circle';
                    liveCircle.setAttribute('stroke', '#dc2626');
                    liveCircle.setAttribute('fill', '#dc26260d');
                    liveCircle.setAttribute('pointer-events', 'none');
                    vectorDrawingOverlay.appendChild(liveCircle);
                }

                const cx = (firstPointClicked.x / 100) * canvasWidth;
                const cy = (firstPointClicked.y / 100) * canvasHeight;
                const edgeX = (mapCoords.xPercent / 100) * canvasWidth;
                const edgeY = (mapCoords.yPercent / 100) * canvasHeight;
                const radius = Math.hypot(edgeX - cx, edgeY - cy);

                liveCircle.setAttribute('cx', cx);
                liveCircle.setAttribute('cy', cy);
                liveCircle.setAttribute('r', radius);
                liveCircle.setAttribute('stroke-width', strokeWidthVal);
            } else {
                updateCursorTooltip(e, "Click center point");
            }
        }

        // 3. POLYGON (SHAPE) LIVE PREVIEW & ORIGIN VERTEX SNAPPING
        else if (activeTool === 'shape') {
            let isSnappingToOrigin = false;

            if (shapePoints.length >= 3 && typeof mapToScreenCoords === 'function') {
                const startScreen = mapToScreenCoords(shapePoints[0].x, shapePoints[0].y);
                const viewportRect = mapViewport.getBoundingClientRect();
                const cursorX = e.clientX - viewportRect.left;
                const cursorY = e.clientY - viewportRect.top;
                const screenDist = Math.hypot(cursorX - startScreen.x, cursorY - startScreen.y);

                if (screenDist < 22) {
                    isSnappingToOrigin = true;
                }
            }

            if (typeof renderTempShapeNodes === 'function') {
                renderTempShapeNodes(isSnappingToOrigin);
            }

            if (isSnappingToOrigin) {
                updateCursorTooltip(e, "Click start point to close polygon");
            } else if (shapePoints.length === 0) {
                updateCursorTooltip(e, "Click to start polygon");
            } else if (shapePoints.length < 3) {
                updateCursorTooltip(e, "Click to add point");
            } else {
                updateCursorTooltip(e, "Click to add point • Double-click to close");
            }

            if (shapePoints.length > 0) {
                let liveShape = document.getElementById('temp-live-shape');
                if (!liveShape) {
                    liveShape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                    liveShape.id = 'temp-live-shape';
                    liveShape.setAttribute('stroke', '#dc2626');
                    liveShape.setAttribute('fill', '#dc26260d');
                    liveShape.setAttribute('pointer-events', 'none');
                    vectorDrawingOverlay.appendChild(liveShape);
                }

                let ptsStr = '';
                shapePoints.forEach(pt => {
                    const px = (pt.x / 100) * canvasWidth;
                    const py = (pt.y / 100) * canvasHeight;
                    ptsStr += `${px},${py} `;
                });

                let currX, currY;
                if (isSnappingToOrigin) {
                    currX = (shapePoints[0].x / 100) * canvasWidth;
                    currY = (shapePoints[0].y / 100) * canvasHeight;
                } else {
                    currX = (mapCoords.xPercent / 100) * canvasWidth;
                    currY = (mapCoords.yPercent / 100) * canvasHeight;
                }
                ptsStr += `${currX},${currY}`;

                liveShape.setAttribute('points', ptsStr);
                liveShape.setAttribute('stroke-width', strokeWidthVal);
            }
        }

        // 4. MAP TEXT LIVE ROTATION PREVIEW & TOOLTIP
        else if (activeTool === 'text') {
            if (firstPointClicked) {
                const startX = (firstPointClicked.x / 100) * canvasWidth;
                const startY = (firstPointClicked.y / 100) * canvasHeight;
                const currX = (mapCoords.xPercent / 100) * canvasWidth;
                const currY = (mapCoords.yPercent / 100) * canvasHeight;

                let angleDeg = Math.atan2(currY - startY, currX - startX) * (180 / Math.PI);
                const displayAngle = Math.round(angleDeg);

                updateCursorTooltip(e, `Click to confirm angle (${displayAngle}°)`);

                let liveTextGroup = document.getElementById('temp-live-text-group');
                if (!liveTextGroup) {
                    liveTextGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    liveTextGroup.id = 'temp-live-text-group';
                    liveTextGroup.setAttribute('pointer-events', 'none');

                    const guideLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    guideLine.id = 'temp-live-text-line';
                    guideLine.setAttribute('stroke', '#38bdf8');
                    guideLine.setAttribute('stroke-width', '2');
                    guideLine.setAttribute('stroke-dasharray', '4,4');

                    const sampleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    sampleText.id = 'temp-live-text-str';
                    sampleText.setAttribute('fill', '#dc2626');
                    sampleText.setAttribute('font-weight', 'bold');
                    sampleText.textContent = 'Sample Text';

                    liveTextGroup.appendChild(guideLine);
                    liveTextGroup.appendChild(sampleText);
                    vectorDrawingOverlay.appendChild(liveTextGroup);
                }

                const guideLine = document.getElementById('temp-live-text-line');
                const sampleText = document.getElementById('temp-live-text-str');

                if (guideLine) {
                    guideLine.setAttribute('x1', startX);
                    guideLine.setAttribute('y1', startY);
                    guideLine.setAttribute('x2', currX);
                    guideLine.setAttribute('y2', currY);
                }

                if (sampleText) {
                    sampleText.setAttribute('x', startX + baseSize + 6);
                    sampleText.setAttribute('y', startY + (baseSize * 0.35));
                    sampleText.setAttribute('font-size', `${baseSize * 1.1}px`);
                    sampleText.setAttribute('transform', `rotate(${angleDeg}, ${startX}, ${startY})`);
                }
            } else {
                updateCursorTooltip(e, "Click to set text location");
            }
        } else {
            hideCursorTooltip();
        }
    });

    // HIDE TOOLTIP WHEN CURSOR LEAVES MAP
    vectorDrawingOverlay.addEventListener('mouseleave', () => {
        hideCursorTooltip();
    });
    // KEYBOARD SHORTCUTS FOR TOOLS (1 - 9 TOP TO BOTTOM)
    document.addEventListener('keydown', (e) => {
        // Ignore shortcut keys when typing inside input fields, textareas, or select dropdowns
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) {
            return;
        }

        const toolKeyMap = {
            '1': 'tool-view',        // 1: View
            '2': 'tool-point',       // 2: Point
            '3': 'tool-line',        // 3: Line
            '4': 'tool-dash',        // 4: Dash
            '5': 'tool-highlight',   // 5: Highlight
            '6': 'tool-arrow',       // 6: Arrow
            '7': 'tool-shape',       // 7: Polygon
            '8': 'tool-circle',      // 8: Circle
            '9': 'tool-text'         // 9: Text
        };

        if (toolKeyMap[e.key]) {
            const btn = document.getElementById(toolKeyMap[e.key]);
            if (btn) {
                e.preventDefault();
                btn.click(); // Triggers existing tool selection logic & UI updates
            }
        }
    });

    // CANCEL DRAWING ON ESCAPE
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            clearTempPreview();
            hideCursorTooltip();
            if (toolHint) toolHint.innerText = "Drawing canceled.";
        }
    });
}