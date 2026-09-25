const vectorDrawingOverlay = document.getElementById('vectorDrawingOverlay');
const dotsContainer = document.getElementById('dotsContainer');
const toolHint = document.getElementById('toolHint');

function calculateNextAvailableErrorNumber() {
    const usedNumbers = activeErrors.map(e => e.error_number).filter(n => n != null);
    let candidate = 1;
    while (usedNumbers.includes(candidate)) { candidate++; }
    return candidate;
}

document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tool-btn').forEach(b => b.className = "tool-btn px-3 py-1.5 bg-black/20 hover:bg-black/30 text-left text-xs font-semibold rounded flex items-center space-x-2 cursor-pointer transition");
        const selectedTool = btn.id.replace('tool-', '');
        activeTool = selectedTool;
        firstPointClicked = null; 
        hideIssuePopover();
        
        const oldTemp = document.getElementById('temp-start-indicator');
        if (oldTemp) oldTemp.remove();
        
        btn.className = "tool-btn px-3 py-1.5 bg-[#1985a1] text-white text-left text-xs font-semibold rounded flex items-center space-x-2 cursor-pointer transition shadow-md";
        
        if (panzoomInstance) {
            if (activeTool === 'view') {
                panzoomInstance.setOptions({ disablePan: false, disableZoom: false });
            } else {
                panzoomInstance.setOptions({ disablePan: true, disableZoom: false });
            }
        }

        if (activeTool === 'view') { 
            toolHint.innerText = "Viewing / Pan-Zoom";
            vectorDrawingOverlay.style.cursor = 'grab';
        } else if (activeTool === 'dot') { 
            toolHint.innerText = "Place Point"; 
            vectorDrawingOverlay.style.cursor = 'crosshair';
        } else if (activeTool === 'text') { 
            toolHint.innerText = "Type in Right Sidebar to Insert Text"; 
            vectorDrawingOverlay.style.cursor = 'crosshair';
        } else { 
            toolHint.innerText = "Click The Start And End"; 
            vectorDrawingOverlay.style.cursor = 'crosshair';
        }
        
        renderUI(); 
    });
});

vectorDrawingOverlay.addEventListener('click', async (e) => {
    if (!currentMapId || activeTool === 'view') return;

    const currentTime = Date.now();
    if (currentTime - lastClickTime < 500) {
        console.log("Click ignored: Cooldown active.");
        return; 
    }
    lastClickTime = currentTime; 

    const rect = mapWrapper.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;

    let emailPrefix = 'staff';
    try {
        const { data: authSession } = await supabaseClient.auth.getSession();
        if (authSession && authSession.session && authSession.session.user) {
            emailPrefix = getEmailPrefix(authSession.session.user.email);
        }
    } catch (authErr) {
        console.warn("Background channel dropped, using active session data.");
        if (userBadge.innerText) emailPrefix = userBadge.innerText.split('@')[0];
    }

    if (activeTool === 'dot' || activeTool === 'text') {
        const initialPlaceholder = activeTool === 'text' ? 'Enter Text Here...' : '';
        const targetNum = calculateNextAvailableErrorNumber();
        
        const temporaryId = 'temp-' + Date.now();
        activeErrors.push({ id: temporaryId, error_number: targetNum, status: 'open' });

        const { data, error } = await supabaseClient.from('map_errors').insert([{ 
            map_id: currentMapId,
            x_percent: xPercent, 
            y_percent: yPercent, 
            description: initialPlaceholder, 
            tool_type: activeTool,
            gis_layer: null, 
            status: 'open',
            error_number: targetNum,
            created_by: emailPrefix
        }]).select();

        activeErrors = activeErrors.filter(err => err.id !== temporaryId);

        if (!error && data && data.length > 0) {
            newlyCreatedPinId = data[0].id;
        } else if (error) {
            console.error("Failed to insert tool artifact:", error.message);
        }
    } else if (activeTool === 'line' || activeTool === 'dash' || activeTool === 'arrow') {
        if (!firstPointClicked) {
            firstPointClicked = { x: xPercent, y: yPercent };
            toolHint.innerText = "Start Set! Click Where shape Should End.";
            
            const tempIndicator = document.createElement('div');
            tempIndicator.id = "temp-start-indicator";
            tempIndicator.className = "absolute bg-amber-500 w-3 h-3 rounded-full border border-white animate-ping";
            tempIndicator.style.left = `${xPercent}%`; 
            tempIndicator.style.top = `${yPercent}%`;
            dotsContainer.appendChild(tempIndicator);
        } else {
            const endPoint = { x: xPercent, y: yPercent };
            const tempInd = document.getElementById('temp-start-indicator');
            if (tempInd) tempInd.remove();

            const geometryString = JSON.stringify({ 
                x1: firstPointClicked.x, y1: firstPointClicked.y, 
                x2: endPoint.x, y2: endPoint.y 
            });

            const targetNum = calculateNextAvailableErrorNumber();

            const temporaryId = 'temp-' + Date.now();
            activeErrors.push({ id: temporaryId, error_number: targetNum, status: 'open' });

            const { data, error } = await supabaseClient.from('map_errors').insert([{ 
                map_id: currentMapId,
                x_percent: firstPointClicked.x, 
                y_percent: firstPointClicked.y, 
                description: '', 
                tool_type: activeTool,
                geometry_data: geometryString,
                status: 'open',
                error_number: targetNum,
                created_by: emailPrefix
            }]).select();

            activeErrors = activeErrors.filter(err => err.id !== temporaryId);

            if (!error && data && data.length > 0) newlyCreatedPinId = data[0].id;
            firstPointClicked = null;
            toolHint.innerText = "Click The Start And End";
        }
    }
});