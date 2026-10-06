import { t } from './i18n.js';
import { BASELINE, textEditorMetrics } from './geometry.js';

export function createInlineEditor({state, history, changed, redraw, update, toast}) {
  const $ = id => document.getElementById(id);
  let active = null;
  const fields = {font:'textFont',fontStyle:'textStyle',size:'fontSize',align:'textAlign',leading:'textLeading',spacing:'textSpacing',x:'textX',y:'textY',boxWidth:'textBoxWidth',color:'colorPick'};
  function properties(object) {
    for (const [key,id] of Object.entries(fields)) {
      const value = object[key] ?? ({font:'Arial',fontStyle:'normal',size:16,align:'left',leading:1.2,spacing:0,color:'#111111',boxWidth:200}[key] ?? 0);
      $(id).value = typeof value === 'number' ? Math.round(value * 100) / 100 : value;
    }
    $('textProperties').hidden = false; $('colorProperties').hidden = false;
    $('strokeProperties').hidden = true; $('btnCommitText').hidden = !active;
  }
  function position() {
    if (!active) return;
    const {page,object,textarea,angle} = active, record = state.pages[page];
    const origin = record.vp.convertToViewportPoint(...record.baseVp.convertToPdfPoint(object.x,object.y));
    const {width,height,offset}=textEditorMetrics(object,textarea.value,state.scale);
    const radians=angle*Math.PI/180;
    Object.assign(textarea.style,{left:origin[0]*state.scale+offset*Math.cos(radians)+'px',top:origin[1]*state.scale+offset*Math.sin(radians)+'px',
      width:width+'px',height:height+'px',
      fontFamily:object.font || 'Arial',fontSize:object.size*state.scale+'px',lineHeight:String(object.leading || 1.2),
      fontWeight:object.fontStyle?.includes('bold')?'bold':'normal',fontStyle:object.fontStyle?.includes('italic')?'italic':'normal',
      letterSpacing:(object.spacing || 0)*state.scale+'px',textAlign:object.align || 'left',color:object.color,
      transform:'rotate('+angle+'deg)',transformOrigin:'0 0'});
  }
  function write(annots, editor = active) {
    if (!editor) return annots;
    const text = editor.textarea?.value.trimEnd() ?? editor.object.text;
    if (text === editor.initial.text &&
        Object.keys(editor.initial).every(key => JSON.stringify(editor.object[key]) === JSON.stringify(editor.initial[key]))) return annots;
    const {page,source,ocrIndex,lineIndex,object} = editor;
    const edited = {...object,text};
    if (ocrIndex !== undefined) {
      const line = annots[page][ocrIndex].lines[lineIndex];
      annots[page][ocrIndex].mode = 'editable';
      Object.assign(line,edited,{edited:true});
    } else {
      const list = annots[page] ||= [];
      const index = list.findIndex(item => item.type === 'replaceText' && item.source.index === source.index);
      if (index >= 0) list.splice(index,1);
      const styleChanged = edited.size !== source.size || edited.color !== source.color || edited.moved ||
        edited.font !== (source.family || 'Arial') || edited.fontStyle !== (source.fontStyle||'normal') || edited.align !== 'left' || edited.spacing !== 0 || edited.leading !== 1.2 || edited.boxWidth !== source.box.w;
      if (edited.text !== source.text || styleChanged) list.push({...edited,type:'replaceText',source});
    }
    return annots;
  }
  function draft(annots) { return active ? write(structuredClone(annots)) : annots; }
  function commit(cancel = false) {
    if (!active) return;
    const editor = active, page = editor.page;
    const annots = cancel ? null : write(structuredClone(state.annots));
    active = null; state.inlineEditing = false;
    editor.textarea.remove();
    state.contentSelection = cancel ? null : {...editor,textarea:null,initial:structuredClone(editor.object)};
    if (!cancel) {
      if (JSON.stringify(annots) !== JSON.stringify(state.annots)) {
        history.checkpoint(); state.annots = annots; changed();
      }
    }
    $('btnCommitText').hidden = true; redraw(page); update();
  }
  function makeSelection(selection) {
    const {page,source,ocrIndex,lineIndex} = selection;
    const ocrLine = ocrIndex !== undefined ? state.annots[page][ocrIndex].lines[lineIndex] : null;
    const existing = !ocrLine && (state.annots[page] || []).find(item => item.type === 'replaceText' && item.source.index === source.index);
    const original = ocrLine || source;
    const pdfAngle=ocrLine?.angle ?? Math.atan2(source.matrix[1],source.matrix[0])*180/Math.PI;
    const baseline=state.pages[page].baseVp.convertToViewportPoint(ocrLine?.pdfX ?? source.matrix[4],ocrLine?.pdfY ?? source.matrix[5]);
    const radians=(state.pages[page].baseVp.rotation-pdfAngle)*Math.PI/180;
    const size=ocrLine?.size ?? existing?.size ?? source.size;
    const origin=[baseline[0]+size*BASELINE*Math.sin(radians),baseline[1]-size*BASELINE*Math.cos(radians)];
    const object = {...(ocrLine || existing || {}), text:ocrLine?.text ?? existing?.text ?? source.text,
      size:ocrLine?.size ?? existing?.size ?? source.size, color:ocrLine?.color ?? existing?.color ?? source.color,
      x:ocrLine?.moved?ocrLine.x:existing?.x ?? origin[0], y:ocrLine?.moved?ocrLine.y:existing?.y ?? origin[1],
      boxWidth:ocrLine?.boxWidth ?? existing?.boxWidth ?? ocrLine?.width ?? source.box.w,
      font:ocrLine?.font ?? existing?.font ?? source?.family ?? 'Arial',
      fontStyle:ocrLine?.fontStyle ?? existing?.fontStyle ?? source?.fontStyle ?? 'normal',
      align:ocrLine?.align ?? existing?.align ?? 'left', leading:ocrLine?.leading ?? existing?.leading ?? 1.2,
      spacing:ocrLine?.spacing ?? existing?.spacing ?? 0};
    const angle = state.pages[page].vp.rotation - (ocrLine?.angle ?? Math.atan2(source.matrix[1],source.matrix[0])*180/Math.PI);
    return {page,source,ocrIndex,lineIndex,object,angle,initial:structuredClone(object)};
  }
  function select(selection) {
    commit(); state.contentSelection = makeSelection(selection); state.sel=null;
    properties(state.contentSelection.object); update(); redraw(selection.page);
  }
  function mutateSelection(mutator, checkpoint = true) {
    const selected=state.contentSelection;if(!selected)return;
    if(checkpoint)history.checkpoint();
    mutator(selected.object);
    state.annots=write(structuredClone(state.annots),selected);
    selected.initial=structuredClone(selected.object);changed();redraw(selected.page);
  }
  function start(selection) {
    commit();
    const editor=makeSelection(selection),{page,source,ocrIndex,lineIndex,object,angle}=editor;
    const ocrLine=ocrIndex!==undefined?state.annots[page][ocrIndex].lines[lineIndex]:null;
    const textarea = document.createElement('textarea'); textarea.className = 'textedit inline-existing';
    textarea.value = object.text; textarea.spellcheck = false; textarea.setAttribute('aria-label',t('Metni düzenle'));
    active = {...editor,textarea}; state.inlineEditing = true; state.sel = null; state.contentSelection = null;
    state.pages[page].el.append(textarea); properties(object); position();
    $('propertyHint').textContent = t(ocrLine ? 'Tanınan satır · Ctrl+Enter ile uygula' : 'PDF metni · Ctrl+Enter ile uygula');
    if (ocrLine?.patch && !ocrLine.patch.simplePaper) toast(t('Bu arka plan dokulu. Kaydetmeden önce sonucu kontrol et.'));
    textarea.addEventListener('input',() => {position();update();});
    textarea.addEventListener('keydown',event => {
      event.stopPropagation();
      if (event.key === 'Escape') {event.preventDefault();commit(true);}
      if (event.key === 'Enter' && event.ctrlKey) {event.preventDefault();commit();}
    });
    textarea.addEventListener('blur',event => {
      if (event.relatedTarget?.closest('.properties')) return;
      commit();
    });
    textarea.focus(); textarea.select();
  }
  for (const [key,id] of Object.entries(fields)) $(id).addEventListener('change',() => {
    let object = active?.object || state.contentSelection?.object || state.editor?.obj || (state.sel?.obj.type === 'text' ? state.sel.obj : null);
    const raw = $(id).value;
    const value = ['font','fontStyle','align','color'].includes(key) ? raw : Number(raw);
    if (typeof value === 'number' && (!Number.isFinite(value) || (key === 'size' && (value < 1 || value > 200)) || (key === 'boxWidth' && value < 10))) return;
    if (!object) {state.textStyle ||= {};state.textStyle[key]=value;return;}
    if(state.editor && !active){object[key]=value;state.editor.place();update();return;}
    if (!active && state.contentSelection) {mutateSelection(item=>{item[key]=value;if(['x','y'].includes(key))item.moved=true;});return;}
    if (!active) history.checkpoint();
    object[key] = value;
    if (['x','y'].includes(key)) object.moved = true;
    if (active) {position();update();} else {changed();redraw(state.sel.page);}
  });
  $('btnCommitText').onclick = () => commit();
  return {start,select,mutateSelection,commit,draft,properties,position,get active(){return active;}};
}
