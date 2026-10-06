// Serialization and font subsetting run off the UI thread.
let ready,queue=Promise.resolve(),fontSequence=0;
const fonts=new Map(),pendingFonts=new Map();
globalThis.window=globalThis;
async function loadFont(family,style='normal'){
  const key=family+'/'+style;
  if(fonts.has(key))return fonts.get(key);
  const fontRequest=++fontSequence;
  const bytes=await new Promise((resolve,reject)=>{pendingFonts.set(fontRequest,{resolve,reject});self.postMessage({fontRequest,family,style});});
  fonts.set(key,bytes);return bytes;
}
self.onmessage=({data})=>{
  if(data.fontResponse){
    const job=pendingFonts.get(data.fontResponse);pendingFonts.delete(data.fontResponse);
    if(data.error)job.reject(new Error(data.error));else job.resolve(data.bytes);return;
  }
  if(data.wasm){
    window.api={loadPdfiumWasm:async()=>data.wasm,loadFont};
    ready=(async()=>{
      await import('../node_modules/pdf-lib/dist/pdf-lib.min.js');
      await import('../node_modules/@pdf-lib/fontkit/dist/fontkit.umd.min.js');
      return import('./export.js');
    })();return;
  }
  queue=queue.then(async()=>{
    try{
      const {buildPdfLocal}=await ready;
      const viewports=data.viewports.map(viewport=>{
        if(!viewport)return null;
        const [a,b,c,d,e,f]=viewport.transform,det=a*d-b*c;
        return {rotation:viewport.rotation,convertToPdfPoint:(x,y)=>[(d*(x-e)-c*(y-f))/det,(-b*(x-e)+a*(y-f))/det]};
      });
      const result=await buildPdfLocal({...data,viewports});
      self.postMessage({id:data.id,result},[result.buffer]);
    }catch(error){self.postMessage({id:data.id,error:error.message});}
  });
};
