// Safe Global State Initialization
if (typeof window.activeErrors === 'undefined') window.activeErrors = [];
if (typeof window.pinsVisible === 'undefined') window.pinsVisible = true;
if (typeof window.fixedPinsVisible === 'undefined') window.fixedPinsVisible = true;
if (typeof window.sidebarScrollPosition === 'undefined') window.sidebarScrollPosition = 0;
if (typeof window.currentActivePopoverId === 'undefined') window.currentActivePopoverId = null;
if (typeof window.newlyCreatedPinId === 'undefined') window.newlyCreatedPinId = null;

// Safe global initialization for cached comments, attachments & open drawers
if (typeof window.openCommentDrawers === 'undefined') window.openCommentDrawers = new Set();
if (typeof window.activeComments === 'undefined') window.activeComments = {};
if (typeof window.activeAttachments === 'undefined') window.activeAttachments = {};

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

// Global outside click listener
document.addEventListener('click', (e) => {
    if (!e.target.closest('.layer-picker-wrapper')) {
        document.querySelectorAll('.layer-menu').forEach(m => m.classList.add('hidden'));
    }

    // Ignore map interactions, SVG drawing overlay, or panning completely
    if (e.target.closest('#mapViewport') || e.target.closest('.leaflet-container') || e.target.closest('#vectorDrawingOverlay')) {
        return;
    }

    // Check outside clicks for comments
    if (!e.target.closest('.comments-drawer') && !e.target.closest('[id^="comment-btn-"]')) {
        document.querySelectorAll('.comments-drawer').forEach(drawer => {
            const errIdRaw = drawer.id.replace('comments-drawer-', '');
            const errId = isNaN(errIdRaw) ? errIdRaw : Number(errIdRaw);
            const input = document.getElementById(`user-comment-input-${errId}`);
            
            const hasSavedComments = drawer.querySelectorAll('.saved-comment-card').length > 0;
            const hasInputText = input && input.value.trim().length > 0;

            if (hasSavedComments || hasInputText) {
                return;
            }

            window.openCommentDrawers.delete(errId);
            window.openCommentDrawers.delete(String(errId));
            drawer.classList.add('hidden');
        });
    }
});

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
// TIFF STUFF (Flashing Fixed)
if (typeof window.tiffCache === 'undefined') window.tiffCache = {};

async function loadTiffImage(imgEl, tiffUrl, onComplete) {
    if (!tiffUrl || !imgEl) return;

    // Return immediately if already cached in memory
    if (window.tiffCache[tiffUrl]) {
        const cachedData = window.tiffCache[tiffUrl];
        if (imgEl.src !== cachedData) {
            imgEl.src = cachedData;
            imgEl.setAttribute('data-src', cachedData);
            imgEl.classList.remove('opacity-40', 'animate-pulse');
        }
        if (onComplete) onComplete();
        return;
    }

    // Load UTIF decoder library dynamically if missing
    if (typeof UTIF === 'undefined') {
        try {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        } catch (err) {
            console.error('[TIFF Loader] Failed to load UTIF.js:', err);
            return;
        }
    }

    try {
        const response = await fetch(tiffUrl);
        const arrayBuffer = await response.arrayBuffer();
        const ifds = UTIF.decode(arrayBuffer);

        if (ifds && ifds.length > 0) {
            const firstPage = ifds[0];
            UTIF.decodeImage(arrayBuffer, firstPage);
            const rgba = UTIF.toRGBA8(firstPage);

            const canvas = document.createElement('canvas');
            canvas.width = firstPage.width;
            canvas.height = firstPage.height;
            const ctx = canvas.getContext('2d');
            const imgData = ctx.createImageData(firstPage.width, firstPage.height);
            imgData.data.set(rgba);
            ctx.putImageData(imgData, 0, 0);

            const pngUrl = canvas.toDataURL('image/png');

            // Store in global cache for 0ms subsequent renders
            window.tiffCache[tiffUrl] = pngUrl;

            imgEl.src = pngUrl;
            imgEl.setAttribute('data-src', pngUrl);
            imgEl.classList.remove('opacity-40', 'animate-pulse');

            if (onComplete) onComplete();
        }
    } catch (e) {
        console.error('[TIFF Decode Error]', e);
    }
}

// Lightweight modal viewer (Restored backdrop blur, neutral X button off image)
function openImageModal(imgSrc) {
    let modal = document.getElementById('custom-image-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'custom-image-modal';
        modal.className = 'fixed inset-0 z-[9999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-6 hidden';
        modal.innerHTML = `
            <div class="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center">
                <button id="close-image-modal-btn" type="button" title="Close" class="absolute -top-5 -right-5 text-slate-700 hover:text-slate-950 bg-white hover:bg-slate-100 rounded-full w-9 h-9 text-base font-bold cursor-pointer transition shadow-xl flex items-center justify-center z-50 border border-slate-200">✕</button>
                <img id="custom-modal-img" src="" alt="Preview" class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
            </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => modal.classList.add('hidden');
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('#close-image-modal-btn')) closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
        });
    }
    document.getElementById('custom-modal-img').src = imgSrc;
    modal.classList.remove('hidden');
}

async function initUserIdentifier() {
    try {
        if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) {
            const { data } = await supabaseClient.auth.getUser();
            if (data?.user) {
                const u = data.user;
                if (u.email) { window.cachedUserIdent = u.email.split('@')[0]; return window.cachedUserIdent; }
                if (u.user_metadata?.full_name) { window.cachedUserIdent = u.user_metadata.full_name; return window.cachedUserIdent; }
                if (u.user_metadata?.name) { window.cachedUserIdent = u.user_metadata.name; return window.cachedUserIdent; }
            }
        }
    } catch (e) {}

    const globUser = (typeof window.currentUser !== 'undefined' && window.currentUser) ? window.currentUser : (typeof currentUser !== 'undefined' ? currentUser : null);
    if (globUser) {
        if (typeof globUser === 'string') { window.cachedUserIdent = globUser.includes('@') ? globUser.split('@')[0] : globUser; return window.cachedUserIdent; }
        if (globUser.email) { window.cachedUserIdent = globUser.email.split('@')[0]; return window.cachedUserIdent; }
    }

    const badge = document.getElementById('userBadge');
    if (badge && badge.innerText && badge.innerText.trim()) {
        const text = badge.innerText.trim();
        window.cachedUserIdent = text.includes('@') ? text.split('@')[0] : text;
        return window.cachedUserIdent;
    }
    return window.cachedUserIdent || '';
}

function getCurrentUserIdentifierSync() {
    if (!window.cachedUserIdent) {
        initUserIdentifier();
    }
    return window.cachedUserIdent || 'staff';
}

async function getCurrentUserIdentifier() {
    if (window.cachedUserIdent) return window.cachedUserIdent;
    return await initUserIdentifier();
}

function getMapUploader(err) {
    if (!err) return '';

    // 1. Direct schema relation: map_errors -> maps_registry -> map_groups -> created_by
    if (err.maps_registry?.map_groups?.created_by) {
        return err.maps_registry.map_groups.created_by;
    }

    // 2. Fallbacks for globally held map/group objects
    const m = (typeof window.currentMap !== 'undefined' && window.currentMap) || (typeof currentMap !== 'undefined' && currentMap) || null;
    if (m?.uploaded_by || m?.created_by) return m.uploaded_by || m.created_by;

    const g = (typeof window.currentGroup !== 'undefined' && window.currentGroup) || (typeof currentGroup !== 'undefined' && currentGroup) || null;
    if (g?.created_by || g?.uploaded_by) return g.created_by || g.uploaded_by;

    return '';
}

function normUser(val) {
    if (!val) return '';
    const emailUser = String(val).toLowerCase().trim().split('@')[0];
    return emailUser.split('.')[0];
}

function formatDisplayName(identifier) {
    if (!identifier) return '';
    const raw = identifier.split('@')[0].split('.')[0].toLowerCase();
    return raw === 'mckenzie' ? 'McKenzie' : raw.charAt(0).toUpperCase() + raw.slice(1);
}

function canEditIssue(err) {
    if (!err || !err.created_by) return true;
    const currentIdent = getCurrentUserIdentifierSync();
    if (!currentIdent) return true;

    const userNorm = currentIdent.toLowerCase().trim().split('@')[0];
    const creatorNorm = err.created_by.toLowerCase().trim().split('@')[0];

    return userNorm === creatorNorm;
}

if (typeof window.isZoomingToIssue === 'undefined') window.isZoomingToIssue = false;

function zoomToIssue(err) {
    if (!err || window.isZoomingToIssue) return;

    let canvasWidth = 1000;
    let canvasHeight = 1000;
    if (typeof currentMapBounds !== 'undefined' && currentMapBounds && currentMapBounds[1]) {
        canvasHeight = currentMapBounds[1][0];
        canvasWidth = currentMapBounds[1][1];
    }

    let minXPct = parseFloat(err.x_percent);
    let maxXPct = parseFloat(err.x_percent);
    let minYPct = parseFloat(err.y_percent);
    let maxYPct = parseFloat(err.y_percent);

    if (isNaN(minXPct) || isNaN(minYPct)) return;

    let parsedCoords = null;
    if (err.geometry_data) {
        try {
            parsedCoords = typeof err.geometry_data === 'string' ? JSON.parse(err.geometry_data) : err.geometry_data;
        } catch (e) {}
    }

    if (err.tool_type === 'shape' && parsedCoords && Array.isArray(parsedCoords.points) && parsedCoords.points.length > 0) {
        const xs = parsedCoords.points.map(p => p.x);
        const ys = parsedCoords.points.map(p => p.y);
        minXPct = Math.min(...xs);
        maxXPct = Math.max(...xs);
        minYPct = Math.min(...ys);
        maxYPct = Math.max(...ys);
    }
    else if (err.tool_type === 'circle' && parsedCoords && typeof parsedCoords.cx === 'number' && typeof parsedCoords.edgeX === 'number') {
        const cx = parsedCoords.cx;
        const cy = parsedCoords.cy;
        const edgeX = parsedCoords.edgeX;
        const edgeY = parsedCoords.edgeY;

        const radiusXPct = Math.abs(edgeX - cx);
        const radiusYPct = Math.abs(edgeY - cy);
        const radiusPct = Math.hypot(radiusXPct, (radiusYPct * canvasHeight) / canvasWidth);

        minXPct = cx - radiusPct;
        maxXPct = cx + radiusPct;
        minYPct = cy - (radiusPct * canvasWidth) / canvasHeight;
        maxYPct = cy + (radiusPct * canvasWidth) / canvasHeight;
    }
    else if ((err.tool_type === 'line' || err.tool_type === 'dash' || err.tool_type === 'arrow' || err.tool_type === 'highlight') &&
             parsedCoords && typeof parsedCoords.x1 === 'number' && typeof parsedCoords.x2 === 'number') {
        minXPct = Math.min(parsedCoords.x1, parsedCoords.x2);
        maxXPct = Math.max(parsedCoords.x1, parsedCoords.x2);
        minYPct = Math.min(parsedCoords.y1, parsedCoords.y2);
        maxYPct = Math.max(parsedCoords.y1, parsedCoords.y2);
    }
    else if (err.tool_type === 'text') {
        const textStr = (err.description || 'Type text...').trim();
        const charCount = Math.max(textStr.length, 5);

        const sizeKey = (err.issue_size || 'medium').toLowerCase();
        const fallbackSizes = { small: 13, medium: 18, large: 25 };
        const baseSize = (typeof ISSUE_SIZES !== 'undefined' && ISSUE_SIZES[sizeKey])
            ? ISSUE_SIZES[sizeKey]
            : fallbackSizes[sizeKey] || 18;

        const approxWidthPx = charCount * (baseSize * 0.65);
        const approxHeightPx = baseSize * 1.5;

        const widthPct = (approxWidthPx / canvasWidth) * 100;
        const heightPct = (approxHeightPx / canvasHeight) * 100;

        const angleDeg = err.angle || (parsedCoords && parsedCoords.angle) || 0;
        const angleRad = (angleDeg * Math.PI) / 180;
        const boundingWidthPct = Math.abs(widthPct * Math.cos(angleRad)) + Math.abs(heightPct * Math.sin(angleRad));
        const boundingHeightPct = Math.abs(widthPct * Math.sin(angleRad)) + Math.abs(heightPct * Math.cos(angleRad));

        const originX = parseFloat(err.x_percent);
        const originY = parseFloat(err.y_percent);

        minXPct = originX - 1;
        maxXPct = originX + boundingWidthPct + 1;
        minYPct = originY - (boundingHeightPct / 2) - 1;
        maxYPct = originY + (boundingHeightPct / 2) + 1;
    }
    else {
        const paddingPct = 2;
        minXPct = minXPct - paddingPct;
        maxXPct = maxXPct + paddingPct;
        minYPct = minYPct - paddingPct;
        maxYPct = maxYPct + paddingPct;
    }

    const minPixelX = (minXPct / 100) * canvasWidth;
    const maxPixelX = (maxXPct / 100) * canvasWidth;
    const minPixelY = (minYPct / 100) * canvasHeight;
    const maxPixelY = (maxYPct / 100) * canvasHeight;

    const southWest = [canvasHeight - maxPixelY, minPixelX];
    const northEast = [canvasHeight - minPixelY, maxPixelX];

    window.isZoomingToIssue = true;

    let zoomTimeout = null;
    const unlockZoom = () => {
        window.isZoomingToIssue = false;
        if (zoomTimeout) clearTimeout(zoomTimeout);
    };

    zoomTimeout = setTimeout(unlockZoom, 1200);

    if (typeof leafletMap !== 'undefined' && leafletMap) {
        leafletMap.stop();
        leafletMap.once('moveend', unlockZoom);

        leafletMap.flyToBounds([southWest, northEast], {
            padding: [80, 80],
            maxZoom: 2.0,
            duration: 1.0,
            easeLinearity: 0.25
        });
    } 
    else if (typeof panzoomInstance !== 'undefined' && panzoomInstance) {
        const centerXPct = (minXPct + maxXPct) / 2;
        const centerYPct = (minYPct + maxYPct) / 2;
        const centerPixelX = (centerXPct / 100) * canvasWidth;
        const centerPixelY = (centerYPct / 100) * canvasHeight;

        const viewport = document.getElementById('mapViewport');
        if (viewport) {
            const rect = viewport.getBoundingClientRect();
            panzoomInstance.zoom(1.5, { animate: true });
            panzoomInstance.pan(-centerPixelX + (rect.width / 2), -centerPixelY + (rect.height / 2), { animate: true });
        }
        setTimeout(unlockZoom, 500);
    } else {
        unlockZoom();
    }
}

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
    if (err.tool_type === 'highlight') typeLabel = 'Highlight';
    if (err.tool_type === 'shape') typeLabel = 'Shape';
    if (err.tool_type === 'text') typeLabel = 'Text';

    currentActivePopoverId = err.id;

    if (popoverBadge) {
        popoverBadge.className = `rounded-full w-5 h-5 text-[10px] flex items-center justify-center font-bold ${isFixed ? 'bg-emerald-600' : 'bg-red-600'}`;
        popoverBadge.innerText = pinNum;
    }
    const fixerNorm = normUser(err.fixed_by);
    const uploaderNorm = normUser(getMapUploader(err));
    const isFixedByNonUploader = isFixed && fixerNorm && (fixerNorm !== uploaderNorm);

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
}

async function saveInlineLayer(pinId, selectedLayer) {
    const targetValue = selectedLayer === "" ? null : selectedLayer;
    const localErr = activeErrors.find(e => e.id === pinId);
    if (localErr) localErr.gis_layer = targetValue;

    const card = document.querySelector(`[data-card-issue-id="${pinId}"]`);
    if (card) {
        const btnText = card.querySelector('.layer-btn-text');
        if (btnText) btnText.textContent = targetValue || '';
    }

    await supabaseClient.from('map_errors').update({ gis_layer: targetValue }).eq('id', pinId);
}

async function togglePinStatus(pinId, currentStatus) {
    const nextStatus = currentStatus === 'fixed' ? 'open' : 'fixed';
    
    let fixerIdent = null;
    if (nextStatus === 'fixed') {
        fixerIdent = getCurrentUserIdentifierSync();
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
        return;
    }
    e.stopPropagation();
    triggerIssuePopover(e, err);
}

async function fetchPins() {
    if (typeof currentMapId === 'undefined' || !currentMapId) return;

    const activeEl = document.activeElement;
    const isUserEditing = activeEl && sidebarList && sidebarList.contains(activeEl) && 
        (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT');

    if (isUserEditing && !newlyCreatedPinId) return;

    if (sidebarList) sidebarScrollPosition = sidebarList.scrollTop;

    await initUserIdentifier();

    // Fetch pins with nested join to get map_groups.created_by
    const { data: errors, error } = await supabaseClient
        .from('map_errors')
        .select(`
            *,
            maps_registry (
                group_id,
                map_groups (
                    created_by
                )
            )
        `)
        .eq('map_id', currentMapId)
        .order('error_number', { ascending: true });

    if (!error && errors) { 
        activeErrors = errors; 

        // Batch fetch comments AND attachments for all issues to populate cache
        const issueIds = activeErrors.map(e => e.id);
        if (issueIds.length > 0) {
            const [{ data: commentsData }, { data: attachmentsData }] = await Promise.all([
                supabaseClient.from('map_error_comments').select('*').in('error_id', issueIds).order('created_at', { ascending: true }),
                supabaseClient.from('map_error_attachments').select('*').in('error_id', issueIds).order('created_at', { ascending: true })
            ]);

            window.activeComments = {};
            if (commentsData) {
                commentsData.forEach(c => {
                    if (!window.activeComments[c.error_id]) window.activeComments[c.error_id] = [];
                    window.activeComments[c.error_id].push(c);
                });
            }

            window.activeAttachments = {};
            if (attachmentsData) {
                attachmentsData.forEach(a => {
                    if (!window.activeAttachments[a.error_id]) window.activeAttachments[a.error_id] = [];
                    window.activeAttachments[a.error_id].push(a);
                });
            }
        }

        renderUI(); 
    }
}

// Synchronous Comment Renderer (No divider line between comments)
function renderCommentsSync(err, item, forceShowInput = false) {
    const commentsDrawer = item.querySelector(`#comments-drawer-${err.id}`);
    const commentsList = item.querySelector(`#comments-list-${err.id}`);
    if (!commentsList || !commentsDrawer) return;

    const currentIdent = getCurrentUserIdentifierSync();
    const currentNorm = typeof normUser === 'function' ? normUser(currentIdent) : currentIdent.toLowerCase().trim().split('@')[0];
    
    const currentFirst = typeof formatDisplayName === 'function' ? formatDisplayName(currentIdent) : (currentIdent ? currentIdent.split('@')[0] : '');
    const currentColors = typeof getUserColorStyle === 'function' ? getUserColorStyle(currentIdent) : { bg: 'bg-indigo-600', text: 'text-indigo-600' };
    const currentTextClass = currentColors.bg ? currentColors.bg.replace(/^bg-/, 'text-') : 'text-indigo-600';

    const safeComments = (window.activeComments && window.activeComments[err.id]) || [];
    
    // Locate the current user's own saved comment (if any exists)
    const userComment = safeComments.find(c => {
        const authorNorm = typeof normUser === 'function' ? normUser(c.created_by) : (c.created_by || '').toLowerCase().trim().split('@')[0];
        return authorNorm && authorNorm === currentNorm;
    });

    const isDrawerTrackedOpen = window.openCommentDrawers.has(err.id) || window.openCommentDrawers.has(String(err.id));
    const shouldBeOpen = safeComments.length > 0 || isDrawerTrackedOpen || forceShowInput;

    if (shouldBeOpen) {
        commentsDrawer.classList.remove('hidden');
    } else {
        commentsDrawer.classList.add('hidden');
    }

    const isFixedCard = err.status === 'fixed';
    const commentCardClass = isFixedCard ? 'bg-[#ecfdf5]' : 'bg-[#fef2f2]';
    const inputCardClass = isFixedCard ? 'bg-[#ecfdf5]' : 'bg-[#fef2f2]';

    let listHtml = '';

    // 1. READ-ONLY COMMENTS (No background box/border line, clean text flow)
    safeComments.filter(c => c !== userComment).forEach(c => {
        const name = typeof formatDisplayName === 'function' ? formatDisplayName(c.created_by) : (c.created_by ? c.created_by.split('@')[0] : '');
        const colors = typeof getUserColorStyle === 'function' ? getUserColorStyle(c.created_by) : { bg: 'bg-indigo-600', text: 'text-indigo-600' };
        const textClass = colors.bg ? colors.bg.replace(/^bg-/, 'text-') : 'text-indigo-600';

        listHtml += `
            <div class="saved-comment-card ${commentCardClass} p-1 rounded">
                <div class="mb-0.5">
                    <span class="text-xs italic">
                        <span class="font-bold saturate-75 opacity-90 ${textClass}">${name}</span>
                        <span class="text-slate-400 font-normal">replied</span>
                    </span>
                </div>
                <div class="text-xs text-slate-800 font-medium whitespace-pre-wrap leading-tight break-words px-0.5">${c.comment_text}</div>
            </div>
        `;
    });

const userCommentText = userComment ? userComment.comment_text : '';
    const userCommentId = userComment ? userComment.id : null;

    // --- ADD THE LINES HERE ---
    const commentBtn = item.querySelector(`#comment-btn-${err.id}`);
    if (commentBtn) {
        if (userCommentText || userCommentId) {
            commentBtn.classList.add('hidden');
        } else {
            commentBtn.classList.remove('hidden');
        }
    }
    // --------------------------

    // 2. CURRENT USER'S EDITABLE REPLY BOX
    const showUserInput = Boolean(userCommentId) || forceShowInput;

    if (showUserInput) {
        listHtml += `
            <div id="user-comment-zone-${err.id}" class="saved-comment-card ${inputCardClass} p-1 rounded">
                <div class="mb-0.5">
                    <span class="text-xs italic">
                        <span class="font-bold saturate-75 opacity-90 ${currentTextClass}">${currentFirst}</span>
                        <span class="text-slate-400 font-normal">replied</span>
                    </span>
                </div>
                <div class="relative w-full flex items-center">
                    <textarea id="user-comment-input-${err.id}" rows="1" placeholder="Write a reply..." class="w-full border border-slate-300 rounded pl-2 ${userCommentText ? 'pr-5' : 'pr-2'} py-1 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500 select-text resize-none block bg-white/90 leading-tight" style="height: auto; min-height: 26px;">${userCommentText}</textarea>
                    ${userCommentText ? `<button id="delete-user-comment-${err.id}" type="button" title="Delete reply" class="absolute right-1 text-xs text-red-400 hover:text-red-600 font-bold cursor-pointer transition px-0.5 z-10">✕</button>` : ''}
                </div>
            </div>
        `;
    }

    // Ensure list container has no divide-y classes or borders
    commentsList.className = "space-y-1 max-h-40 overflow-y-auto text-xs";
    commentsList.innerHTML = listHtml;

    const commentInput = commentsList.querySelector(`#user-comment-input-${err.id}`);
    const deleteCommentBtn = commentsList.querySelector(`#delete-user-comment-${err.id}`);

    if (commentInput) {
        commentInput.style.height = 'auto';
        commentInput.style.height = commentInput.scrollHeight + 'px';

        const commitComment = async () => {
            const val = commentInput.value.trim();

            if (!val) {
                if (userCommentId) {
                    if (window.activeComments[err.id]) {
                        window.activeComments[err.id] = window.activeComments[err.id].filter(c => c.id !== userCommentId);
                    }
                    await supabaseClient.from('map_error_comments').delete().eq('id', userCommentId);
                }
                const hasOtherComments = safeComments.filter(c => c !== userComment).length > 0;
                if (!hasOtherComments) {
                    window.openCommentDrawers.delete(err.id);
                    window.openCommentDrawers.delete(String(err.id));
                }
                renderCommentsSync(err, item, false);
                return;
            }

            const payload = {
                ...(userCommentId ? { id: userCommentId } : {}),
                error_id: err.id,
                created_by: currentIdent,
                comment_text: val
            };

            if (!window.activeComments[err.id]) window.activeComments[err.id] = [];
            const existingIndex = window.activeComments[err.id].findIndex(c => {
                const authorNorm = typeof normUser === 'function' ? normUser(c.created_by) : (c.created_by || '').toLowerCase().trim().split('@')[0];
                return authorNorm === currentNorm;
            });

            if (existingIndex >= 0) {
                window.activeComments[err.id][existingIndex].comment_text = val;
            } else {
                window.activeComments[err.id].push(payload);
            }

            renderCommentsSync(err, item, true);

            const { data: upsertRes } = await supabaseClient
                .from('map_error_comments')
                .upsert([payload], { onConflict: 'error_id,created_by' })
                .select();

            if (upsertRes && upsertRes.length > 0) {
                const updatedIndex = window.activeComments[err.id].findIndex(c => {
                    const authorNorm = typeof normUser === 'function' ? normUser(c.created_by) : (c.created_by || '').toLowerCase().trim().split('@')[0];
                    return authorNorm === currentNorm;
                });
                if (updatedIndex >= 0) window.activeComments[err.id][updatedIndex].id = upsertRes[0].id;
            }
        };

        commentInput.addEventListener('input', () => {
            commentInput.style.height = 'auto';
            commentInput.style.height = commentInput.scrollHeight + 'px';
        });

        commentInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commentInput.blur();
            }
        });
        commentInput.addEventListener('keyup', (e) => e.stopPropagation());

        commentInput.addEventListener('blur', () => {
            commitComment();
        });
    }

    if (deleteCommentBtn) {
        deleteCommentBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        deleteCommentBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();

            if (window.activeComments[err.id]) {
                window.activeComments[err.id] = window.activeComments[err.id].filter(c => {
                    const authorNorm = typeof normUser === 'function' ? normUser(c.created_by) : (c.created_by || '').toLowerCase().trim().split('@')[0];
                    return authorNorm !== currentNorm;
                });
            }

            if (userCommentId) {
                await supabaseClient.from('map_error_comments').delete().eq('id', userCommentId);
            }

            const remainingComments = (window.activeComments[err.id] || []).length;
            if (remainingComments === 0) {
                window.openCommentDrawers.delete(err.id);
                window.openCommentDrawers.delete(String(err.id));
            }

            renderCommentsSync(err, item, false);
        });
    }
}

// Main UI Rendering Pipeline
function renderUI() {
    var vectorDrawingOverlay = document.getElementById('vectorDrawingOverlay');
    var sidebarList = document.getElementById('sidebarList');

    if (!vectorDrawingOverlay || !sidebarList) {
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

    errorsToRender.forEach((err) => {
        const pinNumber = err.error_number || '?';
        const isFixed = err.status === 'fixed';
        const colorHex = isFixed ? '#059669' : '#dc2626';

        let showOnMap = true;
        if (!isFixed && typeof pinsVisible !== 'undefined' && !pinsVisible) showOnMap = false;
        if (isFixed && typeof fixedPinsVisible !== 'undefined' && !fixedPinsVisible) showOnMap = false;

        if (showOnMap) {
            const defaultKey = typeof DEFAULT_ISSUE_SIZE !== 'undefined' ? DEFAULT_ISSUE_SIZE : 'medium';
            const rawSizeKey = (err.issue_size || defaultKey).toLowerCase();
            
            let sizeKey = 'medium';
            if (rawSizeKey === 'small' || rawSizeKey === 's') sizeKey = 'small';
            else if (rawSizeKey === 'large' || rawSizeKey === 'l') sizeKey = 'large';

            const fallbackSizes = { small: 13, medium: 18, large: 25 };
            const baseSize = (typeof ISSUE_SIZES !== 'undefined' && ISSUE_SIZES[sizeKey])
                ? ISSUE_SIZES[sizeKey]
                : fallbackSizes[sizeKey];

            const pointradius = baseSize;
            const strokeWidthVal = Math.round(baseSize * (8 / 18));

            if (err.tool_type === 'line' || err.tool_type === 'dash' || err.tool_type === 'arrow') {
                try {
                    const coords = typeof err.geometry_data === 'string' ? JSON.parse(err.geometry_data) : err.geometry_data;
                    if (coords) {
                        const pixelX1 = (coords.x1 / 100) * canvasWidth;
                        const pixelY1 = (coords.y1 / 100) * canvasHeight;
                        const pixelX2 = (coords.x2 / 100) * canvasWidth;
                        const pixelY2 = (coords.y2 / 100) * canvasHeight;

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
                        
                        const startGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                        startGroup.setAttribute('class', 'cursor-pointer pointer-events-auto');
                        startGroup.onclick = (e) => handlePinClick(e, err);

                        const startCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        startCircle.setAttribute('cx', pixelX1);
                        startCircle.setAttribute('cy', pixelY1);
                        startCircle.setAttribute('r', pointradius);
                        startCircle.setAttribute('fill', colorHex);
                        startCircle.setAttribute('stroke-width', '3');

                        const startText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        startText.setAttribute('x', pixelX1);
                        startText.setAttribute('y', pixelY1 + (pointradius * 0.35));
                        startText.setAttribute('fill', '#ffffff');
                        startText.setAttribute('font-weight', 'bold');
                        startText.setAttribute('font-size', `${pointradius * 1.1}px`);
                        startText.setAttribute('text-anchor', 'middle');
                        startText.textContent = pinNumber;

                        startGroup.appendChild(startCircle);
                        startGroup.appendChild(startText);
                        vectorDrawingOverlay.appendChild(startGroup);
                    }
                } catch (e) {
                    console.error(`Error rendering line #${err.id}:`, e);
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
                        svgCircle.setAttribute('fill', `${colorHex}0d`);
                        svgCircle.addEventListener('click', (e) => handlePinClick(e, err));
                        vectorDrawingOverlay.appendChild(svgCircle);

                        const badgeX = pixelCx - radius;
                        const badgeY = pixelCy;

                        const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                        edgeGroup.setAttribute('class', 'cursor-pointer pointer-events-auto');
                        edgeGroup.onclick = (e) => handlePinClick(e, err);

                        const circleBadge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        circleBadge.setAttribute('cx', badgeX);
                        circleBadge.setAttribute('cy', badgeY);
                        circleBadge.setAttribute('r', pointradius);
                        circleBadge.setAttribute('fill', colorHex);

                        const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        badgeText.setAttribute('x', badgeX);
                        badgeText.setAttribute('y', badgeY + (pointradius * 0.35));
                        badgeText.setAttribute('fill', '#ffffff');
                        badgeText.setAttribute('font-weight', 'bold');
                        badgeText.setAttribute('font-size', `${pointradius * 1.1}px`);
                        badgeText.setAttribute('text-anchor', 'middle');
                        badgeText.textContent = pinNumber;

                        edgeGroup.appendChild(circleBadge);
                        edgeGroup.appendChild(badgeText);
                        vectorDrawingOverlay.appendChild(edgeGroup);
                    }
                } catch (e) {
                    console.error(`Error rendering circle #${err.id}:`, e);
                }
            } else if (err.tool_type === 'highlight') {
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
                        svgLine.setAttribute('stroke', colorHex);
                        svgLine.setAttribute('stroke-opacity', '0.3');
                        svgLine.setAttribute('stroke-width', highlightWidth);
                        svgLine.setAttribute('stroke-linecap', 'round');
                        svgLine.style.mixBlendMode = 'multiply';
                        
                        svgLine.addEventListener('click', (e) => handlePinClick(e, err));
                        vectorDrawingOverlay.appendChild(svgLine);
                        
                        const startGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                        startGroup.setAttribute('class', 'cursor-pointer pointer-events-auto');
                        startGroup.onclick = (e) => handlePinClick(e, err);

                        const startCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        startCircle.setAttribute('cx', pixelX1);
                        startCircle.setAttribute('cy', pixelY1);
                        startCircle.setAttribute('r', pointradius);
                        startCircle.setAttribute('fill', colorHex);

                        const startText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        startText.setAttribute('x', pixelX1);
                        startText.setAttribute('y', pixelY1 + (pointradius * 0.35));
                        startText.setAttribute('fill', '#ffffff');
                        startText.setAttribute('font-weight', 'bold');
                        startText.setAttribute('font-size', `${pointradius * 1.1}px`);
                        startText.setAttribute('text-anchor', 'middle');
                        startText.textContent = pinNumber;

                        startGroup.appendChild(startCircle);
                        startGroup.appendChild(startText);
                        vectorDrawingOverlay.appendChild(startGroup);
                    }
                } catch (e) {
                    console.error(`Error rendering highlight #${err.id}:`, e);
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
                        svgPoly.setAttribute('fill', `${colorHex}0d`);
                        svgPoly.addEventListener('click', (e) => handlePinClick(e, err));
                        vectorDrawingOverlay.appendChild(svgPoly);

                        if (startPx) {
                            const startGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                            startGroup.setAttribute('class', 'cursor-pointer pointer-events-auto');
                            startGroup.onclick = (e) => handlePinClick(e, err);

                            const badgeCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                            badgeCircle.setAttribute('cx', startPx.x);
                            badgeCircle.setAttribute('cy', startPx.y);
                            badgeCircle.setAttribute('r', pointradius);
                            badgeCircle.setAttribute('fill', colorHex);

                            const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                            badgeText.setAttribute('x', startPx.x);
                            badgeText.setAttribute('y', startPx.y + (pointradius * 0.35));
                            badgeText.setAttribute('fill', '#ffffff');
                            badgeText.setAttribute('font-weight', 'bold');
                            badgeText.setAttribute('font-size', `${pointradius * 1.1}px`);
                            badgeText.setAttribute('text-anchor', 'middle');
                            badgeText.textContent = pinNumber;

                            startGroup.appendChild(badgeCircle);
                            startGroup.appendChild(badgeText);
                            vectorDrawingOverlay.appendChild(startGroup);
                        }
                    }
                } catch (e) {
                    console.error(`Error rendering shape #${err.id}:`, e);
                }
            } else if (err.tool_type === 'text') {
                const pixelX = (err.x_percent / 100) * canvasWidth;
                const pixelY = (err.y_percent / 100) * canvasHeight;
                const labelText = err.description || 'Type text...';

                let textAngle = 0;
                let geomAngle = null;

                if (err.geometry_data) {
                    try {
                        const coords = typeof err.geometry_data === 'string' ? JSON.parse(err.geometry_data) : err.geometry_data;
                        if (coords && typeof coords.angle === 'number') {
                            geomAngle = coords.angle;
                        }
                    } catch (e) {}
                }

                if (typeof err.angle === 'number' && err.angle !== 0) {
                    textAngle = err.angle;
                } else if (geomAngle !== null && geomAngle !== undefined) {
                    textAngle = geomAngle;
                } else if (typeof err.angle === 'number') {
                    textAngle = err.angle;
                }

                const textGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                textGroup.setAttribute('class', 'cursor-pointer pointer-events-auto');
                textGroup.onclick = (e) => handlePinClick(e, err);

                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', pixelX);
                circle.setAttribute('cy', pixelY);
                circle.setAttribute('r', pointradius * 0.85);
                circle.setAttribute('fill', colorHex);

                const numText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                numText.setAttribute('x', pixelX);
                numText.setAttribute('y', pixelY + (pointradius * 0.3));
                numText.setAttribute('fill', '#ffffff');
                numText.setAttribute('font-weight', 'bold');
                numText.setAttribute('font-size', `${pointradius * 0.9}px`);
                numText.setAttribute('text-anchor', 'middle');
                numText.textContent = pinNumber;

                const annotationText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                annotationText.id = `svg-text-element-${err.id}`;
                annotationText.setAttribute('x', pixelX + pointradius + 6);
                annotationText.setAttribute('y', pixelY + (pointradius * 0.35));
                annotationText.setAttribute('fill', colorHex);
                annotationText.setAttribute('font-weight', 'bold');
                annotationText.setAttribute('font-size', `${pointradius * 1.1}px`);
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
                const pixelX = (err.x_percent / 100) * canvasWidth;
                const pixelY = (err.y_percent / 100) * canvasHeight;

                const pointGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                pointGroup.setAttribute('class', 'cursor-pointer pointer-events-auto');
                pointGroup.onclick = (e) => handlePinClick(e, err);

                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', pixelX);
                circle.setAttribute('cy', pixelY);
                circle.setAttribute('r', pointradius);
                circle.setAttribute('fill', colorHex);
                circle.setAttribute('stroke-width', '3');

                const numText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                numText.setAttribute('x', pixelX);
                numText.setAttribute('y', pixelY + (pointradius * 0.35));
                numText.setAttribute('fill', '#ffffff');
                numText.setAttribute('font-weight', 'bold');
                numText.setAttribute('font-size', `${pointradius * 1.15}px`);
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
        if (err.tool_type === 'highlight') typePrefix = 'Highlight';
        if (err.tool_type === 'shape') typePrefix = 'Polygon';
        if (err.tool_type === 'text') typePrefix = 'Text';

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

        const rawUploader = getMapUploader(err);
        const fixerNorm = normUser(err.fixed_by);
        const uploaderNorm = normUser(getMapUploader(err));

        // Shows 'fixed by' only if fixed by someone who isn't the group creator
        const isFixedByNonUploader = isFixed && Boolean(fixerNorm) && Boolean(uploaderNorm) && (fixerNorm !== uploaderNorm);

        // Debug Logging for Fixed Cards
        if (isFixed) {
            console.log(`[Card #${err.error_number || err.id} Debug]`, {
                fixedByRaw: err.fixed_by,
                fixerNorm: fixerNorm,
                mapUploaderRaw: rawUploader,
                uploaderNorm: uploaderNorm,
                windowCurrentMap: window.currentMap || null,
                windowCurrentGroup: window.currentGroup || null,
                isFixedByNonUploaderVerdict: isFixedByNonUploader
            });
        }

        let displayCreator = '';

        if (isFixedByNonUploader) {
            const formattedFixer = formatDisplayName(err.fixed_by);
            const fixerColors = getUserColorStyle(err.fixed_by);
            const fixerTextClass = fixerColors.bg.replace(/^bg-/, 'text-');

            displayCreator = `
                <div class="inline-flex flex-col justify-start self-start -mt-0.5 leading-tight min-w-0">
                    <span class="text-xs italic whitespace-nowrap">
                        <span class="text-slate-400 font-normal">by</span> 
                        <span class="font-bold saturate-75 opacity-90 ${textHexOrClass}">${formattedFirstName}</span>
                    </span>
                    <span class="text-[10px] italic whitespace-nowrap text-slate-500">
                        <span class="text-slate-400 font-normal">fixed by</span> 
                        <span class="font-bold saturate-75 opacity-90 ${fixerTextClass}">${formattedFixer}</span>
                    </span>
                </div>
            `;
        } else {
            displayCreator = creatorPrefix ? `
                <span class="text-xs italic">
                    <span class="text-slate-400 font-normal">by</span> 
                    <span class="font-bold saturate-75 opacity-90 ${textHexOrClass}">${formattedFirstName}</span>
                </span>
            ` : '';
        }

        let item = sidebarList.querySelector(`[data-card-issue-id="${err.id}"]`);
        const isNewCard = !item;

        const cachedComments = (window.activeComments && window.activeComments[err.id]) || [];
        const isTrackedOpen = window.openCommentDrawers.has(err.id) || window.openCommentDrawers.has(String(err.id));
        const drawerShouldBeOpen = cachedComments.length > 0 || isTrackedOpen;
        const drawerClass = drawerShouldBeOpen ? '' : 'hidden';

        const cachedAttachments = (window.activeAttachments && window.activeAttachments[err.id]) || [];
        const attachmentsClass = cachedAttachments.length > 0 ? '' : 'hidden';

        // 1. Conditional Description (Textarea for authors, plain text for non-authors)
        const descriptionHTML = userCanEdit ? `
            <textarea id="input-${err.id}" rows="1" oninput="this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px';" class="w-full border border-slate-300 rounded px-2 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 select-text resize-none overflow-hidden block bg-white" style="height: auto; min-height: 28px;"></textarea>
        ` : `
            <div id="input-${err.id}" class="w-full px-1 py-0.5 text-xs font-semibold text-slate-800 whitespace-pre-wrap break-words leading-snug">${err.description ? err.description : '<span class="italic text-slate-400 font-normal">No description</span>'}</div>
        `;

        // 2. Conditional Layer Display (Interactive picker for authors, plain text for non-authors)
        const layerHTML = userCanEdit ? `
            <div class="layer-picker-wrapper relative">
                <button id="layer-btn-${err.id}" type="button" title="${err.gis_layer || 'Select map layer'}" class="layer-picker-btn text-xs font-normal px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center space-x-1 cursor-pointer shadow-2xs">
                    <svg class="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                    <span class="layer-btn-text truncate max-w-[120px] font-normal">${err.gis_layer || ''}</span>
                    <span class="text-[8px] text-slate-400">▼</span>
                </button>
                <div id="layer-menu-${err.id}" class="layer-menu hidden absolute left-0 top-full mt-1 w-56 bg-white border border-slate-300 rounded-lg shadow-xl p-2 z-50">
                    <input type="text" id="layer-search-${err.id}" placeholder="Search map layers..." class="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 mb-1 bg-slate-50 text-slate-800" />
                    <div id="layer-options-${err.id}" class="max-h-36 overflow-y-auto space-y-0.5 text-xs"></div>
                </div>
            </div>
        ` : (err.gis_layer ? `
            <div class="inline-flex items-center space-x-1 px-2 py-0.5 rounded border border-slate-300/80 bg-white/80 text-xs font-normal text-slate-700 shadow-2xs">
                <svg class="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                <span class="truncate max-w-[140px] font-normal">${err.gis_layer}</span>
            </div>
        ` : '');

        if (isNewCard) {
            item = document.createElement('div');
            item.setAttribute('data-card-issue-id', err.id);
            item.className = `p-3 border rounded-lg shadow-sm text-sm flex flex-col relative group transition duration-150 ${cardColorClass}`;
            
// 3. Full Card Inner HTML Structure
        item.innerHTML = `
            <div class="flex justify-between items-start mb-1.5">
                <div class="flex items-center space-x-1.5 flex-1 cursor-pointer status-badge-zone">
                    <span class="badge-number text-white rounded-full w-5 h-5 text-xs flex items-center justify-center font-bold"></span>
                    <span class="type-badge text-[10px] font-bold text-slate-500 bg-slate-200/80 px-1 py-0.5 rounded"></span>
                    <span class="status-badge text-[10px] font-bold tracking-wide uppercase px-1 py-0.5 rounded"></span>
                    <span class="creator-badge"></span>
                </div>
                <button class="delete-pin-btn text-xs text-gray-400 hover:text-red-600 font-bold transition opacity-0 group-hover:opacity-100 cursor-pointer p-0.5 rounded hover:bg-gray-200/50">Delete</button>
            </div>
            <div class="w-full mt-1 space-y-1">
                <!-- Description Section -->
                ${descriptionHTML}

                <!-- Attachments & Full-Width Image Previews Container -->
                <div id="attachments-container-${err.id}" class="${attachmentsClass} flex flex-col gap-1"></div>

                <!-- COLLAPSIBLE COMMENTS DRAWER (Tight vertical spacing) -->
                <div id="comments-drawer-${err.id}" class="comments-drawer ${drawerClass} flex flex-col space-y-0.5 pt-0">
                    <div id="comments-list-${err.id}" class="space-y-0.5 max-h-40 overflow-y-auto text-xs"></div>
                </div>

                <!-- Action Buttons Row (At bottom underneath comments) -->
                <div class="flex items-center justify-between gap-1 pt-0.5">
                    ${layerHTML}

                    <!-- Right Action Buttons (Anchored right) -->
                    <div class="flex items-center space-x-1 shrink-0 ml-auto">
                        ${userCanEdit ? `
                        <input type="file" id="file-input-${err.id}" class="hidden" multiple accept="image/*,.tif,.tiff,.pdf,.doc,.docx" />
                        
                        <button id="attach-btn-${err.id}" type="button" title="Attach files or photos" class="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center cursor-pointer">
                            <svg class="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                        </button>
                        ` : ''}

                        <button id="comment-btn-${err.id}" type="button" title="Add a comment" class="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center cursor-pointer">
                            <svg class="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                        </button>

                        <button id="zoom-btn-${err.id}" type="button" title="Zoom to Issue" class="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center cursor-pointer">
                            <svg class="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 1 1 -14 0a7 7 0 0 1 14 0zM10 7v6m-3-3h6"/></svg>
                        </button>
                    </div>
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
        
        const layerBtnText = item.querySelector('.layer-btn-text');
        if (layerBtnText) layerBtnText.textContent = err.gis_layer || '';

        const deleteBtn = item.querySelector('.delete-pin-btn');
        if ((typeof activeTool !== 'undefined' && activeTool === 'view') || !userCanEdit) {
            deleteBtn.classList.add('hidden');
        } else {
            deleteBtn.classList.remove('hidden');
        }

// --- LAYER PICKER LOGIC ---
        const layerBtn = item.querySelector(`#layer-btn-${err.id}`);
        const layerMenu = item.querySelector(`#layer-menu-${err.id}`);
        const layerSearch = item.querySelector(`#layer-search-${err.id}`);
        const layerOptions = item.querySelector(`#layer-options-${err.id}`);

        if (layerBtn && layerMenu && userCanEdit) {
            const renderOptions = (filterText = '') => {
                const query = filterText.toLowerCase().trim();
                let html = `<button type="button" data-value="" class="layer-option-item w-full text-left px-2 py-1 rounded hover:bg-slate-100 text-slate-500 italic flex justify-between items-center ${!err.gis_layer ? 'font-bold text-blue-600 bg-blue-50/50' : ''}">
                    <span>Unassigned</span>
                    ${!err.gis_layer ? '<span>✓</span>' : ''}
                </button>`;

                if (typeof GIS_LAYERS_REGISTRY !== 'undefined' && Array.isArray(GIS_LAYERS_REGISTRY)) {
                    GIS_LAYERS_REGISTRY.forEach(layerName => {
                        if (!query || layerName.toLowerCase().includes(query)) {
                            const isSelected = err.gis_layer === layerName;
                            html += `<button type="button" data-value="${layerName}" class="layer-option-item w-full text-left px-2 py-1 rounded hover:bg-slate-100 text-slate-700 flex justify-between items-center ${isSelected ? 'font-bold text-blue-600 bg-blue-50' : ''}">
                                <span class="truncate">${layerName}</span>
                                ${isSelected ? '<span>✓</span>' : ''}
                            </button>`;
                        }
                    });
                }
                layerOptions.innerHTML = html;

                layerOptions.querySelectorAll('.layer-option-item').forEach(optBtn => {
                    optBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const val = optBtn.getAttribute('data-value');
                        saveInlineLayer(err.id, val);
                        layerMenu.classList.add('hidden');
                    });
                });
            };

            layerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = layerMenu.classList.contains('hidden');
                document.querySelectorAll('.layer-menu').forEach(m => m.classList.add('hidden'));
                if (isHidden) {
                    layerMenu.classList.remove('hidden');
                    layerSearch.value = '';
                    renderOptions('');
                    layerSearch.focus();
                }
            });

            layerSearch.addEventListener('input', (e) => renderOptions(e.target.value));
            layerSearch.addEventListener('keydown', (e) => e.stopPropagation());
            layerSearch.addEventListener('keyup', (e) => e.stopPropagation());
        }

        const zoomBtn = item.querySelector(`#zoom-btn-${err.id}`);
        if (zoomBtn) {
            zoomBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                zoomToIssue(err);
            });
        }

        // --- COMMENTS LOGIC ---
        const commentBtn = item.querySelector(`#comment-btn-${err.id}`);
        const commentsDrawer = item.querySelector(`#comments-drawer-${err.id}`);

        renderCommentsSync(err, item, false);

        // Hide comment button if current user already has a comment
        const currentIdent = getCurrentUserIdentifierSync();
        const currentNorm = typeof normUser === 'function' ? normUser(currentIdent) : (currentIdent || '').toLowerCase().trim().split('@')[0];
        const cardComments = (window.activeComments && window.activeComments[err.id]) || [];
        const userHasCommented = cardComments.some(c => {
            const authorNorm = typeof normUser === 'function' ? normUser(c.created_by) : (c.created_by || '').toLowerCase().trim().split('@')[0];
            return authorNorm && authorNorm === currentNorm;
        });

        if (commentBtn) {
            if (userHasCommented) {
                commentBtn.classList.add('hidden');
            } else {
                commentBtn.classList.remove('hidden');
            }

            commentBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.openCommentDrawers.add(err.id);
                if (commentsDrawer) commentsDrawer.classList.remove('hidden');
                renderCommentsSync(err, item, true);

                const commentInput = commentsDrawer?.querySelector(`#user-comment-input-${err.id}`);
                if (commentInput) commentInput.focus();
            });
        }

        // --- ATTACHMENTS LOGIC (Synchronous Memory Cache) ---
        const attachBtn = item.querySelector(`#attach-btn-${err.id}`);
        const fileInput = item.querySelector(`#file-input-${err.id}`);
        const attachmentsContainer = item.querySelector(`#attachments-container-${err.id}`);

const renderAttachmentsSync = (errObj, container) => {
            if (!container || !errObj) return;
            const files = (window.activeAttachments && window.activeAttachments[errObj.id]) || [];
            const isFixed = errObj.status === 'fixed';
            const imgBgClass = isFixed ? 'bg-[#ecfdf5]' : 'bg-[#fef2f2]';
            const canEdit = canEditIssue(errObj);

            if (files.length > 0) {
                container.classList.remove('hidden');
                let html = '';
                files.forEach(f => {
                    const fileName = f.file_name || '';
                    const fileUrl = f.file_url || '';

                    const isTiff = /\.(tiff?)$/i.test(fileName) || fileUrl.match(/\.(tiff?)/i);
                    const isImage = /\.(png|jpe?g|webp|gif|svg|tiff?)$/i.test(fileName) || fileUrl.match(/\.(png|jpe?g|webp|gif|svg|tiff?)/i);

                    if (isImage) {
                        const cachedData = isTiff && window.tiffCache && window.tiffCache[fileUrl];
                        const initialSrc = isTiff ? (cachedData || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=') : fileUrl;
                        const isPendingTiff = isTiff && !cachedData;

                        // Hardcode initial button position for TIFFs to top-right on-image
                        const initialBtnPos = isTiff ? 'top-1 right-1 bg-white/50' : 'left-full top-1/2 -translate-y-1/2 ml-1 bg-white/30';

                        html += `
                            <div class="w-full flex items-center justify-center py-0.5 ${imgBgClass}">
                                <div class="relative inline-flex items-center justify-center max-w-full">
                                    <img src="${initialSrc}" data-src="${fileUrl}" data-tiff="${isTiff ? 'true' : 'false'}" alt="Attachment" class="preview-image-el ${isPendingTiff ? 'opacity-40 animate-pulse bg-slate-200 min-h-[100px]' : ''} max-w-full max-h-52 object-contain rounded hover:opacity-95 transition cursor-pointer block" />
                                    ${canEdit ? `<button data-file-id="${f.id}" type="button" title="Delete attachment" class="delete-image-btn absolute ${initialBtnPos} hover:bg-white/80 rounded px-1.5 py-0.5 text-xs text-red-500 hover:text-red-700 font-bold cursor-pointer transition shadow-2xs backdrop-blur-2xs z-10">✕</button>` : ''}
                                </div>
                            </div>
                        `;
                    } else {
                        html += `
                            <div class="flex items-center justify-between px-2 py-1 bg-slate-100 hover:bg-slate-200/70 border border-slate-200 rounded text-xs font-semibold text-slate-700 shadow-2xs w-full transition">
                                <a href="${fileUrl}" target="_blank" rel="noopener noreferrer" class="flex-1 min-w-0 flex items-center space-x-1.5 py-0.5 no-underline" title="${fileName}">
                                    <span>📄</span>
                                    <span class="truncate">${fileName}</span>
                                </a>
                                ${canEdit ? `<button data-file-id="${f.id}" type="button" title="Delete attachment" class="delete-file-btn text-xs text-red-400 hover:text-red-600 font-bold cursor-pointer transition px-1 ml-1 shrink-0 z-10">✕</button>` : ''}
                            </div>
                        `;
                    }
                });
                container.innerHTML = html;

                // Adjust delete buttons based on image rendered width
                const adjustDeleteButtons = () => {
                    const card = container.closest('[data-card-issue-id]') || container;
                    if (!card) return;
                    const cardRect = card.getBoundingClientRect();

                    container.querySelectorAll('.delete-image-btn').forEach(btn => {
                        const imgWrap = btn.closest('.relative');
                        if (!imgWrap) return;
                        const img = imgWrap.querySelector('img');
                        if (!img) return;

                        // Hardcode TIFFs to ALWAYS use top-right on-image positioning
                        if (img.getAttribute('data-tiff') === 'true') {
                            btn.classList.remove('left-full', 'top-1/2', '-translate-y-1/2', 'ml-1', 'bg-white/30');
                            btn.classList.add('top-1', 'right-1', 'bg-white/50');
                            return;
                        }

                        // Standard images dynamic overflow check
                        btn.classList.add('left-full', 'top-1/2', '-translate-y-1/2', 'ml-1', 'bg-white/30');
                        btn.classList.remove('top-1', 'right-1', 'bg-white/50');

                        const btnRect = btn.getBoundingClientRect();
                        
                        if (btnRect.right > cardRect.right - 8 || img.clientWidth > cardRect.width - 32) {
                            btn.classList.remove('left-full', 'top-1/2', '-translate-y-1/2', 'ml-1', 'bg-white/30');
                            btn.classList.add('top-1', 'right-1', 'bg-white/50');
                        }
                    });
                };

                // Trigger TIFF decoding
                container.querySelectorAll('img[data-tiff="true"]').forEach(imgEl => {
                    const rawTiffUrl = imgEl.getAttribute('data-src');
                    if (rawTiffUrl && !imgEl.src.startsWith('data:image/png')) {
                        loadTiffImage(imgEl, rawTiffUrl, () => {
                            adjustDeleteButtons();
                        });
                    }
                });

                // Initialize positioning
                adjustDeleteButtons();
                container.querySelectorAll('.preview-image-el').forEach(imgEl => {
                    if (!imgEl.complete) {
                        imgEl.addEventListener('load', adjustDeleteButtons);
                    }

                    imgEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const imgSrc = imgEl.getAttribute('data-src');
                        const cachedPng = window.tiffCache[imgSrc] || imgSrc;
                        if (typeof openImageModal === 'function') {
                            openImageModal(cachedPng);
                        } else {
                            window.open(cachedPng, '_blank');
                        }
                    });
                });

                if (canEdit) {
                    container.querySelectorAll('.delete-file-btn, .delete-image-btn').forEach(btn => {
                        btn.addEventListener('mousedown', (e) => e.preventDefault());
                        btn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const fileId = btn.getAttribute('data-file-id');

                            if (window.activeAttachments[errObj.id]) {
                                window.activeAttachments[errObj.id] = window.activeAttachments[errObj.id].filter(f => String(f.id) !== String(fileId));
                            }
                            renderAttachmentsSync(errObj, container);

                            if (fileId) {
                                await supabaseClient.from('map_error_attachments').delete().eq('id', fileId);
                            }
                        });
                    });
                }
            } else {
                container.classList.add('hidden');
            }
        };
        // Render attachments synchronously on card load
        renderAttachmentsSync(err, attachmentsContainer);

        if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                fileInput.click();
            });

            fileInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                if (files.length === 0) return;

                const userIdent = getCurrentUserIdentifierSync();

                for (const file of files) {
                    const filePath = `issue_${err.id}/${Date.now()}_${file.name}`;
                    const { data: uploadData, error: uploadError } = await supabaseClient.storage
                        .from('issue_files')
                        .upload(filePath, file);

                    if (!uploadError && uploadData) {
                        const { data: publicUrlData } = supabaseClient.storage.from('issue_files').getPublicUrl(filePath);
                        const newAttachment = {
                            error_id: err.id,
                            file_name: file.name,
                            file_url: publicUrlData.publicUrl,
                            uploaded_by: userIdent
                        };

                        const { data: insertData } = await supabaseClient
                            .from('map_error_attachments')
                            .insert([newAttachment])
                            .select();

                        if (insertData && insertData.length > 0) {
                            newAttachment.id = insertData[0].id;
                        }

                        if (!window.activeAttachments[err.id]) window.activeAttachments[err.id] = [];
                        window.activeAttachments[err.id].push(newAttachment);
                        renderAttachmentsSync(err, attachmentsContainer);
                    } else if (uploadError) {
                        console.error('[Attachment Upload Error]', uploadError.message);
                    }
                }
                fileInput.value = '';
            });
        }

        const inlineInput = item.querySelector(`#input-${err.id}`);
        if (inlineInput) {
            if (userCanEdit && inlineInput.tagName === 'TEXTAREA') {
                inlineInput.placeholder = err.tool_type === 'text' ? 'Type text to overlay on map...' : 'Type error description...';

                if (document.activeElement !== inlineInput) {
                    inlineInput.value = err.description || '';
                }

                inlineInput.removeAttribute('readonly');
                inlineInput.classList.remove('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
                inlineInput.classList.add('bg-white', 'text-slate-800');

                inlineInput.addEventListener('paste', async (e) => {
                    const clipboardData = e.clipboardData || window.clipboardData;
                    if (!clipboardData || !clipboardData.items) return;

                    const items = clipboardData.items;
                    let imageFile = null;

                    for (let i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf('image') !== -1) {
                            imageFile = items[i].getAsFile();
                            break;
                        }
                    }

                    if (imageFile) {
                        e.preventDefault();
                        
                        const userIdent = getCurrentUserIdentifierSync();
                        const fileName = imageFile.name || `pasted_image_${Date.now()}.png`;
                        const filePath = `issue_${err.id}/${Date.now()}_${fileName}`;

                        const { data: uploadData, error: uploadError } = await supabaseClient.storage
                            .from('issue_files')
                            .upload(filePath, imageFile);

                        if (!uploadError && uploadData) {
                            const { data: publicUrlData } = supabaseClient.storage.from('issue_files').getPublicUrl(filePath);
                            const newAttachment = {
                                error_id: err.id,
                                file_name: fileName,
                                file_url: publicUrlData.publicUrl,
                                uploaded_by: userIdent
                            };

                            const { data: insertData } = await supabaseClient
                                .from('map_error_attachments')
                                .insert([newAttachment])
                                .select();

                            if (insertData && insertData.length > 0) {
                                newAttachment.id = insertData[0].id;
                            }

                            if (!window.activeAttachments[err.id]) window.activeAttachments[err.id] = [];
                            window.activeAttachments[err.id].push(newAttachment);
                            renderAttachmentsSync(err, attachmentsContainer);
                        } else if (uploadError) {
                            console.error('[Paste Image Upload Error]', uploadError.message);
                        }
                    }
                });
            } else if (!userCanEdit && inlineInput.tagName === 'DIV') {
                // Div logic handled natively by item.innerHTML injection above
            }
        }

        // Card-wide click listener: Clicks around the image will now toggle issue status
        item.addEventListener('click', (e) => {
            if (e.target.closest('textarea, input, button, a, .layer-picker-wrapper, .delete-file-btn, .preview-image-el')) {
                return;
            }
            togglePinStatus(err.id, err.status);
        });

        if (err.tool_type === 'text') {
            if (isNewCard && userCanEdit && inlineInput && inlineInput.tagName === 'TEXTAREA') {
                inlineInput.addEventListener('input', () => {
                    const localErr = activeErrors.find(e => e.id === err.id);
                    if (localErr) localErr.description = inlineInput.value;
                    
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
            }
            if (userCanEdit && typeof newlyCreatedPinId !== 'undefined' && err.id === newlyCreatedPinId) inputToFocus = inlineInput;
        } else {
            if (isNewCard && userCanEdit && inlineInput && inlineInput.tagName === 'TEXTAREA') {
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
            if (isInitialCreation && typeof activeTool !== 'undefined' && activeTool === 'text' && inputToFocus.tagName === 'TEXTAREA') {
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
}