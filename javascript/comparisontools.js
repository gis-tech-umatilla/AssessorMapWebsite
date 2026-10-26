/**
 * comparisontools.js
 * Stage 2: Comparison engines including Map-Locked Slider, Opacity,
 * Transparency, and Lag-Free Synced Side-by-Side dual Leaflet maps.
 */
(() => {
    'use strict';

    // State
    let activeComparisonMode = 'swipe';
    let primaryMap = null;
    let overlayOld = null;
    let overlayNew = null;
    let compBounds = null;
    let initialCompZoom = null;
    let sliderMapPercentX = 50;

    // Side-by-Side Dual Leaflet Instances
    let sideMapNew = null;
    let sideMapOld = null;
    let isSyncing = false;

    // DOM Elements
    let elements = {};

    function init(domElements) {
        elements = domElements;

        // Mode Switch Buttons
        elements.modeBtnOpacity?.addEventListener('click', () => setComparisonMode('opacity'));
        elements.modeBtnTransparency?.addEventListener('click', () => setComparisonMode('transparency'));
        elements.modeBtnSwipe?.addEventListener('click', () => setComparisonMode('swipe'));
        elements.modeBtnSideBySide?.addEventListener('click', () => setComparisonMode('sidebyside'));

        // Opacity Sliders
        elements.sliderOldOpacity?.addEventListener('input', (e) => {
            if (activeComparisonMode === 'opacity' && overlayOld) {
                overlayOld.setOpacity(e.target.value / 100);
            }
            if (elements.valOldOpacity) elements.valOldOpacity.innerText = `${e.target.value}%`;
        });
        elements.sliderNewOpacity?.addEventListener('input', (e) => {
            if (activeComparisonMode === 'opacity' && overlayNew) {
                overlayNew.setOpacity(e.target.value / 100);
            }
            if (elements.valNewOpacity) elements.valNewOpacity.innerText = `${e.target.value}%`;
        });

        // Transparency Sliders
        elements.sliderOldTransparency?.addEventListener('input', (e) => {
            if (activeComparisonMode === 'transparency' && overlayOld) {
                overlayOld.setOpacity((100 - e.target.value) / 100);
            }
            if (elements.valOldTransparency) elements.valOldTransparency.innerText = `${e.target.value}%`;
        });
        elements.sliderNewTransparency?.addEventListener('input', (e) => {
            if (activeComparisonMode === 'transparency' && overlayNew) {
                overlayNew.setOpacity((100 - e.target.value) / 100);
            }
            if (elements.valNewTransparency) elements.valNewTransparency.innerText = `${e.target.value}%`;
        });

        // Map-Locked Slider Drag & Wheel Passthrough
        if (elements.swipeHandle) {
            elements.swipeHandle.addEventListener('wheel', (e) => {
                if (!primaryMap) return;
                primaryMap.getContainer().dispatchEvent(new WheelEvent('wheel', {
                    clientX: e.clientX,
                    clientY: e.clientY,
                    deltaY: e.deltaY,
                    deltaX: e.deltaX,
                    deltaMode: e.deltaMode,
                    bubbles: true,
                    cancelable: true
                }));
            }, { passive: false });

            elements.swipeHandle.addEventListener('pointerdown', (e) => {
                if (activeComparisonMode !== 'swipe' || !compBounds || !primaryMap || e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                elements.swipeHandle.setPointerCapture(e.pointerId);

                const cropW = compBounds[1][1];

                const onMove = (moveEvt) => {
                    const containerPt = primaryMap.mouseEventToContainerPoint(moveEvt);
                    const mapLatLng = primaryMap.containerPointToLatLng(containerPt);
                    sliderMapPercentX = Math.max(0, Math.min(100, (mapLatLng.lng / cropW) * 100));
                    updateSwipePosition();
                };

                const onUp = (upEvt) => {
                    elements.swipeHandle.releasePointerCapture(upEvt.pointerId);
                    elements.swipeHandle.removeEventListener('pointermove', onMove);
                    elements.swipeHandle.removeEventListener('pointerup', onUp);
                };

                elements.swipeHandle.addEventListener('pointermove', onMove);
                elements.swipeHandle.addEventListener('pointerup', onUp);
            });
        }
    }

    function startComparison({ urlOld, urlNew, bounds, map, initialZoom }) {
        primaryMap = map;
        compBounds = bounds;
        initialCompZoom = initialZoom;

        destroy();

        overlayOld = L.imageOverlay(urlOld, compBounds, { zIndex: 10 }).addTo(primaryMap);
        overlayNew = L.imageOverlay(urlNew, compBounds, { zIndex: 20 }).addTo(primaryMap);

        setupSideBySide(urlNew, urlOld, compBounds);
        setComparisonMode(activeComparisonMode);
    }

    function setComparisonMode(mode) {
        const previousMode = activeComparisonMode;
        activeComparisonMode = mode;

        const defaultClass = "w-full py-2 px-3 text-xs font-bold rounded bg-black/20 hover:bg-black/30 text-slate-300 flex justify-between items-center cursor-pointer transition";
        const activeClass = "w-full py-2 px-3 text-xs font-bold rounded bg-[#1985a1] text-white flex justify-between items-center cursor-pointer transition shadow-md";

        if (elements.modeBtnOpacity) elements.modeBtnOpacity.className = (mode === 'opacity') ? activeClass : defaultClass;
        if (elements.modeBtnTransparency) elements.modeBtnTransparency.className = (mode === 'transparency') ? activeClass : defaultClass;
        if (elements.modeBtnSwipe) elements.modeBtnSwipe.className = (mode === 'swipe') ? activeClass : defaultClass;
        if (elements.modeBtnSideBySide) elements.modeBtnSideBySide.className = (mode === 'sidebyside') ? activeClass : defaultClass;

        elements.panelOpacityControl?.classList.toggle('hidden', mode !== 'opacity');
        elements.panelTransparencyControl?.classList.toggle('hidden', mode !== 'transparency');
        elements.swipeHandle?.classList.toggle('hidden', mode !== 'swipe');

        if (mode === 'sidebyside') {
            let targetCenter = compBounds ? L.latLngBounds(compBounds).getCenter() : null;
            let targetZoom = null;

            if (primaryMap && elements.primaryMapEl && elements.primaryMapEl.clientWidth > 0) {
                targetCenter = primaryMap.getCenter();
                targetZoom = primaryMap.getZoom();
            }

            elements.primaryMapEl?.classList.add('hidden');
            if (elements.primaryMapEl) elements.primaryMapEl.style.display = 'none';

            elements.sideBySideContainer?.classList.remove('hidden');

            requestAnimationFrame(() => {
                if (sideMapNew && sideMapOld && compBounds) {
                    sideMapNew.invalidateSize();
                    sideMapOld.invalidateSize();

                    if (targetCenter && targetZoom != null && !isNaN(targetZoom)) {
                        sideMapNew.setView(targetCenter, targetZoom, { animate: false });
                        sideMapOld.setView(targetCenter, targetZoom, { animate: false });
                    } else {
                        sideMapNew.fitBounds(compBounds, { padding: [10, 10], animate: false });
                        sideMapOld.fitBounds(compBounds, { padding: [10, 10], animate: false });
                    }
                }
            });
        } else {
            let transferCenter = null;
            let transferZoom = null;

            if (previousMode === 'sidebyside' && sideMapNew && sideMapNew.getContainer().clientWidth > 0) {
                transferCenter = sideMapNew.getCenter();
                transferZoom = sideMapNew.getZoom();
            }

            elements.sideBySideContainer?.classList.add('hidden');

            elements.primaryMapEl?.classList.remove('hidden');
            if (elements.primaryMapEl) elements.primaryMapEl.style.display = 'block';

            if (primaryMap) {
                primaryMap.invalidateSize();

                if (transferCenter && transferZoom != null && !isNaN(transferZoom)) {
                    primaryMap.setView(transferCenter, transferZoom, { animate: false });
                } else if (compBounds && primaryMap.getZoom() === 0) {
                    primaryMap.fitBounds(compBounds, { padding: [10, 10], animate: false });
                }
            }

            if (!overlayNew || !overlayOld) return;

            const newImg = overlayNew.getElement();

            // Clear clipPath when moving away from swipe mode
            if (mode !== 'swipe' && newImg) {
                newImg.style.clipPath = 'none';
            }

            // Strictly separate mode states
            if (mode === 'opacity') {
                overlayNew.setOpacity(elements.sliderNewOpacity.value / 100);
                overlayOld.setOpacity(elements.sliderOldOpacity.value / 100);
            } else if (mode === 'transparency') {
                overlayNew.setOpacity((100 - elements.sliderNewTransparency.value) / 100);
                overlayOld.setOpacity((100 - elements.sliderOldTransparency.value) / 100);
            } else if (mode === 'swipe') {
                // In swipe mode, both maps are always 100% solid
                overlayNew.setOpacity(1.0);
                overlayOld.setOpacity(1.0);
                requestAnimationFrame(() => updateSwipePosition());
            }
        }
    }

    // Map-Locked Slider Positioning & Image Clipping
    function updateSwipePosition() {
        if (activeComparisonMode !== 'swipe' || !overlayNew || !compBounds || !primaryMap) return;
        const img = overlayNew.getElement();
        if (!img) return;

        const cropW = compBounds[1][1];
        const cropH = compBounds[1][0];

        const mapLng = (sliderMapPercentX / 100) * cropW;
        const pTop = primaryMap.latLngToContainerPoint(L.latLng(cropH, mapLng));
        const pBottom = primaryMap.latLngToContainerPoint(L.latLng(0, mapLng));
        const mapScreenHeight = pBottom.y - pTop.y;

        const fitZoom = initialCompZoom != null ? initialCompZoom : primaryMap.getZoom();
        const zoomScale = Math.max(1.0, primaryMap.getZoomScale(primaryMap.getZoom(), fitZoom));

        const lineWidth = Math.round(5 * zoomScale);
        const pillWidth = Math.round(22 * zoomScale);
        const pillHeight = Math.round(48 * zoomScale);
        const hitWidth = Math.max(36, pillWidth + 16);

        elements.swipeHandle.style.left = `${pTop.x - (hitWidth / 2)}px`;
        elements.swipeHandle.style.top = `${pTop.y}px`;
        elements.swipeHandle.style.width = `${hitWidth}px`;
        elements.swipeHandle.style.height = `${mapScreenHeight}px`;

        if (elements.swipeHandleLine) elements.swipeHandleLine.style.width = `${lineWidth}px`;
        if (elements.swipeHandleButton) {
            elements.swipeHandleButton.style.top = '50%';
            elements.swipeHandleButton.style.left = '50%';
            elements.swipeHandleButton.style.width = `${pillWidth}px`;
            elements.swipeHandleButton.style.height = `${pillHeight}px`;
            elements.swipeHandleButton.style.fontSize = `${Math.round(13 * zoomScale)}px`;
        }

        // Clip the top map along the exact longitudinal coordinate
        img.style.clipPath = `polygon(0% 0%, ${sliderMapPercentX}% 0%, ${sliderMapPercentX}% 100%, 0% 100%)`;
    }

    function setupSideBySide(urlNew, urlOld, bounds) {
        const mapOptions = {
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
        };

        if (!sideMapNew) sideMapNew = L.map('sideMapNew', mapOptions);
        if (!sideMapOld) sideMapOld = L.map('sideMapOld', mapOptions);

        sideMapNew.eachLayer(l => sideMapNew.removeLayer(l));
        sideMapOld.eachLayer(l => sideMapOld.removeLayer(l));

        L.imageOverlay(urlNew, bounds).addTo(sideMapNew);
        L.imageOverlay(urlOld, bounds).addTo(sideMapOld);

        const syncMaps = (source, target) => {
            source.on('move', () => {
                if (isSyncing) return;
                isSyncing = true;
                target.setView(source.getCenter(), source.getZoom(), { animate: false });
                isSyncing = false;
            });
        };

        syncMaps(sideMapNew, sideMapOld);
        syncMaps(sideMapOld, sideMapNew);
    }

    function destroy() {
        if (primaryMap) {
            if (overlayOld) primaryMap.removeLayer(overlayOld);
            if (overlayNew) primaryMap.removeLayer(overlayNew);
            overlayOld = null;
            overlayNew = null;
        }
        elements.swipeHandle?.classList.add('hidden');
        elements.sideBySideContainer?.classList.add('hidden');
    }

    function getActiveLeaflet() {
        return (activeComparisonMode === 'sidebyside') ? sideMapNew : primaryMap;
    }

    function getMode() {
        return activeComparisonMode;
    }

    function getCompBounds() {
        return compBounds;
    }

    // Public API
    window.ComparisonTools = {
        init,
        startComparison,
        setComparisonMode,
        updateSwipePosition,
        setupSideBySide,
        destroy,
        getActiveLeaflet,
        getMode,
        getCompBounds
    };
})();