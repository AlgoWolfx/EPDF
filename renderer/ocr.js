import { reconstructRegions } from './background.js';
export const OCR_LANGUAGES = ['eng', 'tur', 'por', 'tur+eng'];
// The worker, WASM core and traineddata all come from local bundled assets.
export function createOcrSession(language, onProgress) {
  let worker;
  let cancelled = false;
  let rejectCancellation;
  const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
  cancellation.catch(() => {});
  const ready = Promise.resolve().then(() => {
    if (cancelled) throw new Error('OCR_CANCELLED');
    if (!OCR_LANGUAGES.includes(language)) throw new Error('Unsupported OCR language.');
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
    const group = groups.get(lineKey) || { id: lineKey, block: parts.slice(1, 3).join(':'), words: [], left, top, right: left + width, bottom: top + height, confidence: [] };
    const corners = [[left, top], [left + width, top + height]].map(point => baseViewport.convertToViewportPoint(...viewport.convertToPdfPoint(...point)));
    group.words.push({ text: parts.slice(11).join('\t').trim(), confidence,
      x: Math.min(...corners.map(p => p[0])), y: Math.min(...corners.map(p => p[1])),
      w: Math.abs(corners[1][0] - corners[0][0]), h: Math.abs(corners[1][1] - corners[0][1]), order: group.words.length });
    group.left = Math.min(group.left, left); group.top = Math.min(group.top, top);
    group.right = Math.max(group.right, left + width); group.bottom = Math.max(group.bottom, top + height);
    group.confidence.push(confidence); groups.set(lineKey, group);
  }
  return [...groups.values()].map((group, order) => {
    const pdfPoint = viewport.convertToPdfPoint(group.left, group.bottom - (group.bottom - group.top) * .12);
    const corners = [[group.left, group.top], [group.right, group.top], [group.left, group.bottom], [group.right, group.bottom]].map(point => baseViewport.convertToViewportPoint(...viewport.convertToPdfPoint(...point)));
    const x = Math.min(...corners.map(p => p[0])), y = Math.min(...corners.map(p => p[1]));
    const text = group.words.map(word => word.text).join(' ');
    return { id: group.id, block: group.block, order, words: group.words, text, sourceText: text, x, y,
      w: Math.max(...corners.map(p => p[0])) - x, h: Math.max(...corners.map(p => p[1])) - y,
      pdfX: pdfPoint[0], pdfY: pdfPoint[1], angle: viewport.rotation,
      size: (group.bottom - group.top) / viewport.scale / .75,
      width: (group.right - group.left) / viewport.scale,
      confidence: Math.round(group.confidence.reduce((a, b) => a + b, 0) / group.confidence.length), color: '#111111',
      region:{left:group.left,top:group.top,right:group.right,bottom:group.bottom} };
  });
}
export async function prepareOcrLines(tsv,viewport,baseViewport,canvas){
  const lines=linesFromTsv(tsv,viewport,baseViewport);
  if(!lines.length)return [];
  const patches=await reconstructRegions(canvas,lines.map(line=>line.region),viewport);
  return lines.map((line,index)=>{const {region,...model}=line;return {...model,patch:patches[index],color:patches[index].textColor};});
}

export function blocksFromLines(lines) {
  const blocks = new Map();
  for (const line of lines) {
    const block = blocks.get(line.block) || { id: line.block, lines: [], order: blocks.size, rotation: line.angle };
    block.lines.push(line.id); blocks.set(line.block, block);
  }
  return [...blocks.values()].map(block => {
    const items = lines.filter(line => line.block === block.id);
    const x = Math.min(...items.map(line => line.x)), y = Math.min(...items.map(line => line.y));
    return { ...block, x, y, w: Math.max(...items.map(line => line.x + line.w)) - x,
      h: Math.max(...items.map(line => line.y + line.h)) - y,
      confidence: Math.round(items.reduce((sum, line) => sum + line.confidence, 0) / items.length) };
  });
}

// Treat short native captions on a large scan differently from a digital page.
export async function classifyPage(page) {
  const content = await page.getTextContent();
  const items = content.items.filter(item => item.str?.trim());
  const text = items.map(item => item.str).join('');
  const useful = [...text].filter(c => /[\p{L}\p{N}]/u.test(c)).length;
  const corrupt = (text.match(/[\ufffd\u0000]/g) || []).length > Math.max(2, text.length * .05);
  const ops = await page.getOperatorList();
  // PDF.js operator names are stable in the imported runtime, no magic integers.
  const pdfjs = await import('../node_modules/pdfjs-dist/build/pdf.min.mjs');
  const hasImages = ops.fnArray.some(op => [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject].includes(op));
  let matrix=[1,0,0,1,0,0],stack=[],imageArea=0;
  for(let i=0;i<ops.fnArray.length;i++){
    const op=ops.fnArray[i];
    if(op===pdfjs.OPS.save)stack.push(matrix.slice());
    else if(op===pdfjs.OPS.restore)matrix=stack.pop() || matrix;
    else if(op===pdfjs.OPS.transform)matrix=pdfjs.Util.transform(matrix,ops.argsArray[i]);
    else if([pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject].includes(op))imageArea+=Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2]);
  }
  const viewport=page.getViewport({scale:1}),imageCoverage=Math.min(1,imageArea/(viewport.width*viewport.height));
  const imageDominant=hasImages&&imageCoverage>.4;
  return { kind: corrupt ? 'corrupt' : hasImages ? (useful ? 'mixed' : 'scan') : useful ? 'native' : 'empty',
    needsOcr: corrupt || imageDominant || !useful, imageCoverage, content };
}
