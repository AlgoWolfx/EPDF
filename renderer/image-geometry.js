// Image geometry uses source page units, independent of zoom/page rotation.
export function imageCorners(image) {
  const radians=(image.rotation || 0)*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
  return [['nw',0,0],['ne',image.w,0],['se',image.w,image.h],['sw',0,image.h]].map(([handle,x,y])=>({
    handle,x:image.x+x*cos-y*sin,y:image.y+x*sin+y*cos
  }));
}

export function imageLocalPoint(image,point) {
  const radians=(image.rotation || 0)*Math.PI/180,dx=point.x-image.x,dy=point.y-image.y;
  return {x:dx*Math.cos(radians)+dy*Math.sin(radians),y:-dx*Math.sin(radians)+dy*Math.cos(radians)};
}

export function imageHandleAt(image,point,tolerance) {
  return imageCorners(image).find(corner=>Math.hypot(point.x-corner.x,point.y-corner.y)<=tolerance)?.handle || null;
}

export function resizedImage(initial,handle,point,lockAspect=true) {
  const opposite={nw:'se',ne:'sw',se:'nw',sw:'ne'}[handle];
  const anchor=imageCorners(initial).find(corner=>corner.handle===opposite);
  const local=imageLocalPoint({...initial,x:anchor.x,y:anchor.y},point);
  const sx=handle.includes('e')?1:-1,sy=handle.includes('s')?1:-1;
  let w,h;
  if(lockAspect){
    const factor=(local.x*sx*initial.w+local.y*sy*initial.h)/(initial.w**2+initial.h**2);
    const bounded=Math.min(10000/Math.max(initial.w,initial.h),Math.max(1/Math.min(initial.w,initial.h),factor));
    w=initial.w*bounded;h=initial.h*bounded;
  }else{
    w=Math.min(10000,Math.max(1,sx*local.x));h=Math.min(10000,Math.max(1,sy*local.y));
  }
  const radians=(initial.rotation || 0)*Math.PI/180;
  const ax=sx===1?0:w,ay=sy===1?0:h;
  return {x:anchor.x-ax*Math.cos(radians)+ay*Math.sin(radians),
    y:anchor.y-ax*Math.sin(radians)-ay*Math.cos(radians),w,h};
}

export function imageResizeCursor(image,handle,pageRotation=0) {
  const angle=(handle==='ne'||handle==='sw'?-45:45)+(image.rotation || 0)+pageRotation;
  const index=((Math.round(angle/45)%4)+4)%4;
  return ['ew-resize','nwse-resize','ns-resize','nesw-resize'][index];
}
