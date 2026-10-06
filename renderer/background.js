// Reconstruct only the recognized line's region, never the whole scan/page.
// Bright paper is inferred from local pixels. Long table rules are retained.
export async function reconstructLine(canvas, region, viewport) {
  const pad = Math.max(2, Math.round(viewport.scale));
  const x = Math.max(0, Math.floor(region.left - pad)), y = Math.max(0, Math.floor(region.top - pad));
  const w = Math.min(canvas.width - x, Math.ceil(region.right - x + pad));
  const h = Math.min(canvas.height - y, Math.ceil(region.bottom - y + pad));
  const pixels = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, w, h);
  const data = pixels.data, samples = [];
  for (let i = 0; i < data.length; i += 16) samples.push([data[i], data[i + 1], data[i + 2]]);
  samples.sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]));
  const bright = samples.slice(0, Math.max(1, Math.floor(samples.length * .45)));
  const color = [0, 1, 2].map(channel => Math.round(bright.reduce((sum, item) => sum + item[channel], 0) / bright.length));
  const distance = (offset) => Math.max(...color.map((value, c) => Math.abs(value - data[offset + c])));
  const keep = new Uint8Array(w * h);
  for (let row = 0; row < h; row++) {
    let start = -1;
    for (let col = 0; col <= w; col++) {
      if (col < w && distance((row * w + col) * 4) > 50) { if (start < 0) start = col; }
      else if (start >= 0) {
        if (col - start > Math.max(h * 2, w * .6)) keep.fill(1, row * w + start, row * w + col);
        start = -1;
      }
    }
  }
  const ink=[];
  for(let i=0;i<w*h;i++)if(!keep[i]&&distance(i*4)>80)ink.push([data[i*4],data[i*4+1],data[i*4+2]]);
  ink.sort((a,b)=>(a[0]+a[1]+a[2])-(b[0]+b[1]+b[2]));
  const darkest=ink.slice(0,Math.max(1,Math.floor(ink.length*.2)));
  const textColor=darkest.length?'#'+[0,1,2].map(c=>Math.round(darkest.reduce((sum,pixel)=>sum+pixel[c],0)/darkest.length).toString(16).padStart(2,'0')).join(''):'#111111';
  for (let i = 0; i < w * h; i++) if (!keep[i] && distance(i * 4) > 30) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = color[c];
  }
  const patch = typeof document==='undefined'?new OffscreenCanvas(w,h):document.createElement('canvas'); patch.width = w; patch.height = h;
  patch.getContext('2d').putImageData(pixels, 0, 0);
  const [pdfX, pdfY] = viewport.convertToPdfPoint(x, y + h);
  let png;
  if(patch.convertToBlob){
    const bytes=new Uint8Array(await (await patch.convertToBlob({type:'image/png'})).arrayBuffer());
    let binary='';for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));
    png='data:image/png;base64,'+btoa(binary);
  }else png=patch.toDataURL('image/png');
  const result = { data: png, pdfX, pdfY, width: w / viewport.scale,
    height: h / viewport.scale, angle: viewport.rotation, simplePaper: Math.min(...color) > 180, textColor };
  patch.width = patch.height = 0;
  return result;
}

let worker,sequence=0;
const pending=new Map();
export async function reconstructRegions(canvas,regions,viewport){
  if(!worker){
    worker=new Worker(new URL('./background-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;pending.delete(data.id);data.error?job.reject(new Error(data.error)):job.resolve(data.patches);};
    worker.onerror=()=>cancelBackground('Arka plan onarımı tamamlanamadı.');
  }
  const target=worker,bitmap=await createImageBitmap(canvas),id=++sequence;
  if(worker!==target){bitmap.close();throw new Error('OCR_CANCELLED');}
  return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});target.postMessage({id,bitmap,regions,viewport:{transform:viewport.transform,scale:viewport.scale,rotation:viewport.rotation}},[bitmap]);});
}
export function cancelBackground(message='OCR_CANCELLED'){
  worker?.terminate();worker=null;
  for(const job of pending.values())job.reject(new Error(message));
  pending.clear();
}
