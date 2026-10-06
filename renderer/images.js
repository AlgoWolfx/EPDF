import { t } from './i18n.js';
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
    for(const [key,id] of Object.entries(fields))$(id).value=key==='opacity'?Math.round((object.opacity??1)*100):Math.round(object[key]||0);
  }
  for(const [key,id] of Object.entries(fields))$(id).onchange=()=>{
    const selected=state.sel;if(selected?.obj.type!=='image')return;
    const value=Number($(id).value);if(!Number.isFinite(value)||!$(id).checkValidity()){$(id).reportValidity();return;}
    const crop={...selected.obj,[key]:value};
    if((crop.cropLeft||0)+(crop.cropRight||0)>=100||(crop.cropTop||0)+(crop.cropBottom||0)>=100){toast(t('Kırpma alanı resmi tamamen silemez.'),true);properties(selected.obj);return;}
    history.checkpoint();selected.obj[key]=key==='opacity'?value/100:value;changed();redraw(selected.page);
  };
  $('btnReplaceImage').onclick=()=>pick(true);
  return {pick,properties,place(page,point){
    const image=state.pendingImage;if(!image)return;
    const width=Math.min(300,state.pages[page].baseVp.width-point.x);
    history.checkpoint();const object={...image,type:'image',x:point.x,y:point.y,w:Math.max(20,width),h:Math.max(20,width)*image.naturalHeight/image.naturalWidth,rotation:0,opacity:1};
    (state.annots[page] ||= []).push(object);state.pendingImage=null;tool('select');state.sel={page,obj:object};changed();redraw(page);
  }};
}
