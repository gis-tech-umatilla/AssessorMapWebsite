const sidebarList = document.getElementById('sidebarList');
const toggleVisibilityBtn = document.getElementById('toggleVisibility');
const visibilityText = document.getElementById('visibilityText');
const toggleFixedVisibilityBtn = document.getElementById('toggleFixedVisibility');
const fixedVisibilityText = document.getElementById('fixedVisibilityText');

const floatingPopover = document.getElementById('floatingPopover');
const popoverBadge = document.getElementById('popoverBadge');
const popoverTitle = document.getElementById('popoverTitle');
const popoverContent = document.getElementById('popoverContent');
const closePopoverBtn = document.getElementById('closePopoverBtn');
const popoverActionBtn = document.getElementById('popoverActionBtn');

toggleVisibilityBtn.addEventListener('click', () => {
    pinsVisible = !pinsVisible;
    visibilityText.innerText = pinsVisible ? 'Hide Open' : 'Show Open';
    renderUI();
});

toggleFixedVisibilityBtn.addEventListener('click', () => {
    fixedPinsVisible = !fixedPinsVisible;
    fixedVisibilityText.innerText = fixedPinsVisible ? 'Hide Fixed' : 'Show Fixed';
    renderUI();
});

// FLOATING CONTEXT POPUP ENGINE (FORMATTED MATCHING COMPARISON TOOL)
function triggerIssuePopover(clickEvent, err) {
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
    if (err.tool_type === 'text') typeLabel = 'Text';

    currentActivePopoverId = err.id;

    popoverBadge.className = `rounded-full w-5 h-5 text-[10px] flex items-center justify-center font-bold ${isFixed ? 'bg-emerald-600' : 'bg-red-600'}`;
    popoverBadge.innerText = pinNum;
    popoverTitle.innerText = `${typeLabel} ${err.created_by ? `(${err.created_by})` : ''}`;
    
    const screenInput = document.getElementById(`input-${err.id}`);
    const textValue = screenInput ? screenInput.value : (err.description || '');
    popoverContent.innerText = textValue.trim() || 'No Description';

    popoverActionBtn.innerText = isFixed ? 'Reopen Issue' : 'Mark As Fixed';
    popoverActionBtn.className = `w-full py-1.5 text-xs font-bold text-white rounded-lg transition cursor-pointer shadow-md ${isFixed ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1985a1] hover:bg-[#1985a1]/80'}`;
    
    popoverActionBtn.onclick = () => {
        togglePinStatus(err.id, err.status);
        hideIssuePopover();
    };

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
    floatingPopover.classList.add('hidden');
    currentActivePopoverId = null;
}

closePopoverBtn.addEventListener('click', hideIssuePopover);

document.getElementById('mapViewport').addEventListener('click', (e) => {
    if (!floatingPopover.contains(e.target) && e.target.id !== 'floatingPopover' && e.target.id === 'vectorDrawingOverlay') {
        hideIssuePopover();
    }
});

async function saveInlineDescription(pinId, value) {
    const targetVal = value.trim();
    const localErr = activeErrors.find(e => e.id === pinId);
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
    await supabaseClient.from('map_errors').update({ status: nextStatus }).eq('id', pinId);
}

async function handlePinClick(e, err) {
    e.stopPropagation();
    triggerIssuePopover(e, err);
}

async function fetchPins() {
    if (!currentMapId) return;

    const activeEl = document.activeElement;
    const isUserEditing = activeEl && sidebarList.contains(activeEl) && 
        (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT');

    if (isUserEditing && !newlyCreatedPinId) {
        return;
    }

    if (sidebarList) {
        sidebarScrollPosition = sidebarList.scrollTop;
    }

    const { data, error } = await supabaseClient
        .from('map_errors')
        .select('*')
        .eq('map_id', currentMapId)
        .order('error_number', { ascending: true });

    if (!error) { 
        activeErrors = data; 
        renderUI(); 
    }
}

function renderUI() {
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

    dotsContainer.innerHTML = '';
    const linesToRemove = vectorDrawingOverlay.querySelectorAll('line');
    linesToRemove.forEach(el => el.remove());

    const canvasWidth = mapWrapper.offsetWidth || mapWrapper.clientWidth;
    const canvasHeight = mapWrapper.offsetHeight || mapWrapper.clientHeight;
    
    vectorDrawingOverlay.setAttribute('viewBox', `0 0 ${canvasWidth} ${canvasHeight}`);

    activeErrors.forEach((err) => {
        const pinNumber = err.error_number || '?';
        const isFixed = err.status === 'fixed';
        const colorHex = isFixed ? '#059669' : '#dc2626';
        const dotColorClass = isFixed ? 'bg-emerald-600' : 'bg-red-600';
        const badgeColorClass = isFixed ? 'bg-emerald-600' : 'bg-red-600';

        let showOnMap = true;
        if (!isFixed && !pinsVisible) showOnMap = false;
        if (isFixed && !fixedPinsVisible) showOnMap = false;

        if (showOnMap) {
            if (err.tool_type === 'line' || err.tool_type === 'dash' || err.tool_type === 'arrow') {
                const coords = JSON.parse(err.geometry_data);
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
                    svgLine.setAttribute('stroke-width', '3');
                    
                    if (err.tool_type === 'dash') svgLine.setAttribute('stroke-dasharray', '6,6');
                    if (err.tool_type === 'arrow') svgLine.setAttribute('marker-end', isFixed ? 'url(#arrowhead-fixed)' : 'url(#arrowhead)');
                    
                    svgLine.addEventListener('click', (e) => handlePinClick(e, err));
                    vectorDrawingOverlay.appendChild(svgLine);
                    
                    const startMarker = document.createElement('div');
                    startMarker.className = `error-dot absolute ${dotColorClass} text-white font-bold rounded-full flex items-center justify-center shadow-md pointer-events-auto cursor-pointer`;
                    startMarker.style.left = `${coords.x1}%`; 
                    startMarker.style.top = `${coords.y1}%`;
                    startMarker.innerText = pinNumber;
                    startMarker.onclick = (e) => handlePinClick(e, err);
                    dotsContainer.appendChild(startMarker);
                }
            } else if (err.tool_type === 'text') {
                const labelText = err.description || 'Type text...';
                const textLabel = document.createElement('div');
                textLabel.className = `map-text-annotation absolute font-medium rounded shadow whitespace-nowrap flex items-center h-[8px] py-0 pl-0 pr-1 space-x-1 pointer-events-auto cursor-pointer transition ${isFixed ? 'text-emerald-800 border-emerald-300 bg-emerald-50' : 'text-red-800 border-red-300 bg-red-50'}`;
                textLabel.style.left = `${err.x_percent}%`; 
                textLabel.style.top = `${err.y_percent}%`;
                
                textLabel.innerHTML = `
                    <span class="${badgeColorClass} text-white rounded-full w-[14px] h-[14px] text-[8px] flex items-center justify-center font-bold shrink-0 m-0">${pinNumber}</span>
                    <span class="font-bold tracking-tight text-[8px] self-center pl-1 leading-none">${labelText}</span>
                `;
                textLabel.onclick = (e) => handlePinClick(e, err);
                dotsContainer.appendChild(textLabel);
            } else {
                const dot = document.createElement('div');
                dot.className = `error-dot absolute ${dotColorClass} text-white font-bold rounded-full flex items-center justify-center shadow-lg pointer-events-auto cursor-pointer`;
                dot.style.left = `${err.x_percent}%`; 
                dot.style.top = `${err.y_percent}%`;
                dot.innerText = pinNumber;
                dot.onclick = (e) => handlePinClick(e, err);
                dotsContainer.appendChild(dot);
            }
        }
    });

    if (activeErrors.length === 0) {
        sidebarList.innerHTML = '<p class="text-sm text-gray-400 italic">No Issues Logged Yet</p>';
        return;
    }

    const emptyPlaceholder = sidebarList.querySelector('p');
    if (emptyPlaceholder) emptyPlaceholder.remove();

    const currentDatabaseIds = new Set(activeErrors.map(err => err.id));
    const existingDOMCards = sidebarList.querySelectorAll('[data-card-issue-id]');
    existingDOMCards.forEach(card => {
        const issueId = card.getAttribute('data-card-issue-id');
        if (!currentDatabaseIds.has(issueId)) {
            card.remove();
        }
    });

    let inputToFocus = null;

    activeErrors.forEach((err, index) => {
        const pinNumber = err.error_number || '?';
        const isFixed = err.status === 'fixed';
        
        const cardColorClass = isFixed ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800';
        const badgeColorClass = isFixed ? 'bg-emerald-600' : 'bg-red-600';

        let typePrefix = 'Point';
        if (err.tool_type === 'line') typePrefix = 'Line';
        if (err.tool_type === 'dash') typePrefix = 'Dash';
        if (err.tool_type === 'arrow') typePrefix = 'Arrow';
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

        const displayCreator = creatorPrefix ? `
            <span class="text-xs italic">
                <span class="text-slate-400 font-normal">by</span> 
                <span class="font-bold saturate-75 opacity-90 ${textHexOrClass}">${formattedFirstName}</span>
            </span>
        ` : '';
        
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
        if (activeTool === 'view') {
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
                GIS_LAYERS_REGISTRY.forEach(layerName => {
                    const isSelected = err.gis_layer === layerName ? 'selected' : '';
                    layerOptionsHTML += `<option value="${layerName}" ${isSelected}>${layerName}</option>`;
                });
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

        const badgeZone = item.querySelector(`.status-badge-zone`);
        badgeZone.replaceWith(badgeZone.cloneNode(true));
        item.querySelector(`.status-badge-zone`).addEventListener('click', () => togglePinStatus(err.id, err.status));
        
        if (err.tool_type === 'text') {
            if (isNewCard) {
                inlineInput.addEventListener('input', (e) => {
                    const textAnnotationElement = dotsContainer.querySelector(`div[style*="left: ${err.x_percent}%"] span.font-bold:not([class*="badge"])`);
                    if (textAnnotationElement) { textAnnotationElement.innerText = e.target.value || 'Type text...'; }
                });
                inlineInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') inlineInput.blur(); });
                inlineInput.addEventListener('blur', () => saveInlineDescription(err.id, inlineInput.value));

                selectDropdown.addEventListener('change', (e) => { saveInlineLayer(err.id, e.target.value); });
            }
            if (err.id === newlyCreatedPinId) inputToFocus = inlineInput;
        } else {
            if (isNewCard) {
                inlineInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') inlineInput.blur(); });
                inlineInput.addEventListener('blur', () => saveInlineDescription(err.id, inlineInput.value));
            }
            if (err.id === newlyCreatedPinId) inputToFocus = inlineInput;
        }

        const finalDelBtn = item.querySelector('.delete-pin-btn');
        if (isNewCard) {
            finalDelBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await supabaseClient.from('map_errors').delete().eq('id', err.id);
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

    adjustPinScaling();

    if (sidebarList) {
        sidebarList.scrollTop = sidebarScrollPosition;
    }

    if (inputToFocus) {
        setTimeout(() => {
            inputToFocus.focus();
            if (activeTool === 'text') inputToFocus.select();
            newlyCreatedPinId = null; 
        }, 50);
    } else if (activeInputId) {
        const inputToRestore = document.getElementById(activeInputId);
        if (inputToRestore && document.activeElement !== inputToRestore) {
            inputToRestore.focus();
            if (inputToRestore.tagName === 'TEXTAREA') {
                try {
                    inputToRestore.setSelectionRange(selectionStart, selectionEnd);
                } catch (err) {
                    // Ignore selectionRange errors on unmounted frames
                }
            }
        }
    }
}