import { t } from './i18n.js';
import { imageCorners, imageHandleAt, resizedImage, imageResizeCursor } from './image-geometry.js';
export function createImages({state,history,changed,redraw,tool,toast}) {
  const $=id=>document.getElementById(id);
  async function read() {
    const path=await window.api.imageDialog();if(!path)return null;
    const bytes=await window.api.readFile(path);
    if(bytes.length>40e6)throw new Error(t('Resim çok büyük. Daha küçük bir PNG veya JPEG seç.'));
    let binary='';for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));
    const data='data:image/'+(/\.png$/i.test(path)?'png':'jpeg')+';base64,'+btoa(binary);
    const image=new Image();image.src=data;await image.decode();
    if(image.width*image.height>40e6)throw new Error(t('Resim çok büyük. Daha küçük bir PNG veya JPEG seç.'));
    return {data,naturalWidth:image.width,naturalHeight:image.height};
  }
  async function pick(replace=false) {
    if(!state.pdf){toast(t('Önce bir PDF aç.'));return;}
    const pdf=state.pdf,selected=state.sel;
    try {
      const image=await read();if(!image||state.pdf!==pdf)return;
      if(replace&&selected?.obj.type==='image'){
        history.checkpoint();Object.assign(selected.obj,image,{cropLeft:0,cropRight:0,cropTop:0,cropBottom:0});changed();redraw(selected.page);
      }else {state.pendingImage=image;tool('image');toast(t('Resmi yerleştirmek için sayfaya tıkla.'));}
    }catch(error){toast(t('Resim yüklenemedi: {message}',{message:error.message}),true);}
  }
  const fields={w:'imageWidth',h:'imageHeight',rotation:'imageRotation',opacity:'imageOpacity',cropLeft:'imageCropLeft',cropTop:'imageCropTop',cropRight:'imageCropRight',cropBottom:'imageCropBottom'};
  function properties(object){
    $('imageProperties').hidden=false;
    $('imageLockAspect').checked=state.imageAspectLocked ?? true;
    for(const [key,id] of Object.entries(fields))$(id).value=key==='opacity'?Math.round((object.opacity??1)*100):Math.round(object[key]||0);
  }
  for(const [key,id] of Object.entries(fields))$(id).onchange=()=>{
    const selected=state.sel;if(selected?.obj.type!=='image')return;
    const value=Number($(id).value);if(!Number.isFinite(value)||!$(id).checkValidity()){$(id).reportValidity();return;}
    const crop={...selected.obj,[key]:value};
    if((crop.cropLeft||0)+(crop.cropRight||0)>=100||(crop.cropTop||0)+(crop.cropBottom||0)>=100){toast(t('Kırpma alanı resmi tamamen silemez.'),true);properties(selected.obj);return;}
    const object=selected.obj;
    const next=key==='opacity'?value/100:value;
    if(object[key]===next){properties(object);return;}
    const dimensions={};
    if((state.imageAspectLocked ?? true) && (key==='w'||key==='h')){
      dimensions[key==='w'?'h':'w']=key==='w'?value*object.h/object.w:value*object.w/object.h;
      if(Object.values(dimensions).some(size=>size<1||size>10000)){toast(t('Görsel boyutu 1 ile 10000 arasında olmalı.'),true);properties(object);return;}
    }
    history.checkpoint();Object.assign(object,dimensions,{[key]:next});changed();redraw(selected.page);
  };
  $('imageLockAspect').onchange=()=>{state.imageAspectLocked=$('imageLockAspect').checked;};
  function scaleSelected(factor){
    const selected=state.sel;if(selected?.obj.type!=='image')return;
    const object=selected.obj;
    const bounded=Math.min(10000/Math.max(object.w,object.h),Math.max(1/Math.min(object.w,object.h),factor));
    if(bounded===1)return;
    history.checkpoint();object.w*=bounded;object.h*=bounded;changed();redraw(selected.page);
  }
  $('btnImageSmaller').onclick=()=>scaleSelected(.9);
  $('btnImageLarger').onclick=()=>scaleSelected(1.1);
  $('btnReplaceImage').onclick=()=>pick(true);
  return {pick,properties,
    handleAt:(object,point)=>imageHandleAt(object,point,7/state.scale),
    resizeCursor:(object,handle,page)=>imageResizeCursor(object,handle,page.vp.rotation-page.baseVp.rotation),
    resize(object,initial,handle,point){Object.assign(object,resizedImage(initial,handle,point,state.imageAspectLocked ?? true));properties(object);},
    drawSelection(context,object){
      const corners=imageCorners(object),size=7/state.scale;
      context.save();context.strokeStyle='#2469b4';context.fillStyle='#fff';context.lineWidth=1/state.scale;context.setLineDash([]);
      context.beginPath();corners.forEach((corner,index)=>index?context.lineTo(corner.x,corner.y):context.moveTo(corner.x,corner.y));context.closePath();context.stroke();
      for(const corner of corners){context.fillRect(corner.x-size/2,corner.y-size/2,size,size);context.strokeRect(corner.x-size/2,corner.y-size/2,size,size);}
      context.restore();
    },
    place(page,point){
    const image=state.pendingImage;if(!image)return;
    const width=Math.min(300,state.pages[page].baseVp.width-point.x);
    history.checkpoint();const object={...image,type:'image',x:point.x,y:point.y,w:Math.max(20,width),h:Math.max(20,width)*image.naturalHeight/image.naturalWidth,rotation:0,opacity:1};
    (state.annots[page] ||= []).push(object);state.pendingImage=null;tool('select');state.sel={page,obj:object};changed();redraw(page);
  }};
}
