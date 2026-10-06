// Notları PDF'in üzerine kalıcı olarak işler (pdf-lib).
import { polylines, styleOf, effWidth, textMetrics, BASELINE, LINE_HEIGHT } from './geometry.js';
import { removeTextObjects, removeTextObjectsLocal } from './pdf-engine.js';

const {
  PDFDocument, StandardFonts, rgb, degrees,
  pushGraphicsState, popGraphicsState, setGraphicsState,
  moveTo, lineTo, closePath, stroke, fill,
  setLineWidth, setLineCap, setLineJoin, LineCapStyle, LineJoinStyle,
  setStrokingColor, setFillingColor, setCharacterSpacing
} = window.PDFLib;

const TR_FALLBACK = { ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I' };

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function buildPdfLocal({ bytes, annots, viewports, fontBytes, applyPagePlan = true }) {
  const edited = typeof document === 'undefined' ? await removeTextObjectsLocal(bytes,annots) : await removeTextObjects(bytes,annots);
  const doc = await PDFDocument.load(edited,{updateMetadata:false});

  const hasText = Object.values(annots).some(l => l.some(a => a.type === 'text' || (a.type === 'replaceText' && a.text) || (a.type === 'ocr' && a.lines.some(line => line.text))));
  let font = null;
  let unicodeFont = false;
  if (hasText) {
    if (fontBytes) {
      doc.registerFontkit(window.fontkit);
      font = await doc.embedFont(fontBytes, { subset: true });
      unicodeFont = true;
    } else {
      throw new Error('A Unicode font is required for text export.');
    }
  }
  const fonts = new Map();
  async function fontFor(family = 'Arial',style = 'normal') {
    if (family === 'Arial' && style === 'normal') return font;
    const key=family+'/'+style;
    if (!fonts.has(key)) {
      const bytes = await window.api.loadFont(family,style);
      if (!bytes) throw new Error('Yazı tipi yüklenemedi: ' + family);
      doc.registerFontkit(window.fontkit);
      fonts.set(key, await doc.embedFont(bytes, { subset: true }));
    }
    return fonts.get(key);
  }
  function drawStyled(page, text, options, style, width) {
    const spacing = Number(style.spacing) || 0;
    const measured = options.font.widthOfTextAtSize(text, options.size) + Math.max(0,text.length - 1) * spacing;
    const offset = style.align === 'center' ? ((width || measured) - measured) / 2 : style.align === 'right' ? (width || measured) - measured : 0;
    const radians = options.rotate.angle * Math.PI / 180;
    page.pushOperators(pushGraphicsState(), setCharacterSpacing(spacing));
    page.drawText(text, {...options,x:options.x+offset*Math.cos(radians),y:options.y+offset*Math.sin(radians)});
    page.pushOperators(popGraphicsState());
  }

  for (const [key, list] of Object.entries(annots)) {
    if (key === '__pages') continue;
    if (!list.length) continue;
    const idx = Number(key);
    let page = doc.getPage(idx);
    const vp = viewports[idx];
    const angle = (((page.getRotation().angle % 360) + 360) % 360);
    const toPdf = (x, y) => vp.convertToPdfPoint(x, y);
    const gsCache = new Map();
    const gs = (opacity) => {
      if (!gsCache.has(opacity)) {
        const dict = doc.context.obj({ Type: 'ExtGState', CA: opacity, ca: opacity });
        gsCache.set(opacity, page.node.newExtGState('GS', dict));
      }
      return gsCache.get(opacity);
    };

    for (const a of list) {
      if(a.type==='image'){
        let data=Uint8Array.from(atob(a.data.split(',')[1]),c=>c.charCodeAt(0));
        let png=a.data.startsWith('data:image/png');
        if(a.cropLeft||a.cropTop||a.cropRight||a.cropBottom){
          const bitmap=await createImageBitmap(new Blob([data],{type:png?'image/png':'image/jpeg'}));
          const left=(a.cropLeft||0)/100,top=(a.cropTop||0)/100;
          const width=Math.max(1,Math.round(bitmap.width*(1-left-(a.cropRight||0)/100))),height=Math.max(1,Math.round(bitmap.height*(1-top-(a.cropBottom||0)/100)));
          const canvas=new OffscreenCanvas(width,height);
          canvas.getContext('2d').drawImage(bitmap,left*bitmap.width,top*bitmap.height,width,height,0,0,width,height);
          data=new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer());bitmap.close();png=true;
        }
        const image=png?await doc.embedPng(data):await doc.embedJpg(data),radians=(a.rotation||0)*Math.PI/180;
        const [x,y]=toPdf(a.x-a.h*Math.sin(radians),a.y+a.h*Math.cos(radians));
        page.drawImage(image,{x,y,width:a.w,height:a.h,rotate:degrees(angle-(a.rotation||0)),opacity:a.opacity??1});continue;
      }
      if (a.type === 'ocr') {
        for (const line of a.lines) {
          const changed = a.mode === 'editable' && (line.edited || line.text !== (line.sourceText ?? line.text));
          if (changed && !line.patch) throw new Error('Bu OCR taslağı eski sürümden. Satırı yeniden tanı.');
          if (changed && line.patch) {
            const patch = await doc.embedPng(line.patch.data);
            page.drawImage(patch,{x:line.patch.pdfX,y:line.patch.pdfY,width:line.patch.width,height:line.patch.height,rotate:degrees(line.patch.angle)});
          }
          if (!line.text.trim()) continue;
          const selectedFont = await fontFor(line.font,line.fontStyle);
          const size = changed ? line.size : Math.min(line.size, line.width / Math.max(.01, selectedFont.widthOfTextAtSize(line.text, 1)));
          const baseAngle=(vp.rotation-line.angle)*Math.PI/180;
          const [x,y] = line.moved ? toPdf(line.x-line.size*BASELINE*Math.sin(baseAngle),line.y+line.size*BASELINE*Math.cos(baseAngle)) : [line.pdfX,line.pdfY];
          line.text.split('\n').forEach((text,index) => {
            const radians = line.angle * Math.PI / 180, distance = index * size * (line.leading || LINE_HEIGHT);
            drawStyled(page,text,{x:x+distance*Math.sin(radians),y:y-distance*Math.cos(radians),font:selectedFont,
              size:Math.max(1,size),rotate:degrees(line.angle),color:hexToRgb(line.color || '#111111'),opacity:changed ? 1 : 0},line,line.boxWidth || line.width);
          });
        }
        continue;
      }
      if (a.type === 'replaceText') {
        if (a.text) {
          const matrix = a.source.matrix;
          const selectedFont = await fontFor(a.font,a.fontStyle);
          const rotation = Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI;
          const baseAngle=(vp.rotation-rotation)*Math.PI/180;
          const origin = a.moved ? toPdf(a.x-a.size*BASELINE*Math.sin(baseAngle),a.y+a.size*BASELINE*Math.cos(baseAngle)) : [matrix[4],matrix[5]];
          a.text.split('\n').forEach((line, i) => {
            const radians = rotation * Math.PI / 180;
            const distance = i * a.size * (a.leading || LINE_HEIGHT);
            drawStyled(page,line, { x: origin[0] + distance * Math.sin(radians),
              y: origin[1] - distance * Math.cos(radians),
              size: a.size, font:selectedFont, color: hexToRgb(a.color), rotate: degrees(rotation),opacity:a.source.opacity??1 },a,a.boxWidth || a.source.box.w);
          });
        }
        continue;
      }
      if (a.type === 'text') {
        const selectedFont = await fontFor(a.font,a.fontStyle);
        const { lines } = textMetrics(a);
        lines.forEach((line, i) => {
          let s = line;
          if (!unicodeFont) s = s.replace(/[şŞğĞıİ]/g, c => TR_FALLBACK[c]);
          if (!s) return;
          const [x, y] = toPdf(a.x, a.y + a.size * BASELINE + i * a.size * (a.leading || LINE_HEIGHT));
          try {
            drawStyled(page,s, { x, y, size: a.size, font:selectedFont, color: hexToRgb(a.color), rotate: degrees(angle) },a,a.boxWidth);
          } catch {
            page.drawText(s.replace(/[^\x20-\x7e]/g, '?'), { x, y, size: a.size, font, color: hexToRgb(a.color), rotate: degrees(angle) });
          }
        });
        continue;
      }

      const st = styleOf(a);
      const color = hexToRgb(a.color);
      for (const pl of polylines(a)) {
        const ops = [
          pushGraphicsState(),
          setGraphicsState(gs(st.opacity)),
          setStrokingColor(color),
          setFillingColor(color),
          setLineWidth(effWidth(a)),
          setLineCap(LineCapStyle.Round),
          setLineJoin(LineJoinStyle.Round)
        ];
        pl.pts.forEach(([x, y], i) => {
          const [px, py] = toPdf(x, y);
          ops.push(i ? lineTo(px, py) : moveTo(px, py));
        });
        if (pl.closed) ops.push(closePath());
        ops.push(st.fill ? fill() : stroke());
        ops.push(popGraphicsState());
        page.pushOperators(...ops);
      }
    }
  }

  if (applyPagePlan && annots.__pages?.[0]) {
    const pages = doc.getPages();
    const plan = annots.__pages[0].entries;
    if (!plan.length || new Set(plan.map(entry => entry.source)).size !== plan.length ||
        plan.some(entry => !Number.isInteger(entry.source) || !pages[entry.source] || ![0, 90, 180, 270].includes(entry.rotation))) {
      throw new Error('Invalid page arrangement.');
    }
    for (let i = pages.length - 1; i >= 0; i--) doc.removePage(i);
    for (const entry of plan) {
      const page = pages[entry.source];
      page.setRotation(degrees((page.getRotation().angle + entry.rotation) % 360));
      doc.addPage(page);
    }
  }
  return doc.save();
}

let workerPromise,sequence=0;
const pending=new Map();
export async function buildPdf(options) {
  workerPromise ||= window.api.loadPdfiumWasm().then(wasm=>{
    const worker=new Worker(new URL('./export-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=async({data})=>{
      if(data.fontRequest){
        try{const bytes=await window.api.loadFont(data.family,data.style);worker.postMessage({fontResponse:data.fontRequest,bytes});}
        catch(error){worker.postMessage({fontResponse:data.fontRequest,error:error.message});}
        return;
      }
      const job=pending.get(data.id);if(!job)return;pending.delete(data.id);
      if(data.error)job.reject(new Error(data.error));else job.resolve(data.result);
    };
    worker.onerror=()=>{
      for(const job of pending.values())job.reject(new Error('PDF oluşturulamadı. Lütfen yeniden dene.'));
      pending.clear();worker.terminate();workerPromise=null;
    };
    worker.postMessage({wasm},[wasm.buffer]);return worker;
  });
  const worker=await workerPromise,id=++sequence;
  const bytes=options.bytes.slice();
  const viewports=options.viewports.map(viewport=>viewport?{transform:viewport.transform,rotation:viewport.rotation}:null);
  return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({...options,id,bytes,viewports},[bytes.buffer]);});
}
