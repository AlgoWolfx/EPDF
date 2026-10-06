import { reconstructLine } from './background.js';
let queue=Promise.resolve();
self.onmessage=({data})=>{
  queue=queue.then(async()=>{
    try{
      const canvas=new OffscreenCanvas(data.bitmap.width,data.bitmap.height);
      canvas.getContext('2d',{willReadFrequently:true}).drawImage(data.bitmap,0,0);data.bitmap.close();
      const [a,b,c,d,e,f]=data.viewport.transform,det=a*d-b*c;
      const viewport={...data.viewport,convertToPdfPoint:(x,y)=>[(d*(x-e)-c*(y-f))/det,(-b*(x-e)+a*(y-f))/det]};
      const patches=[];
      for(const region of data.regions)patches.push(await reconstructLine(canvas,region,viewport));
      canvas.width=canvas.height=0;self.postMessage({id:data.id,patches});
    }catch(error){self.postMessage({id:data.id,error:error.message});}
  });
};
