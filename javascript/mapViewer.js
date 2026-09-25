const mapWrapper = document.getElementById('mapWrapper');
const pdfCanvas = document.getElementById('pdfCanvas');
const placeholderText = document.getElementById('placeholderText');
const zoomControls = document.getElementById('zoomControls');
const drawingToolbar = document.getElementById('drawingToolbar');
const panzoomContainer = document.getElementById('panzoomContainer');

function adjustPinScaling() {
    if (!panzoomInstance) return;
    document.querySelectorAll('.svg-markup-line').forEach(line => {
        line.setAttribute('stroke-width', (1.3).toString());
    });
}

async function loadActiveMap(mapObj) {
    currentMapId = mapObj.id;
    fetchMapsDirectory(); 
    placeholderText.innerHTML = "<p class='text-[#1985a1] font-semibold animate-pulse'>Loading Map Sheets...</p>";
    mapWrapper.classList.add('hidden'); 
    zoomControls.classList.add('hidden'); 
    drawingToolbar.classList.add('hidden');
    hideIssuePopover();

    // 1. Destroy existing Panzoom instance safely
    if (panzoomInstance) {
        panzoomInstance.destroy();
        panzoomInstance = null;
    }

    // 2. Clear stale transform state to prevent map-switch scale compounding
    panzoomContainer.style.transition = 'none';
    panzoomContainer.style.transform = 'none';
    void panzoomContainer.offsetHeight; 
    panzoomContainer.style.transition = '';

    try {
        const pdf = await pdfjsLib.getDocument(mapObj.file_url).promise;
        const hasSecondPage = pdf.numPages >= 2;
        
        // Render Sheet 1
        const page1 = await pdf.getPage(1);
        const viewport1 = page1.getViewport({ scale: 2.5 }); 
        const context1 = pdfCanvas.getContext('2d');
        pdfCanvas.height = viewport1.height; 
        pdfCanvas.width = viewport1.width;
        await page1.render({ canvasContext: context1, viewport: viewport1 }).promise;

        const canvas2El = document.getElementById('pdfCanvas2');

        // Render Sheet 2 if it exists
        if (hasSecondPage) {
            canvas2El.classList.remove('hidden');
            const page2 = await pdf.getPage(2);
            const viewport2 = page2.getViewport({ scale: 2.5 });
            const context2 = canvas2El.getContext('2d');
            canvas2El.height = viewport2.height;
            canvas2El.width = viewport2.width;
            await page2.render({ canvasContext: context2, viewport: viewport2 }).promise;
        } else {
            canvas2El.classList.add('hidden');
        }
        
        placeholderText.classList.add('hidden');
        mapWrapper.classList.remove('hidden'); 
        zoomControls.classList.remove('hidden'); 
        drawingToolbar.classList.remove('hidden'); 

        let totalWidth, maxHeight;
        if (hasSecondPage) {
            const rowContainer = document.getElementById('canvasRowContainer');
            totalWidth = rowContainer.offsetWidth || rowContainer.clientWidth;
            maxHeight = rowContainer.offsetHeight || rowContainer.clientHeight;
        } else {
            totalWidth = pdfCanvas.offsetWidth || pdfCanvas.clientWidth || (pdfCanvas.width / 2.5);
            maxHeight = pdfCanvas.offsetHeight || pdfCanvas.clientHeight || (pdfCanvas.height / 2.5);
        }

        const wrapper = document.getElementById('mapWrapper');
        wrapper.style.width = `${totalWidth}px`;
        wrapper.style.height = `${maxHeight}px`;

        // 3. Re-initialize standard Panzoom configuration
        requestAnimationFrame(() => {
            panzoomInstance = Panzoom(panzoomContainer, { 
                maxScale: 6, 
                minScale: 0.5, 
                canvas: true, 
                animate: true 
            });
            
            panzoomInstance.reset({ animate: false });

            const zoomResetBtn = document.getElementById('zoomReset');
            const zoomInBtn = document.getElementById('zoomIn');
            const zoomOutBtn = document.getElementById('zoomOut');

            zoomResetBtn.onclick = () => {
                if (panzoomInstance) {
                    panzoomInstance.reset();
                    adjustPinScaling();
                    hideIssuePopover();
                }
            };

            zoomInBtn.onclick = () => {
                if (panzoomInstance) {
                    panzoomInstance.zoomIn();
                    adjustPinScaling();
                }
            };

            zoomOutBtn.onclick = () => {
                if (panzoomInstance) {
                    panzoomInstance.zoomOut();
                    adjustPinScaling();
                }
            };

            // Explicit non-passive wheel event handler to fix Chrome violation warning
            panzoomContainer.parentElement.addEventListener('wheel', (e) => {
                if (!panzoomInstance) return;
                e.preventDefault();
                panzoomInstance.zoomWithWheel(e);
                adjustPinScaling();
                hideIssuePopover();
            }, { passive: false });

            panzoomContainer.onpanzoomchange = () => { 
                adjustPinScaling(); 
                hideIssuePopover(); 
            };

            document.getElementById('tool-view').click();
            fetchPins();
        });

    } catch (err) {
        placeholderText.innerHTML = `<p class='text-red-400'>Error loading resource asset frame.</p>`;
        console.error(err);
    }
}