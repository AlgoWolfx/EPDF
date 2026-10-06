import { inspectTextObjectsLocal, removeTextObjectsLocal } from './pdf-engine.js';
let wasm,queue=Promise.resolve();
globalThis.window={api:{loadPdfiumWasm:async()=>wasm}};
self.onmessage=({data})=>{
  if(data.wasm){wasm=data.wasm;return;}
  queue=queue.then(async()=>{
    try{
      const result=data.action==='inspect'?await inspectTextObjectsLocal(data.bytes,data.value):await removeTextObjectsLocal(data.bytes,data.value);
      self.postMessage({id:data.id,result},result instanceof Uint8Array?[result.buffer]:[]);
    }catch(error){self.postMessage({id:data.id,error:error.message});}
  });
};
