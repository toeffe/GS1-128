/**
 * Photo CODE128 scanner wrapper — uses vendored zbarWasm (inline WASM, file:// safe).
 * Tier 1: one quick scan. Tier 2: recovery passes with visible progress.
 */
(function () {
  'use strict';

  const QUICK_MAX_EDGE = 3200;
  const RECOVERY_MIN_EDGE = 1600;
  const ROTATION_ANGLES = [-15, -10, -5, 5, 10, 15];
  const STRIP_COUNT = 4;
  const CODE128_TYPE = 128;
  const ZBAR_CFG_ENABLE = 0;
  const ZBAR_CFG_X_DENSITY = 256;
  const ZBAR_CFG_TEST_INVERTED = 129;
  let scanning = false;
  let scannerPromise = null;

  function ensureZbar() {
    if (typeof zbarWasm === 'undefined' || !zbarWasm.scanImageData) {
      throw new Error('Barcode scanner library not loaded.');
    }
    return zbarWasm;
  }

  async function flushUi() {
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  async function report(onProgress, msg) {
    onProgress?.(msg);
    await flushUi();
  }

  async function getCode128Scanner() {
    if (!scannerPromise) {
      scannerPromise = (async () => {
        const zbar = ensureZbar();
        const scanner = await zbar.getDefaultScanner();
        scanner.setConfig(0, ZBAR_CFG_ENABLE, 0);
        scanner.setConfig(CODE128_TYPE, ZBAR_CFG_ENABLE, 1);
        scanner.setConfig(CODE128_TYPE, ZBAR_CFG_X_DENSITY, 1);
        scanner.setConfig(CODE128_TYPE, ZBAR_CFG_TEST_INVERTED, 1);
        return scanner;
      })();
    }
    return scannerPromise;
  }

  function isCode128(sym) {
    const name = String(sym.typeName || '');
    return sym.type === CODE128_TYPE || /code[\s-]?128/i.test(name);
  }

  function normalizeRaw(raw) {
    return String(raw).replace(/^\]C1/, '').replace(/^[\x1D]+/, '');
  }

  function looksLikeGs1(raw) {
    const s = normalizeRaw(raw);
    return /^(00|01|02|10|11|15|17|37|310)/.test(s);
  }

  function decodeSymbols(symbols, code128Only) {
    const lines = [];
    const seen = new Set();
    for (const sym of symbols) {
      if (code128Only && !isCode128(sym)) continue;
      let raw;
      try {
        raw = sym.decode();
      } catch {
        continue;
      }
      if (!raw || seen.has(raw)) continue;
      if (!code128Only && !looksLikeGs1(raw)) continue;
      seen.add(raw);
      lines.push(raw);
    }
    return lines;
  }

  function mergeLines(target, incoming) {
    const seen = new Set(target);
    for (const line of incoming) {
      if (!seen.has(line)) {
        seen.add(line);
        target.push(line);
      }
    }
    return target;
  }

  function copyImageData(imageData) {
    return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  }

  function applyContrast(imageData) {
    const d = imageData.data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const range = max - min || 1;
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      const s = ((g - min) * 255 / range) | 0;
      d[i] = d[i + 1] = d[i + 2] = s;
      d[i + 3] = 255;
    }
    return imageData;
  }

  function applyBinarize(imageData) {
    const out = copyImageData(imageData);
    const d = out.data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      sum += g;
      n++;
    }
    const thresh = (sum / n) | 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      const v = g < thresh ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    return out;
  }

  function applySharpen(imageData) {
    const src = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const out = copyImageData(imageData);
    const d = out.data;
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let sum = 0;
        let ki = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * w + (x + kx)) * 4;
            sum += src[idx] * kernel[ki++];
          }
        }
        const oi = (y * w + x) * 4;
        const v = Math.max(0, Math.min(255, sum));
        d[oi] = d[oi + 1] = d[oi + 2] = v;
      }
    }
    return out;
  }

  function imageDataToCanvas(imageData) {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext('2d').putImageData(imageData, 0, 0);
    return canvas;
  }

  function scaleImageData(imageData, factor) {
    const src = imageDataToCanvas(imageData);
    const tw = Math.max(1, Math.round(imageData.width * factor));
    const th = Math.max(1, Math.round(imageData.height * factor));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, tw, th);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, tw, th);
    return ctx.getImageData(0, 0, tw, th);
  }

  function capImageData(imageData, maxEdge) {
    const maxDim = Math.max(imageData.width, imageData.height);
    if (maxDim <= maxEdge) return imageData;
    return scaleImageData(imageData, maxEdge / maxDim);
  }

  function ensureMinEdge(imageData, minEdge) {
    const maxDim = Math.max(imageData.width, imageData.height);
    if (maxDim >= minEdge) return imageData;
    return scaleImageData(imageData, minEdge / maxDim);
  }

  function rotateImageData(imageData, degrees) {
    const rad = (degrees * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const w = imageData.width;
    const h = imageData.height;
    const tw = Math.ceil(w * cos + h * sin);
    const th = Math.ceil(w * sin + h * cos);
    const src = imageDataToCanvas(imageData);
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, tw, th);
    ctx.translate(tw / 2, th / 2);
    ctx.rotate(rad);
    ctx.drawImage(src, -w / 2, -h / 2);
    return ctx.getImageData(0, 0, tw, th);
  }

  function extractStrip(imageData, y, height) {
    const w = imageData.width;
    const h = Math.min(height, imageData.height - y);
    if (h <= 8) return null;
    const out = new ImageData(w, h);
    const src = imageData.data;
    const dst = out.data;
    for (let row = 0; row < h; row++) {
      const si = ((y + row) * w) * 4;
      const di = row * w * 4;
      dst.set(src.subarray(si, si + w * 4), di);
    }
    return out;
  }

  function horizontalStrips(imageData, count) {
    const h = imageData.height;
    const stripH = Math.ceil(h / count);
    const overlap = Math.max(8, Math.floor(stripH * 0.12));
    const strips = [];
    for (let i = 0; i < count; i++) {
      const y = Math.max(0, i * stripH - overlap);
      const sh = Math.min(h - y, stripH + overlap * 2);
      const strip = extractStrip(imageData, y, sh);
      if (strip) strips.push(strip);
    }
    return strips;
  }

  function drawToImageData(source) {
    const w = source.naturalWidth || source.width;
    const h = source.naturalHeight || source.height;
    if (!w || !h) throw new Error('Image has no pixel dimensions.');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  async function tryScan(imageData, scanner, code128Only) {
    const zbar = ensureZbar();
    const symbols = await zbar.scanImageData(imageData, scanner);
    return decodeSymbols(symbols, code128Only);
  }

  async function runStep(onProgress, label, step, total, fn) {
    await report(onProgress, `${label} (${step}/${total})…`);
    try {
      return await fn();
    } catch {
      return [];
    }
  }

  async function scanStrips(imageData, scanner, code128Only, onProgress, stepBase, total) {
    const all = [];
    const strips = horizontalStrips(imageData, STRIP_COUNT);
    for (let i = 0; i < strips.length; i++) {
      const strip = strips[i];
      const up = ensureMinEdge(strip, 800);
      let lines = await tryScan(up, scanner, code128Only);
      if (!lines.length) lines = await tryScan(applyContrast(copyImageData(up)), scanner, code128Only);
      mergeLines(all, lines);
      if (all.length) return all;

      const magnified = scaleImageData(up, 2);
      lines = await tryScan(magnified, scanner, code128Only);
      mergeLines(all, lines);
      if (all.length) return all;

      await report(onProgress, `Trying regions (${stepBase}/${total}) — band ${i + 1}/${strips.length}…`);
    }
    return all;
  }

  async function scanWithRecovery(imageData, onProgress) {
    const scanner = await getCode128Scanner();
    const quick = capImageData(imageData, QUICK_MAX_EDGE);
    const total = 5 + 4 + ROTATION_ANGLES.length + 2;
    let step = 0;

    let lines = await runStep(onProgress, 'Scanning', ++step, total, () => tryScan(quick, scanner, true));
    if (lines.length) return lines;

    lines = await runStep(onProgress, 'Trying contrast', ++step, total, () =>
      tryScan(applyContrast(copyImageData(quick)), scanner, true));
    if (lines.length) return lines;

    lines = await runStep(onProgress, 'Trying binarize', ++step, total, () =>
      tryScan(applyBinarize(copyImageData(quick)), scanner, true));
    if (lines.length) return lines;

    lines = await runStep(onProgress, 'Trying magnify', ++step, total, () =>
      tryScan(scaleImageData(copyImageData(quick), 2), scanner, true));
    if (lines.length) return lines;

    lines = await runStep(onProgress, 'Trying regions', ++step, total, () =>
      scanStrips(quick, scanner, true, onProgress, step, total));
    if (lines.length) return lines;

    const upscaled = ensureMinEdge(copyImageData(quick), RECOVERY_MIN_EDGE);

    lines = await runStep(onProgress, 'Trying upscale', ++step, total, () =>
      tryScan(upscaled, scanner, true));
    if (lines.length) return lines;

    lines = await runStep(onProgress, 'Trying upscale + contrast', ++step, total, () =>
      tryScan(applyContrast(copyImageData(upscaled)), scanner, true));
    if (lines.length) return lines;

    lines = await runStep(onProgress, 'Trying 2× upscale', ++step, total, () =>
      tryScan(scaleImageData(upscaled, 2), scanner, true));
    if (lines.length) return lines;

    lines = await runStep(onProgress, 'Trying sharpen', ++step, total, () =>
      tryScan(applySharpen(copyImageData(upscaled)), scanner, true));
    if (lines.length) return lines;

    for (const deg of ROTATION_ANGLES) {
      lines = await runStep(onProgress, `Trying rotation ${deg > 0 ? '+' : ''}${deg}°`, ++step, total, () =>
        tryScan(rotateImageData(copyImageData(upscaled), deg), scanner, true));
      if (lines.length) return lines;
    }

    lines = await runStep(onProgress, 'Trying alternate decode', ++step, total, () =>
      tryScan(upscaled, scanner, false));
    if (lines.length) return lines;

    lines = await runStep(onProgress, 'Trying regions (alternate)', ++step, total, () =>
      scanStrips(upscaled, scanner, false, onProgress, step, total));
    return lines;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read image file.'));
      reader.readAsDataURL(file);
    });
  }

  const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|tiff?)$/i;

  function isImageFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith('image/')) return true;
    return IMAGE_EXT.test(file.name || '');
  }

  function isHeicFile(file) {
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    return /\.heic$|\.heif$/.test(name) || type === 'image/heic' || type === 'image/heif';
  }

  async function loadImageWithBitmap(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (!bitmap.width || !bitmap.height) {
      bitmap.close?.();
      throw new Error('Image has no pixel dimensions.');
    }
    return bitmap;
  }

  async function loadImageWithDataUrl(file) {
    const dataUrl = await readFileAsDataUrl(file);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not load image — try JPEG or PNG.'));
      img.src = dataUrl;
    });
    if (!img.naturalWidth || !img.naturalHeight) {
      throw new Error('Image has no pixel dimensions.');
    }
    return img;
  }

  async function loadImageFromFile(file) {
    if (!isImageFile(file)) {
      throw new Error('Choose a supported image (JPEG, PNG, WebP, GIF, BMP, AVIF, TIFF).');
    }
    if (isHeicFile(file)) {
      throw new Error('HEIC/HEIF is not supported in the browser. Save as JPEG or PNG first.');
    }
    if (typeof createImageBitmap === 'function') {
      try {
        return await loadImageWithBitmap(file);
      } catch {
        // Fall back to data-URL Image when createImageBitmap is unavailable or fails.
      }
    }
    return loadImageWithDataUrl(file);
  }

  async function scanImageSource(source, onProgress) {
    const imageData = drawToImageData(source);
    return scanWithRecovery(imageData, onProgress);
  }

  async function scanImageFile(file, options) {
    const source = await loadImageFromFile(file);
    try {
      return await scanImageSource(source, options?.onProgress);
    } finally {
      source.close?.();
    }
  }

  async function scanLabelPhoto(file, options) {
    if (scanning) {
      return { ok: false, lines: [], error: 'Scan already in progress.' };
    }
    if (!file) {
      return { ok: false, lines: [], error: 'Choose a photo first.' };
    }
    scanning = true;
    try {
      const lines = await scanImageFile(file, options);
      if (!lines.length) {
        return {
          ok: false,
          lines: [],
          error: 'No GS1-128 barcode found. Crop tightly to one barcode and retry.',
        };
      }
      return { ok: true, lines, error: null };
    } catch (e) {
      return {
        ok: false,
        lines: [],
        error: e && e.message ? e.message : 'Scan failed.',
      };
    } finally {
      scanning = false;
    }
  }

  window.scanLabelPhoto = scanLabelPhoto;
  window.scanImageFile = scanImageFile;
})();
