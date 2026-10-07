import { installIcons } from './icons.js';
import { t } from './i18n.js';
import { drawAnnot } from './geometry.js';
import * as pdfjs from '../node_modules/pdfjs-dist/build/pdf.min.mjs';

export function createDesktop({state,plan,ensurePage,navigate,inline,images}) {
  const $ = id => document.getElementById(id);
  installIcons();
  let signature = '', documentRef, thumbnailQueue = Promise.resolve();
  const thumbs = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      const button = entry.target; thumbs.unobserve(button);
      thumbnailQueue = thumbnailQueue.then(async () => {
        const pdf = state.pdf, source = Number(button.dataset.source);
        if (!pdf || !button.isConnected) return;
        await ensurePage(source);
        if(state.pdf!==pdf || !button.isConnected)return;
        const record = state.pages[source], page = await (state.previewPdf || pdf).getPage(source + 1);
        const viewport = page.getViewport({scale:118/record.vp.width,rotation:record.vp.rotation});
        const canvas = button.querySelector('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        try {
          await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport}).promise;
          const context=canvas.getContext('2d');
          context.setTransform(viewport.scale,0,0,viewport.scale,0,0);
          context.transform(...pdfjs.Util.transform(record.vp.transform,pdfjs.Util.inverseTransform(record.baseVp.transform)));
          for(const annot of state.annots[source] || []) if(!['replaceText','ocr'].includes(annot.type))drawAnnot(context,annot);
        }
        catch (error) { if (error.name !== 'RenderingCancelledException') button.title=t('Sayfa önizlemesi oluşturulamadı.'); }
      }).catch(() => { button.title = t('Sayfa önizlemesi oluşturulamadı.'); });
    }
  },{root:$('thumbnails').parentElement,rootMargin:'150px'});
  async function outline(pdf) {
    const entries = await pdf.getOutline();
    if (state.pdf !== pdf) return;
    $('outline').replaceChildren();
    if (!entries?.length) { $('outline').textContent = t('Bu belgede içindekiler yok.'); return; }
    function append(items,depth=0) {
      for (const item of items) {
        const button = document.createElement('button');button.className='outline-item';
        button.style.paddingLeft=4+depth*12+'px';button.textContent=item.title;
        button.onclick=async () => {
          try {
            const dest=typeof item.dest==='string'?await pdf.getDestination(item.dest):item.dest;
            if (!dest) return;
            const source=typeof dest[0]==='number'?dest[0]:await pdf.getPageIndex(dest[0]);
            const index=plan().findIndex(entry=>entry.source===source);
            if(index>=0) navigate(index+1);
          } catch {button.title=t('Yer işareti açılamadı.');}
        };
        $('outline').append(button); append(item.items || [],depth+1);
      }
    }
    append(entries);
  }
  function refresh() {
    $('documentTab').textContent=state.pdf?state.name+'.pdf':t('Belge açık değil');
    $('documentTab').title=$('documentTab').textContent;
    $('tabDirty').hidden=!state.pdf || JSON.stringify(inline.draft(state.annots))===state.savedAnnots;
    const next=JSON.stringify(plan());
    if (state.pdf!==documentRef || signature!==next) {
      const different=state.pdf!==documentRef;documentRef=state.pdf;signature=next;
      thumbs.disconnect();$('thumbnails').replaceChildren();
      if (different && state.pdf) outline(state.pdf).catch(()=>{$('outline').textContent=t('İçindekiler okunamadı.');});
      plan().forEach((entry,index)=>{
        const button=document.createElement('button');button.className='thumbnail';button.dataset.source=entry.source;
        button.setAttribute('aria-label',t('Sayfa {number}',{number:index+1}));
        const canvas=document.createElement('canvas');canvas.width=118;canvas.height=160;
        const label=document.createElement('span');label.textContent=String(index+1);button.append(canvas,label);
        button.onclick=()=>navigate(index+1);$('thumbnails').append(button);thumbs.observe(button);
      });
    }
    current();
    $('imageProperties').hidden=true;
    if (inline.active) return;
    if(state.contentSelection){inline.properties(state.contentSelection.object);$('propertyHint').textContent=t('Seçili metin · Çift tıkla ve düzenle');return;}
    const obj=state.sel?.obj;
    if(obj?.type==='image'){
      $('textProperties').hidden=true;$('strokeProperties').hidden=true;$('colorProperties').hidden=true;
      $('propertyHint').textContent=t('Köşelerden boyutlandır · Sürükleyerek taşı');images.properties(obj);return;
    }
    const text=obj?.type==='text'||['text','editText'].includes(state.tool);
    const color=!!obj||!['select','view'].includes(state.tool);
    $('textProperties').hidden=!text;$('strokeProperties').hidden=!color||text;$('colorProperties').hidden=!color;
    $('btnCommitText').hidden=true;
    $('propertyHint').textContent=t(obj?'Seçili nesne':state.tool==='editText'?'Metne tıkla. Tarama ise OCR otomatik başlar.':state.tool==='text'?'Sayfaya tıklayarak metin ekle.':state.tool==='view'?'Sayfayı sürükleyerek kaydır.':'Bir araç veya nesne seç.');
    if(obj?.type==='text') inline.properties(obj);
  }
  function current() {const source=plan()[state.current-1]?.source;for(const button of $('thumbnails').children) button.classList.toggle('active',Number(button.dataset.source)===source);}
  for(const button of document.querySelectorAll('[data-panel]')) button.onclick=()=>{
    for(const tab of document.querySelectorAll('[data-panel]')) {const selected=tab===button;tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',selected);}
    $('thumbnails').hidden=button.dataset.panel!=='thumbnails';$('outline').hidden=button.dataset.panel!=='outline';
  };
  document.addEventListener('click',event=>{for(const menu of document.querySelectorAll('details.menu')) if(!menu.contains(event.target)||event.target.closest('.menu-popup button')) menu.open=false;});
  let theme='light';try {theme=localStorage.getItem('epdf:theme')||'light';} catch {}
  document.documentElement.dataset.theme=theme;
  $('btnNight').onclick=()=>{theme=theme==='light'?'dark':'light';document.documentElement.dataset.theme=theme;try{localStorage.setItem('epdf:theme',theme);}catch{}};
  return {refresh,current,invalidateThumbnails(){for(const button of $('thumbnails').children)thumbs.observe(button);}};
}
