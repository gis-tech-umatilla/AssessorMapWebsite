/**
 * sharedMapLoader.js
 * Universal map loader shared across index.html and comparisontool.html
 */
window.SharedMapLoader = (function () {
    'use strict';

    function isTiffSource(source) {
        if (!source) return false;
        const name = (typeof source === 'string') ? source : (source.name || '');
        return /\.(tif|tiff)$/i.test(name);
    }

    async function loadPdfPage(source, pageNum = 1, scale = 1.8, maxDimension = 11000) {
        let pdfData = source;
        if (source instanceof File || source instanceof Blob) {
            pdfData = new Uint8Array(await source.arrayBuffer());
        }

        const loadingTask = pdfjsLib.getDocument(typeof pdfData === 'string' ? { url: pdfData } : { data: pdfData });
        const pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(pageNum);

        const unscaledViewport = page.getViewport({ scale: 1.0 });
        let targetScale = scale;

        // Apply max dimension constraint if sheet exceeds ceiling
        if (maxDimension) {
            const rawW = unscaledViewport.width * scale;
            const rawH = unscaledViewport.height * scale;
            if (rawW > maxDimension || rawH > maxDimension) {
                targetScale = scale * Math.min(maxDimension / rawW, maxDimension / rawH);
            }
        }

        const viewport = page.getViewport({ scale: targetScale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        await page.render({ canvasContext: ctx, viewport }).promise;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const imgUrl = URL.createObjectURL(blob);

        return {
            imgUrl,
            imgData,
            w: canvas.width,
            h: canvas.height,
            page,
            pdfDoc,
            viewport // Preserves backward compatibility with mapViewer.js
        };
    }

    async function loadTiff(source, maxDimension = 11000) {
        let buffer;
        if (source instanceof File || source instanceof Blob) {
            buffer = await source.arrayBuffer();
        } else if (typeof source === 'string') {
            const res = await fetch(source);
            buffer = await res.arrayBuffer();
        }

        const ifds = UTIF.decode(buffer);
        UTIF.decodeImage(buffer, ifds[0]);
        const rgba = UTIF.toRGBA8(ifds[0]);
        let w = ifds[0].width;
        let h = ifds[0].height;

        let canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        let ctx = canvas.getContext('2d');
        let imgData = ctx.createImageData(w, h);
        imgData.data.set(rgba);
        ctx.putImageData(imgData, 0, 0);

        if (maxDimension && (w > maxDimension || h > maxDimension)) {
            const ratio = Math.min(maxDimension / w, maxDimension / h);
            const sw = Math.round(w * ratio);
            const sh = Math.round(h * ratio);
            const sc = document.createElement('canvas');
            sc.width = sw; sc.height = sh;
            const sctx = sc.getContext('2d');
            sctx.drawImage(canvas, 0, 0, sw, sh);
            canvas = sc;
            w = sw;
            h = sh;
            imgData = sctx.getImageData(0, 0, w, h);
        }

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const imgUrl = URL.createObjectURL(blob);

        return {
            imgUrl,
            imgData,
            w,
            h,
            page: null,
            pdfDoc: { numPages: 1 },
            viewport: { width: w, height: h }
        };
    }

    return {
        isTiffSource,
        loadPdfPage,
        loadTiff
    };
})();