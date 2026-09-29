// Safe Global State Initialization
if (typeof window.activeErrors === 'undefined') window.activeErrors = [];
if (typeof window.pinsVisible === 'undefined') window.pinsVisible = true;
if (typeof window.fixedPinsVisible === 'undefined') window.fixedPinsVisible = true;
if (typeof window.sidebarScrollPosition === 'undefined') window.sidebarScrollPosition = 0;
if (typeof window.currentActivePopoverId === 'undefined') window.currentActivePopoverId = null;
if (typeof window.newlyCreatedPinId === 'undefined') window.newlyCreatedPinId = null;

var sidebarList = document.getElementById('sidebarList');
var toggleVisibilityBtn = document.getElementById('toggleVisibility');
var visibilityText = document.getElementById('visibilityText');
var toggleFixedVisibilityBtn = document.getElementById('toggleFixedVisibility');
var fixedVisibilityText = document.getElementById('fixedVisibilityText');

var floatingPopover = document.getElementById('floatingPopover');
var popoverBadge = document.getElementById('popoverBadge');
var popoverTitle = document.getElementById('popoverTitle');
var popoverContent = document.getElementById('popoverContent');
var closePopoverBtn = document.getElementById('closePopoverBtn');
var popoverActionBtn = document.getElementById('popoverActionBtn');

// Fallback Helper for User Colors
if (typeof window.getUserColorStyle !== 'function') {
    window.getUserColorStyle = function(username) {
        return { bg: 'bg-indigo-600', text: 'text-indigo-600' };
    };
}

// Event Listeners
if (toggleVisibilityBtn) {
    toggleVisibilityBtn.addEventListener('click', () => {
        pinsVisible = !pinsVisible;
        if (visibilityText) visibilityText.innerText = pinsVisible ? 'Hide Open' : 'Show Open';
        renderUI();
    });
}

if (toggleFixedVisibilityBtn) {
    toggleFixedVisibilityBtn.addEventListener('click', () => {
        fixedPinsVisible = !fixedPinsVisible;
        if (fixedVisibilityText) fixedVisibilityText.innerText = fixedPinsVisible ? 'Hide Fixed' : 'Show Fixed';
        renderUI();
    });
}

if (closePopoverBtn) {
    closePopoverBtn.addEventListener('click', hideIssuePopover);
}

var mapViewport = document.getElementById('mapViewport');
if (mapViewport) {
    mapViewport.addEventListener('click', (e) => {
        if (floatingPopover && !floatingPopover.contains(e.target) && e.target.id !== 'floatingPopover' && e.target.id === 'vectorDrawingOverlay') {
            hideIssuePopover();
        }
    });
}
async function getCurrentUserIdentifier() {
    // 1. Query active Supabase auth session
    try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) {
            const { data } = await supabaseClient.auth.getUser();
            if (data?.user) {
                const u = data.user;
                if (u.email) return u.email.split('@')[0];
                if (u.user_metadata?.full_name) return u.user_metadata.full_name;
                if (u.user_metadata?.name) return u.user_metadata.name;
            }
        }
    } catch (e) {}

    // 2. Fallback to global user variables
    const globUser = (typeof window.currentUser !== 'undefined' && window.currentUser) 
        ? window.currentUser 
        : (typeof currentUser !== 'undefined' ? currentUser : null);

    if (globUser) {
        if (typeof globUser === 'string') return globUser.includes('@') ? globUser.split('@')[0] : globUser;
        if (globUser.email) return globUser.email.split('@')[0];
        if (globUser.user_metadata?.full_name) return globUser.user_metadata.full_name;
    }

    // 3. Fallback to header user badge element text
    const badge = document.getElementById('userBadge');
    if (badge && badge.innerText && badge.innerText.trim()) {
        const text = badge.innerText.trim();
        return text.includes('@') ? text.split('@')[0] : text;
    }

    return '';
}

function getMapUploader() {
    const m = (typeof window.currentMap !== 'undefined' && window.currentMap) 
           || (typeof currentMap !== 'undefined' && currentMap)
           || (typeof window.activeMap !== 'undefined' && window.activeMap)
           || null;
    if (!m) return '';
    return m.uploaded_by || m.created_by || m.uploader || m.user_email || '';
}

function normUser(val) {
    if (!val) return '';
    return String(val).toLowerCase().trim().split('@')[0];
}

function formatDisplayName(identifier) {
    if (!identifier) return '';
    const raw = identifier.split('@')[0].split('.')[0].toLowerCase();
    return raw === 'mckenzie' ? 'McKenzie' : raw.charAt(0).toUpperCase() + raw.slice(1);
}

function canEditIssue(err) {
    if (!err || !err.created_by) return true;

    let currentIdent = '';
    const globUser = (typeof window.currentUser !== 'undefined' && window.currentUser) 
        ? window.currentUser 
        : (typeof currentUser !== 'undefined' ? currentUser : null);

    if (globUser) {
        if (typeof globUser === 'string') currentIdent = globUser;
        else if (globUser.email) currentIdent = globUser.email;
        else if (globUser.user_metadata?.full_name) currentIdent = globUser.user_metadata.full_name;
    }

    if (!currentIdent) {
        const badge = document.getElementById('userBadge');
        if (badge && badge.innerText) currentIdent = badge.innerText.trim();
    }

    if (!currentIdent) return true;

    const userNorm = currentIdent.toLowerCase().trim().split('@')[0];
    const creatorNorm = err.created_by.toLowerCase().trim().split('@')[0];

    return userNorm === creatorNorm;
}
// Popover Logic
function triggerIssuePopover(clickEvent, err) {
    if (!floatingPopover) return;

    if (currentActivePopoverId === err.id && !floatingPopover.classList.contains('hidden')) {
        hideIssuePopover();
        return;
    }

    const isFixed = err.status === 'fixed';
    const pinNum = err.error_number || '?';
    let typeLabel = 'Point';
    if (err.tool_type === 'line') typeLabel = 'Line';
    if (err.tool_type === 'dash') typeLabel = 'Dash';
    if (err.tool_type === 'arrow') typeLabel = 'Arrow';
    if (err.tool_type === 'circle') typeLabel = 'Circle';
    if (err.tool_type === 'highlighter') typeLabel = 'Highlighter';
    if (err.tool_type === 'shape') typeLabel = 'Shape';
    if (err.tool_type === 'text') typeLabel = 'Text';

    currentActivePopoverId = err.id;

    if (popoverBadge) {
        popoverBadge.className = `rounded-full w-5 h-5 text-[10px] flex items-center justify-center font-bold ${isFixed ? 'bg-emerald-600' : 'bg-red-600'}`;
        popoverBadge.innerText = pinNum;
    }
    const fixerNorm = normUser(err.fixed_by);
    const uploaderNorm = normUser(getMapUploader());
    const isFixedByNonUploader = isFixed && fixerNorm && uploaderNorm && (fixerNorm !== uploaderNorm);

    if (popoverTitle) {
        let titleStr = typeLabel;
        if (err.created_by) {
            titleStr += ` (by ${formatDisplayName(err.created_by)}`;
            if (isFixedByNonUploader) {
                titleStr += ` fixed by ${formatDisplayName(err.fixed_by)}`;
            }
            titleStr += `)`;
        }
        popoverTitle.innerText = titleStr;
    }
    
    const screenInput = document.getElementById(`input-${err.id}`);
    const textValue = screenInput ? screenInput.value : (err.description || '');
    if (popoverContent) {
        popoverContent.innerText = textValue.trim() || 'No Description';
    }

    if (popoverActionBtn) {
        popoverActionBtn.innerText = isFixed ? 'Reopen Issue' : 'Mark As Fixed';
        popoverActionBtn.className = `w-full py-1.5 text-xs font-bold text-white rounded-lg transition cursor-pointer shadow-md ${isFixed ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1985a1] hover:bg-[#1985a1]/80'}`;
        
        popoverActionBtn.onclick = () => {
            togglePinStatus(err.id, err.status);
            hideIssuePopover();
        };
    }

    const viewportRect = document.getElementById('mapViewport').getBoundingClientRect();
    const targetElement = clickEvent.currentTarget;
    
    let targetCenterX, targetTopY;

    if (targetElement && typeof targetElement.getBoundingClientRect === 'function') {
        const targetRect = targetElement.getBoundingClientRect();
        targetCenterX = (targetRect.left + targetRect.width / 2) - viewportRect.left;
        targetTopY = targetRect.top - viewportRect.top;
    } else {
        targetCenterX = clickEvent.clientX - viewportRect.left;
        targetTopY = clickEvent.clientY - viewportRect.top;
    }

    floatingPopover.style.left = `${targetCenterX}px`;
    floatingPopover.style.top = `${targetTopY}px`;
    floatingPopover.classList.remove('hidden');

    const cardWidth = floatingPopover.offsetWidth || 256;
    const cardHeight = floatingPopover.offsetHeight || 140;

    let finalLeft = targetCenterX - (cardWidth / 2);
    let finalTop = targetTopY - cardHeight - 8; 

    if (finalLeft < 10) finalLeft = 10;
    if (finalLeft + cardWidth > viewportRect.width - 10) finalLeft = viewportRect.width - cardWidth - 10;
    
    if (finalTop < 10) {
        if (targetElement && typeof targetElement.getBoundingClientRect === 'function') {
            const targetRect = targetElement.getBoundingClientRect();
            finalTop = (targetRect.bottom - viewportRect.top) + 8;
        } else {
            finalTop = targetTopY + 20;
        }
    }

    floatingPopover.style.left = `${finalLeft}px`;
    floatingPopover.style.top = `${finalTop}px`;
}

function hideIssuePopover() {
    if (floatingPopover) {
        floatingPopover.classList.add('hidden');
    }
    currentActivePopoverId = null;
}

// Database Actions
async function saveInlineDescription(pinId, value) {
    const localErr = activeErrors.find(e => e.id === pinId);
    if (localErr && !canEditIssue(localErr)) return;

    const targetVal = value.trim();
    if (localErr) localErr.description = targetVal;

    await supabaseClient.from('map_errors').update({ description: targetVal }).eq('id', pinId);
    fetchPins();
}

async function saveInlineLayer(pinId, selectedLayer) {
    const targetValue = selectedLayer === "" ? null : selectedLayer;
    const localErr = activeErrors.find(e => e.id === pinId);
    if (localErr) localErr.gis_layer = targetValue;

    await supabaseClient.from('map_errors').update({ gis_layer: targetValue }).eq('id', pinId);
    fetchPins();
}

async function togglePinStatus(pinId, currentStatus) {
    const nextStatus = currentStatus === 'fixed' ? 'open' : 'fixed';
    
    let fixerIdent = null;
    if (nextStatus === 'fixed') {
        fixerIdent = await getCurrentUserIdentifier();
    }

    const payload = { 
        status: nextStatus,
        fixed_by: nextStatus === 'fixed' ? (fixerIdent || 'Unknown') : null
    };

    const localErr = activeErrors.find(e => e.id === pinId);
    if (localErr) {
        localErr.status = nextStatus;
        localErr.fixed_by = payload.fixed_by;
    }

    const { error } = await supabaseClient.from('map_errors').update(payload).eq('id', pinId);

    if (error) {
        console.warn('[Issue Tracker] Update with fixed_by failed, falling back to status update:', error.message);
        await supabaseClient.from('map_errors').update({ status: nextStatus }).eq('id', pinId);
    }

    fetchPins();
}

async function handlePinClick(e, err) {
    if (typeof activeTool !== 'undefined' && activeTool !== 'view') {
        // When drawing, do not open popups; allow the click to place a drawing point
        return;
    }
    e.stopPropagation();
    triggerIssuePopover(e, err);
}

async function fetchPins() {
    if (typeof currentMapId === 'undefined' || !currentMapId) {
        console.log('[Issue Render Debug] fetchPins skipped: currentMapId is null.');
        return;
    }

    const activeEl = document.activeElement;
    const isUserEditing = activeEl && sidebarList && sidebarList.contains(activeEl) && 
        (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT');

    if (isUserEditing && !newlyCreatedPinId) {
        console.log('[Issue Render Debug] fetchPins skipped: User is typing in sidebar input.');
        return;
    }

    if (sidebarList) {
        sidebarScrollPosition = sidebarList.scrollTop;
    }

    console.log(`[Issue Render Debug] Fetching issues from Supabase for Map ID: ${currentMapId}...`);

    const { data, error } = await supabaseClient
        .from('map_errors')
        .select('*')
        .eq('map_id', currentMapId)
        .order('error_number', { ascending: true });

    if (!error) { 
        activeErrors = data || []; 
        console.log(`[Issue Render Debug] Successfully fetched ${activeErrors.length} issues. Invoking renderUI()...`);
        renderUI(); 
    } else {
        console.error('[Issue Render Debug] Error fetching pins from database:', error.message);
    }
}

// Main UI Rendering Pipeline
function renderUI() {
    var vectorDrawingOverlay = document.getElementById('vectorDrawingOverlay');
    var sidebarList = document.getElementById('sidebarList');

    console.log('[Issue Render Debug] renderUI executed.');

    if (!vectorDrawingOverlay || !sidebarList) {
        console.error('[Issue Render Debug] Aborting renderUI: Container reference missing.');
        return;
    }

    const activeElement = document.activeElement;
    let activeInputId = null;
    let selectionStart = 0;
    let selectionEnd = 0;

    if (activeElement && sidebarList.contains(activeElement) && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT')) {
        activeInputId = activeElement.id;
        if (activeElement.tagName === 'TEXTAREA') {
            selectionStart = activeElement.selectionStart || 0;
            selectionEnd = activeElement.selectionEnd || 0;
        }
    }

    if (sidebarList && sidebarList.scrollTop > 0) {
        sidebarScrollPosition = sidebarList.scrollTop;
    }

    // Preserve SVG Defs for arrowhead markers
    const defs = vectorDrawingOverlay.querySelector('defs');
    vectorDrawingOverlay.innerHTML = '';
    if (defs) vectorDrawingOverlay.appendChild(defs);

    let canvasWidth = 1000;
    let canvasHeight = 1000;
    if (typeof currentMapBounds !== 'undefined' && currentMapBounds) {
        canvasHeight = currentMapBounds[1][0];
        canvasWidth = currentMapBounds[1][1];
    }

    vectorDrawingOverlay.setAttribute('viewBox', `0 0 ${canvasWidth} ${canvasHeight}`);
    vectorDrawingOverlay.setAttribute('width', `${canvasWidth}`);
    vectorDrawingOverlay.setAttribute('height', `${canvasHeight}`);

    const errorsToRender = typeof activeErrors !== 'undefined' && activeErrors ? activeErrors : [];
    console.log(`[Issue Render Debug] Rendering ${errorsToRender.length} SVG issues on unscaled PDF bounds (${canvasWidth}px x ${canvasHeight}px)...`);

    errorsToRender.forEach((err) => {
        const pinNumber = err.error_number || '?';
        const isFixed = err.status === 'fixed';
        const colorHex = isFixed ? '#059669' : '#dc2626';

        let showOnMap = true;
        if (!isFixed && typeof pinsVisible !== 'undefined' && !pinsVisible) showOnMap = false;
        if (isFixed && typeof fixedPinsVisible !== 'undefined' && !fixedPinsVisible) showOnMap = false;

        if (showOnMap) {
            // DYNAMIC SIZE DERIVED FROM CONFIG
            const defaultKey = typeof DEFAULT_ISSUE_SIZE !== 'undefined' ? DEFAULT_ISSUE_SIZE : 'medium';
            const rawSizeKey = (err.issue_size || defaultKey).toLowerCase();
            
            let sizeKey = 'medium';
            if (rawSizeKey === 'small' || rawSizeKey === 's') sizeKey = 'small';
            else if (rawSizeKey === 'large' || rawSizeKey === 'l') sizeKey = 'large';

            const fallbackSizes = { small: 13, medium: 18, large: 25 };
            const baseSize = (typeof ISSUE_SIZES !== 'undefined' && ISSUE_SIZES[sizeKey])
                ? ISSUE_SIZES[sizeKey]
                : fallbackSizes[sizeKey];

            const dotRadius = baseSize;
            const strokeWidthVal = Math.round(baseSize * (8 / 18));

            if (err.tool_type === 'line' || err.tool_type === 'dash' || err.tool_type === 'arrow') {
                try {
                    const coords = typeof err.geometry_data === 'string' ? JSON.parse(err.geometry_data) : err.geometry_data;
                    if (coords) {
                        const pixelX1 = (coords.x1 / 100) * canvasWidth;
                        const pixelY1 = (coords.y1 / 100) * canvasHeight;
                        const pixelX2 = (coords.x2 / 100) * canvasWidth;
                        const pixelY2 = (coords.y2 / 100) * canvasHeight;

                        console.log(`[Issue Render Debug] SVG line #${err.id}: (${pixelX1.toFixed(1)}, ${pixelY1.toFixed(1)}) -> (${pixelX2.toFixed(1)}, ${pixelY2.toFixed(1)})`);

                        const svgLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        svgLine.setAttribute('class', 'svg-markup-line cursor-pointer pointer-events-auto');
                        svgLine.setAttribute('x1', pixelX1); 
                        svgLine.setAttribute('y1', pixelY1);
                        svgLine.setAttribute('x2', pixelX2); 
                        svgLine.setAttribute('y2', pixelY2);
                        svgLine.setAttribute('stroke', colorHex); 
                        svgLine.setAttribute('stroke-width', strokeWidthVal);
                        
                        if (err.tool_type === 'dash') svgLine.setAttribute('stroke-dasharray', `${strokeWidthVal * 2},${strokeWidthVal * 2}`);
                        if (err.tool_type === 'arrow') svgLine.setAttribute('marker-end', isFixed ? 'url(#arrowhead-fixed)' : 'url(#arrowhead)');
                        
                        svgLine.addEventListener('click', (e) => handlePinClick(e, err));
                        vectorDrawingOverlay.appendChild(svgLine);
                        
                        // Line Start Circle Badge
                        const startGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                        startGroup.setAttribute('class', 'cursor-pointer pointer-events-auto');
                        startGroup.onclick = (e) => handlePinClick(e, err);

                        const startCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        startCircle.setAttribute('cx', pixelX1);
                        startCircle.setAttribute('cy', pixelY1);
                        startCircle.setAttribute('r', dotRadius);
                        startCircle.setAttribute('fill', colorHex);
                        startCircle.setAttribute('stroke-width', '3');

                        const startText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        startText.setAttribute('x', pixelX1);
                        startText.setAttribute('y', pixelY1 + (dotRadius * 0.35));
                        startText.setAttribute('fill', '#ffffff');
                        startText.setAttribute('font-weight', 'bold');
                        startText.setAttribute('font-size', `${dotRadius * 1.1}px`);
                        startText.setAttribute('text-anchor', 'middle');
                        startText.textContent = pinNumber;

                        startGroup.appendChild(startCircle);
                        startGroup.appendChild(startText);
                        vectorDrawingOverlay.appendChild(startGroup);
                    }
                } catch (e) {
                    console.error(`[Issue Render Debug] Error rendering line #${err.id}:`, e);
                }
            } else if (err.tool_type === 'circle') {
                try {
                    const coords = typeof err.geometry_data === 'string' ? JSON.parse(err.geometry_data) : err.geometry_data;
                    if (coords) {
                        const pixelCx = (coords.cx / 100) * canvasWidth;
                        const pixelCy = (coords.cy / 100) * canvasHeight;
                        const pixelEdgeX = (coords.edgeX / 100) * canvasWidth;
                        const pixelEdgeY = (coords.edgeY / 100) * canvasHeight;
                        const radius = Math.hypot(pixelEdgeX - pixelCx, pixelEdgeY - pixelCy);

                        const svgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        svgCircle.setAttribute('class', 'cursor-pointer pointer-events-auto');
                        svgCircle.setAttribute('cx', pixelCx);
                        svgCircle.setAttribute('cy', pixelCy);
                        svgCircle.setAttribute('r', radius);
                        svgCircle.setAttribute('stroke', colorHex);
                        svgCircle.setAttribute('stroke-width', strokeWidthVal);
                        svgCircle.setAttribute('fill', `${colorHex}0d`); // 95% transparent (5% opacity)
                        svgCircle.addEventListener('click', (e) => handlePinClick(e, err));
                        vectorDrawingOverlay.appendChild(svgCircle);

                        // Position badge on the left edge along the circle line
                        const badgeX = pixelCx - radius;
                        const badgeY = pixelCy;

                        const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                        edgeGroup.setAttribute('class', 'cursor-pointer pointer-events-auto');
                        edgeGroup.onclick = (e) => handlePinClick(e, err);

                        const circleBadge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        circleBadge.setAttribute('cx', badgeX);
                        circleBadge.setAttribute('cy', badgeY);
                        circleBadge.setAttribute('r', dotRadius);
                        circleBadge.setAttribute('fill', colorHex);

                        const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        badgeText.setAttribute('x', badgeX);
                        badgeText.setAttribute('y', badgeY + (dotRadius * 0.35));
                        badgeText.setAttribute('fill', '#ffffff');
                        badgeText.setAttribute('font-weight', 'bold');
                        badgeText.setAttribute('font-size', `${dotRadius * 1.1}px`);
                        badgeText.setAttribute('text-anchor', 'middle');
                        badgeText.textContent = pinNumber;

                        edgeGroup.appendChild(circleBadge);
                        edgeGroup.appendChild(badgeText);
                        vectorDrawingOverlay.appendChild(edgeGroup);
                    }
                } catch (e) {
                    console.error(`[Issue Render Debug] Error rendering circle #${err.id}:`, e);
                }

        } else if (err.tool_type === 'highlighter') {
            try {
                const coords = typeof err.geometry_data === 'string' ? JSON.parse(err.geometry_data) : err.geometry_data;
                if (coords) {
                    const pixelX1 = (coords.x1 / 100) * canvasWidth;
                    const pixelY1 = (coords.y1 / 100) * canvasHeight;
                    const pixelX2 = (coords.x2 / 100) * canvasWidth;
                    const pixelY2 = (coords.y2 / 100) * canvasHeight;

                    const highlightWidth = strokeWidthVal * 3.5;

                    const svgLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    svgLine.setAttribute('class', 'cursor-pointer pointer-events-auto');
                    svgLine.setAttribute('x1', pixelX1); 
                    svgLine.setAttribute('y1', pixelY1);
                    svgLine.setAttribute('x2', pixelX2); 
                    svgLine.setAttribute('y2', pixelY2);
                    svgLine.setAttribute('stroke', colorHex); // Uses #059669 (green) when fixed, #dc2626 (red) when open
                    svgLine.setAttribute('stroke-opacity', '0.3'); // 70% transparent
                    svgLine.setAttribute('stroke-width', highlightWidth);
                    svgLine.setAttribute('stroke-linecap', 'round');
                    svgLine.style.mixBlendMode = 'multiply';
                    
                    svgLine.addEventListener('click', (e) => handlePinClick(e, err));
                    vectorDrawingOverlay.appendChild(svgLine);
                    
                    // Start Circle Badge
                    const startGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    startGroup.setAttribute('class', 'cursor-pointer pointer-events-auto');
                    startGroup.onclick = (e) => handlePinClick(e, err);

                    const startCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    startCircle.setAttribute('cx', pixelX1);
                    startCircle.setAttribute('cy', pixelY1);
                    startCircle.setAttribute('r', dotRadius);
                    startCircle.setAttribute('fill', colorHex);

                    const startText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    startText.setAttribute('x', pixelX1);
                    startText.setAttribute('y', pixelY1 + (dotRadius * 0.35));
                    startText.setAttribute('fill', '#ffffff');
                    startText.setAttribute('font-weight', 'bold');
                    startText.setAttribute('font-size', `${dotRadius * 1.1}px`);
                    startText.setAttribute('text-anchor', 'middle');
                    startText.textContent = pinNumber;

                    startGroup.appendChild(startCircle);
                    startGroup.appendChild(startText);
                    vectorDrawingOverlay.appendChild(startGroup);
                }
            } catch (e) {
                console.error(`[Issue Render Debug] Error rendering highlighter #${err.id}:`, e);
            }
        } else if (err.tool_type === 'shape') {
                try {
                    const coords = typeof err.geometry_data === 'string' ? JSON.parse(err.geometry_data) : err.geometry_data;
                    if (coords && coords.points && coords.points.length > 0) {
                        let ptsStr = '';
                        let startPx = null;

                        coords.points.forEach((pt, idx) => {
                            const px = (pt.x / 100) * canvasWidth;
                            const py = (pt.y / 100) * canvasHeight;
                            ptsStr += `${px},${py} `;
                            if (idx === 0) startPx = { x: px, y: py };
                        });

                        const svgPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                        svgPoly.setAttribute('class', 'cursor-pointer pointer-events-auto');
                        svgPoly.setAttribute('points', ptsStr.trim());
                        svgPoly.setAttribute('stroke', colorHex);
                        svgPoly.setAttribute('stroke-width', strokeWidthVal);
                        svgPoly.setAttribute('fill', `${colorHex}0d`); // 95% transparent (5% opacity)
                        svgPoly.addEventListener('click', (e) => handlePinClick(e, err));
                        vectorDrawingOverlay.appendChild(svgPoly);

                        if (startPx) {
                            const startGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                            startGroup.setAttribute('class', 'cursor-pointer pointer-events-auto');
                            startGroup.onclick = (e) => handlePinClick(e, err);

                            const badgeCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                            badgeCircle.setAttribute('cx', startPx.x);
                            badgeCircle.setAttribute('cy', startPx.y);
                            badgeCircle.setAttribute('r', dotRadius);
                            badgeCircle.setAttribute('fill', colorHex);

                            const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                            badgeText.setAttribute('x', startPx.x);
                            badgeText.setAttribute('y', startPx.y + (dotRadius * 0.35));
                            badgeText.setAttribute('fill', '#ffffff');
                            badgeText.setAttribute('font-weight', 'bold');
                            badgeText.setAttribute('font-size', `${dotRadius * 1.1}px`);
                            badgeText.setAttribute('text-anchor', 'middle');
                            badgeText.textContent = pinNumber;

                            startGroup.appendChild(badgeCircle);
                            startGroup.appendChild(badgeText);
                            vectorDrawingOverlay.appendChild(startGroup);
                        }
                    }
                } catch (e) {
                    console.error(`[Issue Render Debug] Error rendering shape #${err.id}:`, e);
                }
            } else if (err.tool_type === 'text') {
                        const pixelX = (err.x_percent / 100) * canvasWidth;
                        const pixelY = (err.y_percent / 100) * canvasHeight;
                        const labelText = err.description || 'Type text...';

                        let textAngle = 0;
                        let geomAngle = null;

                        // 1. Try parsing angle from geometry_data
                        if (err.geometry_data) {
                            try {
                                const coords = typeof err.geometry_data === 'string' ? JSON.parse(err.geometry_data) : err.geometry_data;
                                if (coords && typeof coords.angle === 'number') {
                                    geomAngle = coords.angle;
                                }
                            } catch (e) {}
                        }

                        // 2. Resolve angle: Prefer non-zero database column, fallback to geometry_data angle
                        if (typeof err.angle === 'number' && err.angle !== 0) {
                            textAngle = err.angle;
                        } else if (geomAngle !== null && geomAngle !== undefined) {
                            textAngle = geomAngle;
                        } else if (typeof err.angle === 'number') {
                            textAngle = err.angle;
                        }

                        console.log(`[Issue Render Debug] SVG text #${err.id} -> DB angle: ${err.angle}, geometry_data angle: ${geomAngle}, resolved angle: ${textAngle}°`);

                        const textGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                        textGroup.setAttribute('class', 'cursor-pointer pointer-events-auto');
                        textGroup.onclick = (e) => handlePinClick(e, err);

                        // Badge circle (Always upright at 0°)
                        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        circle.setAttribute('cx', pixelX);
                        circle.setAttribute('cy', pixelY);
                        circle.setAttribute('r', dotRadius * 0.85);
                        circle.setAttribute('fill', colorHex);

                        // Badge number (Always upright at 0°)
                        const numText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        numText.setAttribute('x', pixelX);
                        numText.setAttribute('y', pixelY + (dotRadius * 0.3));
                        numText.setAttribute('fill', '#ffffff');
                        numText.setAttribute('font-weight', 'bold');
                        numText.setAttribute('font-size', `${dotRadius * 0.9}px`);
                        numText.setAttribute('text-anchor', 'middle');
                        numText.textContent = pinNumber;

                        // Overlay Text string (Rotated around the badge center point)
                        const annotationText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        annotationText.id = `svg-text-element-${err.id}`;
                        annotationText.setAttribute('x', pixelX + dotRadius + 6);
                        annotationText.setAttribute('y', pixelY + (dotRadius * 0.35));
                        annotationText.setAttribute('fill', colorHex);
                        annotationText.setAttribute('font-weight', 'bold');
                        annotationText.setAttribute('font-size', `${dotRadius * 1.1}px`);
                        annotationText.setAttribute('xml:space', 'preserve');
                        
                        if (textAngle !== 0) {
                            annotationText.setAttribute('transform', `rotate(${textAngle}, ${pixelX}, ${pixelY})`);
                        }
                        annotationText.textContent = labelText;

                        textGroup.appendChild(circle);
                        textGroup.appendChild(numText);
                        textGroup.appendChild(annotationText);
                        vectorDrawingOverlay.appendChild(textGroup);
                    } else {
                // POINT TOOL: SVG Circle element drawn in unscaled PDF coordinate space
                const pixelX = (err.x_percent / 100) * canvasWidth;
                const pixelY = (err.y_percent / 100) * canvasHeight;

                console.log(`[Issue Render Debug] SVG point #${err.id} at (${pixelX.toFixed(1)}, ${pixelY.toFixed(1)})`);

                const pointGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                pointGroup.setAttribute('class', 'cursor-pointer pointer-events-auto');
                pointGroup.onclick = (e) => handlePinClick(e, err);

                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', pixelX);
                circle.setAttribute('cy', pixelY);
                circle.setAttribute('r', dotRadius);
                circle.setAttribute('fill', colorHex);
                circle.setAttribute('stroke-width', '3');

                const numText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                numText.setAttribute('x', pixelX);
                numText.setAttribute('y', pixelY + (dotRadius * 0.35));
                numText.setAttribute('fill', '#ffffff');
                numText.setAttribute('font-weight', 'bold');
                numText.setAttribute('font-size', `${dotRadius * 1.15}px`);
                numText.setAttribute('text-anchor', 'middle');
                numText.textContent = pinNumber;

                pointGroup.appendChild(circle);
                pointGroup.appendChild(numText);
                vectorDrawingOverlay.appendChild(pointGroup);
            }
        }
    });

    if (errorsToRender.length === 0) {
        sidebarList.innerHTML = '<p class="text-sm text-gray-400 italic">No Issues Logged Yet</p>';
        console.log('[Issue Render Debug] renderUI completed. No issues to list in sidebar.');
        return;
    }

    const emptyPlaceholder = sidebarList.querySelector('p');
    if (emptyPlaceholder) emptyPlaceholder.remove();

    const currentDatabaseIds = new Set(errorsToRender.map(err => err.id));
    const existingDOMCards = sidebarList.querySelectorAll('[data-card-issue-id]');
    existingDOMCards.forEach(card => {
        const issueId = card.getAttribute('data-card-issue-id');
        if (!currentDatabaseIds.has(issueId)) {
            card.remove();
        }
    });

    let inputToFocus = null;

errorsToRender.forEach((err, index) => {
        const pinNumber = err.error_number || '?';
        const isFixed = err.status === 'fixed';
        const userCanEdit = canEditIssue(err);
        
        const cardColorClass = isFixed ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800';
        const badgeColorClass = isFixed ? 'bg-emerald-600' : 'bg-red-600';

        let typePrefix = 'Point';
        if (err.tool_type === 'line') typePrefix = 'Line';
        if (err.tool_type === 'dash') typePrefix = 'Dash';
        if (err.tool_type === 'arrow') typePrefix = 'Arrow';
        if (err.tool_type === 'circle') typePrefix = 'Circle';
        if (err.tool_type === 'highlighter') typePrefix = 'Highlighter';
        if (err.tool_type === 'shape') typePrefix = 'Polygon';
        if (err.tool_type === 'text') typePrefix = 'Map Text';

        const creatorPrefix = err.created_by || '';
        const creatorColors = getUserColorStyle(creatorPrefix);

        const firstNameRaw = creatorPrefix ? creatorPrefix.split('.')[0].toLowerCase() : '';

        let formattedFirstName = '';
        if (firstNameRaw === 'mckenzie') {
            formattedFirstName = 'McKenzie';
        } else if (firstNameRaw) {
            formattedFirstName = firstNameRaw.charAt(0).toUpperCase() + firstNameRaw.slice(1);
        }

        const textHexOrClass = creatorColors.bg.replace(/^bg-/, 'text-');

        let displayCreator = creatorPrefix ? `
            <span class="text-xs italic">
                <span class="text-slate-400 font-normal">by</span> 
                <span class="font-bold saturate-75 opacity-90 ${textHexOrClass}">${formattedFirstName}</span>
            </span>
        ` : '';

        const fixerNorm = normUser(err.fixed_by);
        const uploaderNorm = normUser(getMapUploader());
        const isFixedByNonUploader = isFixed && fixerNorm && uploaderNorm && (fixerNorm !== uploaderNorm);

        if (isFixedByNonUploader) {
            const formattedFixer = formatDisplayName(err.fixed_by);
            const fixerColors = getUserColorStyle(err.fixed_by);
            const fixerTextClass = fixerColors.bg.replace(/^bg-/, 'text-');
            displayCreator += `
                <span class="text-xs italic ml-1">
                    <span class="text-slate-400 font-normal">fixed by</span> 
                    <span class="font-bold saturate-75 opacity-90 ${fixerTextClass}">${formattedFixer}</span>
                </span>
            `;
        }
        
        let item = sidebarList.querySelector(`[data-card-issue-id="${err.id}"]`);
        const isNewCard = !item;

        if (isNewCard) {
            item = document.createElement('div');
            item.setAttribute('data-card-issue-id', err.id);
            item.className = `p-3 border rounded-lg shadow-sm text-sm flex flex-col relative group transition duration-150 ${cardColorClass}`;
            
            item.innerHTML = `
                <div class="flex justify-between items-start mb-1.5">
                    <div class="flex items-center space-x-1.5 flex-1 cursor-pointer status-badge-zone">
                        <span class="badge-number text-white rounded-full w-5 h-5 text-xs flex items-center justify-center font-bold"></span>
                        <span class="type-badge text-[9px] font-bold text-slate-500 bg-slate-200/80 px-1 rounded"></span>
                        <span class="status-badge text-[10px] font-bold tracking-wide uppercase px-1 py-0.5 rounded"></span>
                        <span class="creator-badge"></span>
                    </div>
                    <button class="delete-pin-btn text-xs text-gray-400 hover:text-red-600 font-bold transition opacity-0 group-hover:opacity-100 cursor-pointer p-0.5 rounded hover:bg-gray-200/50">Delete</button>
                </div>
                <div class="w-full mt-1 space-y-2">
                    <textarea id="input-${err.id}" rows="1" oninput="this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px';" class="w-full border border-slate-300 rounded px-2 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 select-text resize-none overflow-hidden block" style="height: auto; min-height: 28px;"></textarea>
                    <div class="annotation-layer-container flex flex-col space-y-0.5 hidden">
                        <label class="text-[10px] font-bold text-slate-400 tracking-tight uppercase">Annotation Layer</label>
                        <select id="layer-select-${err.id}" class="w-full bg-slate-100 border border-slate-300 rounded px-1.5 py-1 text-[11px] font-semibold text-slate-700 focus:outline-none cursor-pointer">
                        </select>
                    </div>
                </div>
            `;
        } else {
            item.className = `p-3 border rounded-lg shadow-sm text-sm flex flex-col relative group transition duration-150 ${cardColorClass}`;
        }

        const badgeNum = item.querySelector('.badge-number');
        badgeNum.className = `badge-number ${badgeColorClass} text-white rounded-full w-5 h-5 text-xs flex items-center justify-center font-bold`;
        badgeNum.innerText = pinNumber;

        item.querySelector('.type-badge').innerText = typePrefix;

        const statusB = item.querySelector('.status-badge');
        statusB.className = `status-badge text-[10px] font-bold tracking-wide uppercase px-1 py-0.5 rounded ${isFixed ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800'}`;
        statusB.innerText = err.status;

        item.querySelector('.creator-badge').innerHTML = displayCreator;

        const deleteBtn = item.querySelector('.delete-pin-btn');
        if ((typeof activeTool !== 'undefined' && activeTool === 'view') || !userCanEdit) {
            deleteBtn.classList.add('hidden');
        } else {
            deleteBtn.classList.remove('hidden');
        }

        const selectDropdown = item.querySelector(`#layer-select-${err.id}`);
        const layerContainer = item.querySelector('.annotation-layer-container');
        
        if (err.tool_type === 'text') {
            layerContainer.classList.remove('hidden');
            
            if (document.activeElement !== selectDropdown) {
                const defaultOptionSelected = (!err.gis_layer) ? 'selected' : '';
                let layerOptionsHTML = `<option value="" ${defaultOptionSelected}>--- Select Layer (Unassigned) ---</option>`;
                if (typeof GIS_LAYERS_REGISTRY !== 'undefined') {
                    GIS_LAYERS_REGISTRY.forEach(layerName => {
                        const isSelected = err.gis_layer === layerName ? 'selected' : '';
                        layerOptionsHTML += `<option value="${layerName}" ${isSelected}>${layerName}</option>`;
                    });
                }
                selectDropdown.innerHTML = layerOptionsHTML;
            }
        } else {
            layerContainer.classList.add('hidden');
        }

        const inlineInput = item.querySelector(`#input-${err.id}`);
        inlineInput.placeholder = err.tool_type === 'text' ? 'Type text to overlay on map...' : 'Type error description...';
        
        if (document.activeElement !== inlineInput) {
            inlineInput.value = err.description || '';
        }

        if (userCanEdit) {
            inlineInput.removeAttribute('readonly');
            inlineInput.classList.remove('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
            inlineInput.classList.add('bg-white', 'text-slate-800');
        } else {
            inlineInput.setAttribute('readonly', 'true');
            inlineInput.classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
            inlineInput.classList.remove('bg-white', 'text-slate-800');
        }

        const badgeZone = item.querySelector(`.status-badge-zone`);
        badgeZone.replaceWith(badgeZone.cloneNode(true));
        item.querySelector(`.status-badge-zone`).addEventListener('click', () => togglePinStatus(err.id, err.status));
        
        if (err.tool_type === 'text') {
            if (isNewCard && userCanEdit) {
                inlineInput.addEventListener('input', () => {
                    const localErr = activeErrors.find(e => e.id === err.id);
                    if (localErr) localErr.description = inlineInput.value;
                    
                    // Directly update map SVG text element without re-rendering entire UI
                    const svgTextEl = document.getElementById(`svg-text-element-${err.id}`);
                    if (svgTextEl) {
                        svgTextEl.textContent = inlineInput.value || 'Type text...';
                    }
                });
                inlineInput.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') inlineInput.blur();
                });
                inlineInput.addEventListener('keyup', (e) => e.stopPropagation());
                inlineInput.addEventListener('blur', () => saveInlineDescription(err.id, inlineInput.value));

                selectDropdown.addEventListener('change', (e) => { saveInlineLayer(err.id, e.target.value); });
            }
            if (userCanEdit && typeof newlyCreatedPinId !== 'undefined' && err.id === newlyCreatedPinId) inputToFocus = inlineInput;
        } else {
            if (isNewCard && userCanEdit) {
                inlineInput.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') inlineInput.blur();
                });
                inlineInput.addEventListener('keyup', (e) => e.stopPropagation());
                inlineInput.addEventListener('blur', () => saveInlineDescription(err.id, inlineInput.value));
            }
            if (userCanEdit && typeof newlyCreatedPinId !== 'undefined' && err.id === newlyCreatedPinId) inputToFocus = inlineInput;
        }

        const finalDelBtn = item.querySelector('.delete-pin-btn');
        if (isNewCard && userCanEdit) {
            finalDelBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await supabaseClient.from('map_errors').delete().eq('id', err.id);
                fetchPins();
            });
        }

        if (isNewCard) {
            sidebarList.appendChild(item);
        } else {
            if (sidebarList.children[index] !== item) {
                sidebarList.insertBefore(item, sidebarList.children[index]);
            }
        }
    });

    document.querySelectorAll('#sidebarList textarea').forEach(textarea => {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    });

    if (sidebarList) {
        sidebarList.scrollTop = sidebarScrollPosition;
    }

    if (inputToFocus) {
        const isInitialCreation = typeof newlyCreatedPinId !== 'undefined' && newlyCreatedPinId !== null;
        setTimeout(() => {
            inputToFocus.focus();
            if (isInitialCreation && typeof activeTool !== 'undefined' && activeTool === 'text') {
                inputToFocus.select();
            }
            if (typeof newlyCreatedPinId !== 'undefined') newlyCreatedPinId = null; 
        }, 50);
    } else if (activeInputId) {
        const inputToRestore = document.getElementById(activeInputId);
        if (inputToRestore && document.activeElement !== inputToRestore) {
            inputToRestore.focus();
            if (inputToRestore.tagName === 'TEXTAREA') {
                try {
                    inputToRestore.setSelectionRange(selectionStart, selectionEnd);
                } catch (err) {}
            }
        }
    }

    console.log('[Issue Render Debug] renderUI completed successfully.');
}