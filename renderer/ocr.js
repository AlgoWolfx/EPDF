// The worker, WASM core and traineddata all come from local bundled assets.
export function createOcrSession(language, onProgress) {
  let worker;
  let cancelled = false;
  let rejectCancellation;
  const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
  cancellation.catch(() => {});
  const ready = Promise.resolve().then(() => {
    if (cancelled) throw new Error('OCR_CANCELLED');
    if (!['eng', 'tur', 'tur+eng'].includes(language)) throw new Error('Unsupported OCR language.');
    return window.Tesseract.createWorker(language, window.Tesseract.OEM.LSTM_ONLY, {
      workerPath: new URL('../node_modules/tesseract.js/dist/worker.min.js', import.meta.url).href,
      corePath: new URL('../node_modules/tesseract.js-core/', import.meta.url).href,
      workerBlobURL: false,
      cacheMethod: 'none',
      langPath: 'epdf-ocr://models',
      errorHandler: () => {},
      logger: onProgress
    });
  }).then(async instance => {
    worker = instance;
    if (cancelled) { await worker.terminate(); throw new Error('OCR_CANCELLED'); }
    await worker.setParameters({ tessedit_pageseg_mode: window.Tesseract.PSM.AUTO, user_defined_dpi: '300', preserve_interword_spaces: '1' });
    return worker;
  });
  ready.catch(() => {});
  return {
    async recognize(canvas) {
      const instance = await Promise.race([ready, cancellation]);
      return Promise.race([instance.recognize(canvas, {}, { text: true, tsv: true }), cancellation]);
    },
    cancel() { cancelled = true; rejectCancellation(new Error('OCR_CANCELLED')); worker?.terminate(); },
    async terminate() { if (!cancelled) { const instance = await ready.catch(() => null); await instance?.terminate(); } }
  };
}

export function linesFromTsv(tsv, viewport, baseViewport) {
  const groups = new Map();
  for (const record of (tsv || '').trim().split('\n').slice(1)) {
    const parts = record.split('\t');
    if (parts[0] !== '5' || !parts.slice(11).join('\t').trim()) continue;
    const [left, top, width, height, confidence] = parts.slice(6, 11).map(Number);
    if (![left, top, width, height, confidence].every(Number.isFinite) || width <= 0 || height <= 0 || confidence < 0) continue;
    const key = parts.slice(1, 6).join(':');
    const lineKey = key.slice(0, key.lastIndexOf(':'));
    const group = groups.get(lineKey) || { words: [], left, top, right: left + width, bottom: top + height, confidence: [] };
    group.words.push(parts.slice(11).join('\t').trim());
    group.left = Math.min(group.left, left); group.top = Math.min(group.top, top);
    group.right = Math.max(group.right, left + width); group.bottom = Math.max(group.bottom, top + height);
    group.confidence.push(confidence); groups.set(lineKey, group);
  }
  return [...groups.values()].map(group => {
    const pdfPoint = viewport.convertToPdfPoint(group.left, group.bottom - (group.bottom - group.top) * .12);
    const corners = [[group.left, group.top], [group.right, group.top], [group.left, group.bottom], [group.right, group.bottom]].map(point => baseViewport.convertToViewportPoint(...viewport.convertToPdfPoint(...point)));
    const x = Math.min(...corners.map(p => p[0])), y = Math.min(...corners.map(p => p[1]));
    return { text: group.words.join(' '), x, y,
      w: Math.max(...corners.map(p => p[0])) - x, h: Math.max(...corners.map(p => p[1])) - y,
      pdfX: pdfPoint[0], pdfY: pdfPoint[1], angle: viewport.rotation,
      size: (group.bottom - group.top) / viewport.scale / .75,
      width: (group.right - group.left) / viewport.scale,
      confidence: Math.round(group.confidence.reduce((a, b) => a + b, 0) / group.confidence.length), color: '#111111' };
  });
}
