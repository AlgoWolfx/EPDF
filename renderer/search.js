import { t } from './i18n.js';
const fold=text=>text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').toLowerCase();
export function createSearch({state,plan,navigate,ensurePage,redraw}) {
  const $=id=>document.getElementById(id);
  let generation=0,timer,documentRef,cache=new Map();
  function open(){ $('searchPanel').hidden=false;$('searchInput').focus();$('searchInput').select(); }
  async function search(){
    const token=++generation, query=fold($('searchInput').value.trim()), pdf=state.pdf;
    $('searchResults').replaceChildren();state.searchHit=null;redraw();
    if(!query||!pdf){$('searchStatus').textContent='';return;}
    if(documentRef!==pdf){cache.clear();documentRef=pdf;}
    let count=0;
    $('searchStatus').textContent=t('Aranıyor…');
    for(const [position,entry] of plan().entries()) {
      if(token!==generation||pdf!==state.pdf) return;
      await ensurePage(entry.source);
      const record=state.pages[entry.source];
      if(!cache.has(entry.source)){
        const content=await (await pdf.getPage(entry.source+1)).getTextContent();
        cache.set(entry.source,content.items.filter(item=>item.str?.trim()).map(item=>{
          const [x,y]=record.baseVp.convertToViewportPoint(item.transform[4],item.transform[5]);
          return {text:item.str,x,y:y-item.height,w:item.width,h:item.height};
        }));
      }
      const annots=state.annots[entry.source] || [];
      const edits=annots.filter(item=>item.type==='replaceText');
      const spans=cache.get(entry.source).filter(span=>!edits.some(edit=>{
        const box=edit.source.box;return span.x<box.x+box.w+2&&span.x+span.w>box.x-2&&span.y<box.y+box.h+2&&span.y+span.h>box.y-2;
      }));
      for(const edit of edits) spans.push({...edit.source.box,x:edit.x??edit.source.box.x,y:edit.y??edit.source.box.y,text:edit.text});
      for(const annot of annots){
        if(annot.type==='ocr') spans.push(...annot.lines.map(line=>({...line,text:line.text})));
        if(annot.type==='text') spans.push({...annot,w:annot.boxWidth||annot.text.length*annot.size*.6,h:annot.size*1.2});
      }
      for(const span of spans) if(fold(span.text).includes(query)){
        count++;if(count>500) break;
        const button=document.createElement('button');button.className='search-result';button.textContent=span.text.slice(0,160);
        const pageLabel=document.createElement('small');pageLabel.textContent=t('Sayfa {number}',{number:position+1});button.append(pageLabel);
        button.onclick=()=>{
          for(const result of $('searchResults').children) result.classList.remove('active');
          button.classList.add('active');state.searchHit={page:entry.source,box:span};navigate(position+1);redraw();
        };
        $('searchResults').append(button);
      }
      $('searchStatus').textContent=t('{count} sonuç',{count:Math.min(500,count)});
      if(count>500)break;
      // Yield between pages: search indexing never monopolizes the renderer.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  $('btnSearch').onclick=open;
  $('searchInput').addEventListener('input',()=>{++generation;clearTimeout(timer);$('searchResults').replaceChildren();$('searchStatus').textContent=t('Aranıyor…');timer=setTimeout(search,180);});
  $('searchInput').addEventListener('keydown',event=>{if(event.key==='Escape'){$('btnCloseSearch').click();event.preventDefault();}if(event.key==='Enter')$('searchResults').firstElementChild?.click();});
  $('btnCloseSearch').onclick=()=>{++generation;$('searchPanel').hidden=true;state.searchHit=null;redraw();};
  return {open,reset(){++generation;clearTimeout(timer);cache.clear();$('searchResults').replaceChildren();$('searchStatus').textContent='';state.searchHit=null;},refresh(){if(!$('searchPanel').hidden && $('searchInput').value) {++generation;clearTimeout(timer);timer=setTimeout(search,200);}}};
}
