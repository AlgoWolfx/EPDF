import * as pdfjsLib from '../node_modules/pdfjs-dist/build/pdf.min.mjs';
import { drawAnnot, hitTest, bbox, moveAnnot, textEditorMetrics, clearImageCache } from './geometry.js';
import { buildPdf } from './export.js';
import { BRAND } from './brand.js';
import { inspectTextObjects } from './pdf-engine.js';
import { t, setLanguage, applyTranslations } from './i18n.js';
import { setupOcr } from './ocr-ui.js';
import { EditHistory } from './history.js';
import { createInlineEditor } from './inline-editor.js';
import { createDesktop } from './desktop.js';
import { createSearch } from './search.js';
import { createImages } from './images.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url
).href;

const $ = (id) => document.getElementById(id);
const viewer = $('viewer');
const pagesEl = $('pages');

const PALETTE = ['#e63946', '#f77f00', '#ffd60a', '#2a9d3f', '#1e88e5', '#8e44ad', '#111111', '#ffffff'];

const S = {
  pdf: null, bytes: null, path: null, name: '', savedPath: null,
  pages: [],            // {vp, el, pdfCanvas, overlay, pdfPage, renderTask, renderedScale}
  visible: new Set(),
  scale: 1,
  tool: 'select',
  colors: {
    select: '#e63946', pen: '#e63946', highlighter: '#ffd60a', hlrect: '#ffd60a',
    underline: '#e63946', line: '#e63946', arrow: '#e63946', rect: '#e63946',
    ellipse: '#e63946', text: '#111111', eraser: '#e63946', editText: '#111111'
  },
  width: 3, fontSize: 16,
  annots: {},           // {sayfaIndeksi: [nesne]}
  undo: [], redo: [],
  sel: null,            // {page, obj}
  cur: null,            // çizilmekte olan nesne {page, obj}
  editor: null,
  night: false,
  current: 1
};
S.savedAnnots = '{}';
S.saving = false;
const history = new EditHistory(S);
let inlineEditor, desktop, search, ocrController, images;

// ---------- yardımcılar ----------
let toastTimer;
function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, isError ? 4500 : 2200);
}

const listOf = (i) => (S.annots[i] ||= []);
const storageKey = () => 'ders-pdf:' + S.path;

function persist() {
  if (!S.path) return;
  try {
    const annots = draftAnnotations();
    const has = Object.values(annots).some(l => l.length);
    if (has) { localStorage.setItem(storageKey(), JSON.stringify(annots)); localStorage.setItem(storageKey() + ':fingerprint', S.fingerprint); }
    else localStorage.removeItem(storageKey());
  } catch { if(!S.storageWarning){S.storageWarning=true;toast(t('Taslak saklanamadı. Değişikliklerini PDF olarak kaydet.'), true);} }
}

function updateButtons() {
  const has = !!S.pdf;
  $('btnSave').disabled = !has || S.saving || S.ocrApplying;
  $('btnSaveAs').disabled = !has || S.saving || S.ocrApplying;
  $('btnPages').disabled = !has || S.saving;
  $('btnOCR').disabled = !has || S.saving;
  $('btnUndo').disabled = !S.undo.length;
  $('btnRedo').disabled = !S.redo.length;
  $('pageNum').disabled = !has;
  $('btnPrev').disabled = !has;
  $('btnNext').disabled = !has;
  const edited = has && annotationSnapshot() !== S.savedAnnots;
  window.api.setDocumentEdited(edited);
  $('documentStatus').textContent = !has ? t('Bir PDF açarak başlayabilirsin.') :
    S.saving ? t('PDF kaydediliyor…') :
    `${S.name}.pdf · ${t(edited ? 'Taslak notlar var · PDF olarak kaydet' : S.savedPath ? 'PDF kaydedildi' : 'PDF açık')}`;
  desktop?.refresh();
}

function annotationSnapshot() {
  return JSON.stringify(Object.fromEntries(Object.entries(draftAnnotations()).filter(([, list]) => list.length)));
}

function draftAnnotations() {
  if (!S.editor) return inlineEditor?.draft(S.annots) || S.annots;
  const annots = structuredClone(S.annots);
  const { page, obj, ta, isNew } = S.editor;
  const list = annots[page] ||= [];
  const text = ta.value.trimEnd();
  if (isNew) { if (text) list.push({ ...obj, text }); }
  else {
    const index = S.annots[page].indexOf(obj);
    if (text) list[index].text = text;
    else list.splice(index, 1);
  }
  return annots;
}

// Değişiklikten ÖNCE çağrılır: geri alma için anlık görüntü tutar.
function pushHistory() { history.checkpoint(); }

function afterChange() {
  persist();
  syncPagePlan();
  updateButtons();
  scheduleContentPreview();
  search?.refresh();
  desktop?.invalidateThumbnails();
}

let previewGeneration = 0;
let previewTimer;
let previewSignature = '';
function contentEdits() {
  return Object.fromEntries(Object.entries(S.annots).map(([key, list]) => [key, list.filter(a => a.type === 'replaceText' || a.type === 'ocr')]).filter(([, list]) => list.length));
}
function scheduleContentPreview() {
  const signature = JSON.stringify(contentEdits());
  if (signature === previewSignature) return;
  previewSignature = signature;
  const generation = ++previewGeneration;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    let task;
    try {
      const edits = JSON.parse(signature);
      let pdf = S.pdf;
      if (Object.keys(edits).length) {
        const bytes = await buildPdf({ bytes: S.bytes, annots: edits,
          viewports: S.pages.map(p => p.baseVp), fontBytes: await window.api.loadFont(), applyPagePlan: false });
        if (generation !== previewGeneration) return;
        task = pdfjsLib.getDocument({ data: bytes });
        pdf = await task.promise;
      }
      if (generation !== previewGeneration) { task?.destroy(); return; }
      for (const p of S.pages) { p.renderTask?.cancel(); p.pdfPage = null; p.renderedScale = null; }
      S.previewTask?.destroy();
      S.previewTask = task;
      S.previewPdf = pdf;
      desktop?.invalidateThumbnails();
      for (const i of S.visible) await renderPage(i);
    } catch (error) { task?.destroy(); toast(t('Metin önizlemesi oluşturulamadı: {message}', { message: error.message }), true); }
  }, 100);
}

async function ensureTextObjects(i) {
  const page = S.pages[i];
  if (!page || page.textObjects) return;
  await ensurePage(i);
  page.textPromise ||= inspectTextObjects(S.bytes, i).then(objects => {
    if (S.pages[i] !== page) return;
    page.textObjects = objects.map(source => {
      const [left, bottom, right, top] = source.bounds;
      const points = [[left, bottom], [right, bottom], [left, top], [right, top]].map(point => page.baseVp.convertToViewportPoint(...point));
      const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]));
      return { ...source, box: { x, y, w: Math.max(...points.map(p => p[0])) - x, h: Math.max(...points.map(p => p[1])) - y } };
    });
    redrawPage(i);
  }).catch(error => { page.textPromise = null; toast(t('Metin okunamadı: {message}', { message: error.message }), true); });
  await page.textPromise;
}

async function editPdfText(i, point, selectOnly = false) {
  commitEditor();
  const list = S.annots[i] || [];
  const ocrIndex = list.findIndex(a => a.type === 'ocr');
  const ocr = list[ocrIndex];
  const lineIndex = ocr?.lines.findIndex(line => point.x >= line.x - 3 && point.x <= line.x + (line.boxWidth || line.w) + 3 && point.y >= line.y - 3 && point.y <= line.y + Math.max(line.h,line.size*1.2) + 3);
  if (lineIndex !== undefined && lineIndex >= 0) {
    if (ocr.mode !== 'editable' && !selectOnly) { pushHistory(); ocr.mode='editable'; afterChange(); }
    inlineEditor[selectOnly?'select':'start']({page:i,ocrIndex,lineIndex}); return;
  }
  const page = S.pages[i]; await ensureTextObjects(i);
  if (S.pages[i] !== page) return;
  const source = page.textObjects?.findLast(item => {
    const replacement = list.find(a=>a.type==='replaceText' && a.source.index===item.index);
    const b = replacement?.moved ? {x:replacement.x,y:replacement.y,w:replacement.boxWidth,h:replacement.size*1.2} : item.box;
    return point.x >= b.x-3 && point.x <= b.x+b.w+3 && point.y >= b.y-3 && point.y <= b.y+b.h+3;
  });
  if (!source) { if(!selectOnly)await ocrController.recognizePage(i); return; }
  if(source.opacity<.05){if(!selectOnly)await ocrController.recognizePage(i);return;}
  if (!source.editable) { toast(t('Bu metnin dönüşümü desteklenmiyor.'),true); return; }
  inlineEditor[selectOnly?'select':'start']({page:i,source});
}

function restore(json) {
  S.annots = JSON.parse(json);
  S.sel = null;
  S.contentSelection = null;
  redrawAll();
  afterChange();
}

function undo() { commitEditor(); const value=history.step('undo'); if(value) restore(JSON.stringify(value)); }
function redo() { commitEditor(); const value=history.step('redo'); if(value) restore(JSON.stringify(value)); }

// ---------- sayfa çizimi ----------
function redrawPage(i) {
  const p = S.pages[i];
  if (!p || !p.overlay || !p.overlay.width) return;
  const ctx = p.overlay.getContext('2d');
  const k = p.overlay.width / p.vp.width;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, p.vp.width, p.vp.height);
  const transform = pdfjsLib.Util.transform(p.vp.transform, pdfjsLib.Util.inverseTransform(p.baseVp.transform));
  ctx.transform(...transform);
  for (const a of (S.annots[i] || [])) {
    if (a.type === 'replaceText' || a.type === 'ocr') continue;
    if (S.editor && S.editor.obj === a) continue;
    drawAnnot(ctx, a);
  }
  if (S.cur && S.cur.page === i) drawAnnot(ctx, S.cur.obj);
  if (S.searchHit?.page === i) { const b=S.searchHit.box; ctx.save(); ctx.fillStyle='#ffd45e66'; ctx.fillRect(b.x,b.y,b.w,b.h); ctx.strokeStyle='#bd8f18'; ctx.lineWidth=1/S.scale; ctx.strokeRect(b.x,b.y,b.w,b.h); ctx.restore(); }
  if (S.tool === 'editText') {
    ctx.save(); ctx.strokeStyle = '#2469b455'; ctx.lineWidth = 1 / S.scale;
    for (const source of p.textObjects || []) { if (source.editable) { const b = source.box; ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4); } }
    for (const a of S.annots[i] || []) if (a.type === 'ocr') {
      for (const line of a.lines) if (line.text) ctx.strokeRect(line.x - 2, line.y - 2, line.w + 4, line.h + 4);
    }
    ctx.restore();
  }
  if (S.sel && S.sel.page === i) {
    if(S.sel.obj.type==='image')images.drawSelection(ctx,S.sel.obj);
    else {
      const b = bbox(S.sel.obj);
      ctx.save();
      ctx.strokeStyle = '#4f8cff';
      ctx.lineWidth = 1.5 / S.scale;
      ctx.setLineDash([]);
      ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
      ctx.restore();
    }
  }
  if(S.contentSelection?.page===i){
    const object=S.contentSelection.object,b={x:object.x,y:object.y,w:object.boxWidth,h:object.size*(object.leading||1.2)};
    ctx.save();ctx.strokeStyle='#2469b4';ctx.fillStyle='#fff';ctx.lineWidth=1/S.scale;
    ctx.strokeRect(b.x,b.y,b.w,b.h);
    for(const [x,y] of [[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]]){ctx.fillRect(x-2/S.scale,y-2/S.scale,4/S.scale,4/S.scale);ctx.strokeRect(x-2/S.scale,y-2/S.scale,4/S.scale,4/S.scale);}
    ctx.restore();
  }
}
function redrawAll() { S.pages.forEach((_, i) => redrawPage(i)); }

async function ensurePage(i) {
  const record = S.pages[i], pdf = S.pdf;
  if (!record || record.loaded) return;
  record.loadPromise ||= pdf.getPage(i+1).then(page => {
    if (S.pdf !== pdf || S.pages[i] !== record) return;
    record.sourcePage=page; record.baseVp=page.getViewport({scale:1}); record.loaded=true;
    const rotation=pagePlan().find(entry=>entry.source===i)?.rotation || 0;
    record.vp=record.baseVp.clone({rotation:(record.baseVp.rotation+rotation)%360});
    record.el.style.width=record.vp.width*S.scale+'px'; record.el.style.height=record.vp.height*S.scale+'px';
  });
  await record.loadPromise;
}

async function renderPage(i) {
  const p = S.pages[i];
  if (!p || !S.pdf) return;
  await ensurePage(i);
  if (S.pages[i] !== p) return;
  if (p.renderedScale === S.scale && p.pdfCanvas.width) { redrawPage(i); return; }
  const version = p.renderVersion = (p.renderVersion || 0) + 1;
  const scale = S.scale;
  const dpr = window.devicePixelRatio || 1;
  let k = S.scale * dpr;
  const maxPx = 20e6;
  const px = p.vp.width * p.vp.height * k * k;
  if (px > maxPx) k *= Math.sqrt(maxPx / px);

  if (p.renderTask) { p.renderTask.cancel(); p.renderTask = null; }
  p.pdfPage ||= await (S.previewPdf || S.pdf).getPage(i + 1);

  const w = Math.floor(p.vp.width * k), h = Math.floor(p.vp.height * k);
  const off = document.createElement('canvas'); // titremeyi önlemek için ekran dışında çiz
  off.width = w; off.height = h;
  const task = p.pdfPage.render({
    canvasContext: off.getContext('2d'),
    canvas: off,
    viewport: p.pdfPage.getViewport({ scale: k, rotation: p.vp.rotation })
  });
  p.renderTask = task;
  try {
    await task.promise;
  } catch (e) {
    if (e?.name !== 'RenderingCancelledException' && !p.renderError) {p.renderError=true;toast(t('Sayfa {number} görüntülenemedi.',{number:i+1}),true);}
    return;
  }
  if (version !== p.renderVersion || S.pages[i] !== p) return;
  p.renderTask = null;
  if (!S.visible.has(i)) return;
  p.pdfCanvas.width = w; p.pdfCanvas.height = h;
  p.pdfCanvas.getContext('2d').drawImage(off, 0, 0);
  p.overlay.width = w; p.overlay.height = h;
  p.renderedScale = scale;
  redrawPage(i);
}

function releasePage(i) {
  const p = S.pages[i];
  if (!p) return;
  if (p.renderTask) { p.renderTask.cancel(); p.renderTask = null; }
  p.pdfCanvas.width = 0; p.pdfCanvas.height = 0;
  p.overlay.width = 0; p.overlay.height = 0;
  p.renderedScale = null;
}

const observer = new IntersectionObserver((entries) => {
  for (const en of entries) {
    const i = Number(en.target.dataset.i);
    if (en.isIntersecting) { S.visible.add(i); renderPage(i); if (S.tool === 'editText') ensureTextObjects(i); }
    else { S.visible.delete(i); releasePage(i); }
  }
}, { root: viewer, rootMargin: '1000px 0px' });

function refreshVisiblePages() {
  const root = viewer.getBoundingClientRect();
  for (const entry of pagePlan()) {
    const page = S.pages[entry.source];
    const rect = page.el.getBoundingClientRect();
    if (rect.bottom >= root.top - 1000 && rect.top <= root.bottom + 1000) {
      S.visible.add(entry.source);
      renderPage(entry.source);
    }
  }
}

function layoutPages() {
  S.pages.forEach((p) => {
    p.el.style.width = p.vp.width * S.scale + 'px';
    p.el.style.height = p.vp.height * S.scale + 'px';
  });
  $('zoomLabel').textContent = Math.round(S.scale * 100) + '%';
  inlineEditor?.position();
}

let zoomTimer;
function setScale(newScale, anchorRatio) {
  newScale = Math.min(6, Math.max(0.2, newScale));
  if (!S.pdf || newScale === S.scale) return;
  const ratio = anchorRatio ?? (viewer.scrollTop + viewer.clientHeight / 2) / viewer.scrollHeight;
  S.scale = newScale;
  layoutPages();
  viewer.scrollTop = ratio * viewer.scrollHeight - viewer.clientHeight / 2;
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => { for (const i of S.visible) renderPage(i); }, 120);
}

function fitWidth() {
  if (!S.pages.length) return;
  const maxW = Math.max(...S.pages.map(p => p.vp.width));
  setScale((viewer.clientWidth - 56) / maxW);
}

function goToPage(n) {
  const entries = pagePlan();
  n = Math.min(entries.length, Math.max(1, n));
  S.pages[entries[n - 1]?.source]?.el.scrollIntoView({ block: 'start' });
  S.current = n;
  $('pageNum').value = n;
  desktop?.current();
  refreshVisiblePages();
}

let scrollRaf = 0;
viewer.addEventListener('scroll', () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    const probe = viewer.getBoundingClientRect().top + viewer.clientHeight / 3;
    const entries = pagePlan();
    for (let i = 0; i < entries.length; i++) {
      const r = S.pages[entries[i].source].el.getBoundingClientRect();
      if (r.bottom >= probe) {
        if (S.current !== i + 1) { S.current = i + 1; $('pageNum').value = i + 1; desktop?.current(); }
        break;
      }
    }
  });
});

// ---------- belge açma ----------
async function openPath(path) {
  if (S.opening) { toast(t('PDF açılıyor, lütfen bekle.')); return; }
  S.opening = true;
  try { await loadPath(path); }
  catch (error) { console.error(error); toast(t('PDF yüklenemedi: {message}', { message: error.message }), true); }
  finally { S.opening = false; }
}

async function loadPath(path) {
  if (!path) return;
  if (S.ocrRunning) { toast(t('Önce OCR işlemini durdur veya tamamlanmasını bekle.')); return; }
  if (S.saving) { toast(t('Kaydetme tamamlandığında başka bir PDF açabilirsin.')); return; }
  commitEditor();
  if (!await window.api.confirmLeave()) return;
  let bytes;
  try {
    bytes = await window.api.readFile(path);
  } catch (e) {
    toast(t('Dosya okunamadı: {message}', { message: e.message }), true);
    return;
  }
  let pdf, task;
  try {
    task = pdfjsLib.getDocument({ data: bytes.slice() });
    pdf = await task.promise;
  } catch (e) {
    task?.destroy();
    toast(t(e?.name === 'PasswordException' ? 'Şifreli PDF\'ler desteklenmiyor.' : 'PDF açılamadı.'), true);
    return;
  }

  // eskiyi temizle
  observer.disconnect();
  clearImageCache();S.storageWarning=false;
  S.visible.clear();
  S.pages.forEach((p) => p.renderTask?.cancel());
  pagesEl.replaceChildren();
  ++previewGeneration;
  clearTimeout(previewTimer);
  previewSignature = '';
  S.previewTask?.destroy();
  S.previewTask = null;
  S.previewPdf = null;
  S.task?.destroy();

  const info = await window.api.pathInfo(path);
  const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
  Object.assign(S, {
    pdf, task, bytes, fingerprint, path, name: info.name, dir: info.dir, savedPath: null,
    pages: [], undo: [], redo: [], sel: null, cur: null, annots: {}, savedAnnots: '{}'
  });
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) {
      const fingerprint=localStorage.getItem(storageKey()+':fingerprint');
      if (!fingerprint || fingerprint===S.fingerprint || fingerprint===pdf.fingerprints[0]) S.annots=JSON.parse(raw);
      else toast(t('Dosya değişmiş. Önceki taslak bu belgeye uygulanmadı.'),true);
    }
  } catch { toast(t('Önceki taslak okunamadı.'),true); }

  const firstPage = await pdf.getPage(1);
  const estimatedViewport = firstPage.getViewport({scale:1});
  ocrController?.reset();
  search?.reset();S.contentSelection=null;
  for (let i = 0; i < pdf.numPages; i++) {
    const page = i===0 ? firstPage : null;
    const vp = page ? estimatedViewport : estimatedViewport.clone();
    const el = document.createElement('div');
    el.className = 'page';
    el.dataset.i = i;
    const pdfCanvas = document.createElement('canvas');
    pdfCanvas.className = 'pdf';
    const overlay = document.createElement('canvas');
    overlay.className = 'overlay';
    el.append(pdfCanvas, overlay);
    pagesEl.append(el);
    const rec = { vp, baseVp: vp, el, pdfCanvas, overlay, pdfPage: page, sourcePage:page, loaded:!!page, renderTask: null, renderedScale: null };
    S.pages.push(rec);
    bindOverlay(i, overlay);
  }

  document.body.classList.add('has-doc');
  document.title = S.name + ' — EPDF';
  $('pageTotal').textContent = '/ ' + pdf.numPages;
  $('pageNum').max = pdf.numPages;
  S.planSignature = null;
  syncPagePlan();
  S.scale = 1;
  const maxW = Math.max(...S.pages.map(p => p.vp.width));
  S.scale = Math.min(1.5, (viewer.clientWidth - 56) / maxW);
  layoutPages();
  pagePlan().forEach(entry => observer.observe(S.pages[entry.source].el));
  viewer.scrollTop = 0;
  goToPage(1);
  refreshVisiblePages();
  updateButtons();
  scheduleContentPreview();
  if (S.tool === 'editText') for (const i of S.visible) ensureTextObjects(i);
  if (Object.values(S.annots).some(l => l.length)) toast(t('Önceki notların geri yüklendi'));
}

async function pickAndOpen() {
  const p = await window.api.openDialog();
  if (p) openPath(p);
}

// ---------- kaydetme ----------
async function save(asNew) {
  if (!S.pdf || S.saving || S.ocrApplying) return;
  commitEditor();
  S.saving = true;
  const snapshot = annotationSnapshot();
  updateButtons();
  try {
    const fontBytes = await window.api.loadFont();
    const out = await buildPdf({
      bytes: S.bytes,
      annots: JSON.parse(snapshot),
      viewports: S.pages.map(p => p.baseVp),
      fontBytes
    });
    let target = S.savedPath;
    if (asNew || !target) {
      const def = `${S.dir}\\${S.name} (notlu).pdf`;
      target = await window.api.saveDialog(def, out, S.path);
      if (!target) return;
    } else {
      await window.api.writeFile(target, out);
    }
    S.savedPath = target;
    S.savedAnnots = snapshot;
    toast(t('Kaydedildi: {name}', { name: target.split('\\').pop() }));
  } catch (e) {
    console.error(e);
    toast(t('Kaydedilemedi: {message}', { message: e.message }), true);
  } finally {
    S.saving = false;
    updateButtons();
  }
}

// ---------- araçlar ----------
function setTool(tool) {
  commitEditor();
  S.tool = tool;
  S.sel = null;
  S.contentSelection = null;
  document.querySelectorAll('.tool').forEach(b => {b.classList.toggle('active', b.dataset.tool === tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));});
  syncColorUI();
  desktop?.refresh();
  const cursor = { select: 'default', text: 'text', editText:'text', view:'grab', eraser: 'cell' }[tool] || 'crosshair';
  document.querySelectorAll('canvas.overlay').forEach(c => { c.style.cursor = cursor; });
  redrawAll();
  if (tool === 'editText') for (const i of S.visible) ensureTextObjects(i);
}

function syncColorUI() {
  const c = S.colors[S.tool];
  document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.c === c));
  $('colorPick').value = c;
}

function setColor(c) {
  if (S.tool === 'select' && S.sel) {
    pushHistory();
    S.sel.obj.color = c;
    redrawPage(S.sel.page);
    afterChange();
  }
  S.colors[S.tool] = c;
  syncColorUI();
}

function buildSwatches() {
  const box = $('swatches');
  for (const c of PALETTE) {
    const s = document.createElement('button');
    s.className = 'swatch';
    s.dataset.c = c;
    s.title = c;
    s.style.background = c;
    s.addEventListener('click', () => setColor(c));
    box.append(s);
  }
  $('colorPick').addEventListener('input', (e) => setColor(e.target.value));
}

// ---------- fare / kalem etkileşimi ----------
function pagePoint(e, el) {
  const r = el.getBoundingClientRect();
  const page = S.pages[Number(el.parentElement.dataset.i)];
  const pdfPoint = page.vp.convertToPdfPoint((e.clientX - r.left) / S.scale, (e.clientY - r.top) / S.scale);
  const [x, y] = page.baseVp.convertToViewportPoint(...pdfPoint);
  return { x, y };
}

function topHit(pageIdx, x, y) {
  const list = (S.annots[pageIdx] || []).filter(a => !['replaceText', 'ocr'].includes(a.type));
  const tol = 6 / S.scale;
  for (let j = list.length - 1; j >= 0; j--) if (hitTest(list[j], x, y, tol)) return list[j];
  return null;
}

function bindOverlay(i, el) {
  let drag = null;

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (S.editor) { commitEditor(); if (S.tool === 'text') return; }
    const p = pagePoint(e, el);
    const t = S.tool;
    if (t === 'editText') { e.preventDefault(); editPdfText(i, p); return; }
    if (t === 'view') { drag={pan:true,x:e.clientX,y:e.clientY,left:viewer.scrollLeft,top:viewer.scrollTop}; el.setPointerCapture(e.pointerId); el.style.cursor='grabbing'; e.preventDefault(); return; }
    if (t === 'image') {images.place(i,p);e.preventDefault();return;}

    if (t === 'select') {
      if(S.sel?.page===i && S.sel.obj.type==='image'){
        const object=S.sel.obj,handle=images.handleAt(object,p);
        if(handle){
          const {x,y,w,h,rotation}=object;
          drag={imageResize:{object,handle,initial:{x,y,w,h,rotation}},moved:false};
          el.style.cursor=images.resizeCursor(object,handle,S.pages[i]);
          el.setPointerCapture(e.pointerId);e.preventDefault();return;
        }
      }
      const hit = topHit(i, p.x, p.y);
      const selected=S.contentSelection;
      if(!hit && selected?.page===i){
        const obj=selected.object;
        if(p.x>=obj.x-5 && p.x<=obj.x+obj.boxWidth+5 && p.y>=obj.y-5 && p.y<=obj.y+obj.size*(obj.leading||1.2)+5){
          drag={content:true,last:p,moved:false,resize:Math.abs(p.x-obj.x-obj.boxWidth)<6/S.scale};
          el.setPointerCapture(e.pointerId);e.preventDefault();return;
        }
      }
      S.contentSelection=null;
      S.sel = hit ? { page: i, obj: hit } : null;
      redrawAll();
      desktop?.refresh();
      if (hit) {
        drag = { last: p, moved: false };
        el.setPointerCapture(e.pointerId);
      }
      else editPdfText(i,p,true);
      return;
    }
    if (t === 'text') {
      const hit = topHit(i, p.x, p.y);
      if (hit?.type === 'text') startEditor(i, hit);
      else startEditor(i, null, p.x, p.y);
      e.preventDefault();
      return;
    }
    if (t === 'eraser') {
      drag = { erased: false };
      el.setPointerCapture(e.pointerId);
      eraseAt(i, p);
      return;
    }

    const color = S.colors[t];
    let obj;
    if (t === 'pen' || t === 'highlighter') {
      obj = { type: t, color, width: S.width, pts: [[p.x, p.y]] };
    } else {
      obj = { type: t, color, width: S.width, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    }
    S.cur = { page: i, obj };
    drag = {};
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e) => {
    if (!drag) {
      if(S.tool==='select'){
        const point=pagePoint(e,el),selected=S.sel?.page===i?S.sel.obj:null;
        const handle=selected?.type==='image'?images.handleAt(selected,point):null;
        el.style.cursor=handle?images.resizeCursor(selected,handle,S.pages[i]):topHit(i,point.x,point.y)?'move':'default';
      }
      return;
    }
    if (drag.pan) {viewer.scrollLeft=drag.left-(e.clientX-drag.x);viewer.scrollTop=drag.top-(e.clientY-drag.y);return;}
    const p = pagePoint(e, el);
    if(drag.imageResize){
      const {object,initial,handle}=drag.imageResize;
      if(!drag.moved){pushHistory();drag.moved=true;}
      images.resize(object,initial,handle,p);redrawPage(i);return;
    }
    if(drag.content && S.contentSelection){
      if(!drag.moved){pushHistory();drag.moved=true;}
      inlineEditor.mutateSelection(obj=>{
        if(drag.resize)obj.boxWidth=Math.max(10,p.x-obj.x);
        else {obj.x+=p.x-drag.last.x;obj.y+=p.y-drag.last.y;obj.moved=true;}
      },false);
      drag.last=p;return;
    }
    if (S.tool === 'select' && S.sel) {
      if (!drag.moved) { pushHistory(); drag.moved = true; }
      moveAnnot(S.sel.obj, p.x - drag.last.x, p.y - drag.last.y);
      drag.last = p;
      redrawPage(i);
      return;
    }
    if (S.tool === 'eraser') { eraseAt(i, p); return; }
    if (!S.cur) return;
    const o = S.cur.obj;
    if (o.pts) {
      const last = o.pts[o.pts.length - 1];
      if (Math.hypot(p.x - last[0], p.y - last[1]) > 0.6) o.pts.push([p.x, p.y]);
    } else {
      o.x2 = p.x;
      o.y2 = o.type === 'underline' ? o.y1 : p.y;
    }
    redrawPage(i);
  });

  const finish = () => {
    if (!drag) return;
    if(drag.pan) el.style.cursor='grab';
    const wasCur = S.cur;
    if (drag.moved) afterChange();
    if (wasCur) {
      const o = wasCur.obj;
      const tiny = !o.pts && Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 3;
      if (!tiny) {
        pushHistory();
        listOf(i).push(o);
        afterChange();
      }
      S.cur = null;
    }
    drag = null;
    if(S.tool==='select')el.style.cursor='default';
    redrawPage(i);
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);

  el.addEventListener('dblclick', (e) => {
    if (S.tool !== 'select') return;
    const p = pagePoint(e, el);
    const hit = topHit(i, p.x, p.y);
    if (hit?.type === 'text') startEditor(i, hit);
    else if(hit?.type!=='image')editPdfText(i,p);
  });
}

function eraseAt(i, p) {
  const list = S.annots[i];
  if (!list?.length) return;
  const tol = 6 / S.scale;
  const idx = list.findLastIndex(a => !['replaceText', 'ocr'].includes(a.type) && hitTest(a, p.x, p.y, tol));
  if (idx < 0) return;
  pushHistory();
  list.splice(idx, 1);
  afterChange();
  redrawPage(i);
}

// ---------- yazı düzenleyici ----------
function startEditor(pageIdx, existing, x, y) {
  commitEditor();
  const p = S.pages[pageIdx];
  const obj = existing || { ...S.textStyle, type: 'text', color: S.colors.text, size: S.fontSize, x, y, text: '' };
  const ta = document.createElement('textarea');
  ta.className = 'textedit';
  ta.value = obj.text;
  ta.spellcheck = false;
  const place = () => {
    const position=p.vp.convertToViewportPoint(...p.baseVp.convertToPdfPoint(obj.x,obj.y));
    ta.style.left = position[0] * S.scale + 'px';
    ta.style.top = position[1] * S.scale + 'px';
    ta.style.transform='rotate('+(p.vp.rotation-p.baseVp.rotation)+'deg)';ta.style.transformOrigin='0 0';
    ta.style.fontFamily=obj.font || 'Arial';
    ta.style.fontWeight=obj.fontStyle?.includes('bold')?'bold':'normal';ta.style.fontStyle=obj.fontStyle?.includes('italic')?'italic':'normal';
    ta.style.lineHeight=obj.leading || 1.2;
    ta.style.letterSpacing=(obj.spacing || 0)*S.scale+'px';
    ta.style.textAlign=obj.align || 'left';
    ta.style.fontSize = obj.size * S.scale + 'px';
    ta.style.color = obj.color;
    const {width,height,offset}=textEditorMetrics(obj,ta.value,S.scale);
    const angle=(p.vp.rotation-p.baseVp.rotation)*Math.PI/180;
    ta.style.left=position[0]*S.scale+offset*Math.cos(angle)+'px';
    ta.style.top=position[1]*S.scale+offset*Math.sin(angle)+'px';
    ta.style.width=width+'px';ta.style.height=height+'px';
  };
  place();
  ta.addEventListener('input', () => { place(); persist(); updateButtons(); });
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); commitEditor(); }
    else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); commitEditor(); }
  });
  ta.addEventListener('blur', () => commitEditor());
  p.el.append(ta);
  S.editor = { page: pageIdx, obj, ta, place, isNew: !existing, before: existing ? JSON.stringify(S.annots) : null };
  redrawPage(pageIdx);
  ta.focus();
  ta.select();
}

function commitEditor() {
  inlineEditor?.commit();
  const ed = S.editor;
  if (!ed) return;
  S.editor = null;
  const text = ed.ta.value.replace(/\s+$/, '');
  ed.ta.remove();
  const list = listOf(ed.page);
  if (ed.isNew) {
    if (text) {
      pushHistory();
      ed.obj.text = text;
      list.push(ed.obj);
      afterChange();
    }
  } else if (text !== ed.obj.text || JSON.stringify(S.annots) !== ed.before) {
    history.checkpoint(ed.before);
    if (text) ed.obj.text = text;
    else list.splice(list.indexOf(ed.obj), 1);
    afterChange();
  }
  redrawPage(ed.page);
}

// ---------- kısayollar ve olaylar ----------
const KEYS = { d: 'editText', v: 'select', p: 'pen', h: 'highlighter', b: 'hlrect', u: 'underline',
  t: 'text', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', e: 'eraser' };

window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog:modal')) return;
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === 'f') {e.preventDefault();search.open();}
  else if (mod && k === 'o') { e.preventDefault(); pickAndOpen(); }
  else if (mod && k === 's') { e.preventDefault(); save(e.shiftKey); }
  else if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
  else if (mod && (k === '=' || k === '+')) { e.preventDefault(); setScale(S.scale * 1.15); }
  else if (mod && k === '-') { e.preventDefault(); setScale(S.scale / 1.15); }
  else if (mod && k === '0') { e.preventDefault(); fitWidth(); }
  else if (!mod && (k==='delete'||k==='backspace') && S.contentSelection) {e.preventDefault();inlineEditor.mutateSelection(obj=>{obj.text='';});S.contentSelection=null;updateButtons();redrawAll();}
  else if (!mod && ['arrowleft','arrowright','arrowup','arrowdown'].includes(k) && S.contentSelection) {e.preventDefault();const delta=e.shiftKey?10:1;inlineEditor.mutateSelection(obj=>{obj.x+=k==='arrowleft'?-delta:k==='arrowright'?delta:0;obj.y+=k==='arrowup'?-delta:k==='arrowdown'?delta:0;obj.moved=true;});}
  else if (mod && k==='c' && S.contentSelection) {e.preventDefault();const obj=S.contentSelection.object;S.clipboard={type:'text',text:obj.text,x:obj.x,y:obj.y,size:obj.size,color:obj.color,font:obj.font,fontStyle:obj.fontStyle};}
  else if (!mod && (k === 'delete' || k === 'backspace') && S.sel) {
    pushHistory();
    const list = S.annots[S.sel.page];
    list.splice(list.indexOf(S.sel.obj), 1);
    const pg = S.sel.page;
    S.sel = null;
    afterChange();
    redrawPage(pg);
  }
  else if (mod && k==='c' && S.sel) {e.preventDefault();S.clipboard=structuredClone(S.sel.obj);}
  else if (mod && k==='v' && S.clipboard && S.pdf) {e.preventDefault();pushHistory();const obj=structuredClone(S.clipboard);moveAnnot(obj,12,12);const page=pagePlan()[S.current-1].source;listOf(page).push(obj);S.contentSelection=null;S.sel={page,obj};afterChange();redrawPage(page);}
  else if (['arrowleft','arrowright','arrowup','arrowdown'].includes(k) && S.sel) {e.preventDefault();pushHistory();const distance=e.shiftKey?10:1;moveAnnot(S.sel.obj,k==='arrowleft'?-distance:k==='arrowright'?distance:0,k==='arrowup'?-distance:k==='arrowdown'?distance:0);afterChange();redrawPage(S.sel.page);}
  else if (k === 'escape') { S.sel = null; setTool('select'); redrawAll(); }
  else if (!mod && S.pdf && KEYS[k]) setTool(KEYS[k]);
  else if (k === 'pagedown') goToPage(S.current + 1);
  else if (k === 'pageup') goToPage(S.current - 1);
});

viewer.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setScale(S.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
}, { passive: false });

// sürükle-bırak
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const f = [...e.dataTransfer.files].find(f => f.name.toLowerCase().endsWith('.pdf'));
  if (f) openPath(window.api.pathForFile(f));
  else if (e.dataTransfer.files.length) toast(t('Sadece PDF dosyaları açılabilir.'), true);
});

// ---------- bağlama ----------
function showDialog(id) { commitEditor(); $(id).showModal(); }
function pagePlan() {
  return S.annots.__pages?.[0]?.entries || S.pages.map((_, source) => ({ source, rotation: 0 }));
}
function syncPagePlan() {
  if (!S.pages.length) return;
  const entries = pagePlan();
  const signature = JSON.stringify(entries);
  if (signature === S.planSignature) return;
  S.planSignature = signature;
  observer.disconnect();
  S.visible.clear();
  S.pages.forEach((page, index) => {
    const entry = entries.find(item => item.source === index);
    releasePage(index);
    page.renderVersion = (page.renderVersion || 0) + 1;
    page.el.hidden = !entry;
    if (entry) page.vp = page.baseVp.clone({ rotation: (page.baseVp.rotation + entry.rotation) % 360 });
  });
  for (const entry of entries) {
    const page = S.pages[entry.source];
    pagesEl.append(page.el); observer.observe(page.el);
  }
  $('pageTotal').textContent = '/ ' + entries.length;
  $('pageNum').max = entries.length;
  S.current = Math.min(S.current, entries.length);
  $('pageNum').value = S.current;
  layoutPages();
  requestAnimationFrame(refreshVisiblePages);
  if ($('pagesDialog').open) renderPageList();
}
function renderPageList() {
  const entries = pagePlan();
  $('pageList').replaceChildren();
  entries.forEach((entry, position) => {
    const row = document.createElement('div'); row.className = 'page-row';
    const label = document.createElement('span'); label.textContent = t('Sayfa {number} · Orijinal {source} · {rotation}°', { number: position + 1, source: entry.source + 1, rotation: entry.rotation });
    row.append(label);
    for (const [action, label, disabled] of [['up', 'Yukarı', position === 0], ['down', 'Aşağı', position === entries.length - 1], ['rotate', 'Döndür', false], ['delete', 'Sil', entries.length === 1]]) {
      const button = document.createElement('button'); button.className = 'btn'; button.textContent = t(label); button.disabled = disabled;
      button.dataset.pageAction = action; button.dataset.position = position;
      button.setAttribute('aria-label', t(action === 'up' ? 'Sayfayı yukarı taşı' : action === 'down' ? 'Sayfayı aşağı taşı' : action === 'rotate' ? 'Sayfayı döndür' : 'Sayfayı sil'));
      button.onclick = () => {
        const next = structuredClone(pagePlan());
        pushHistory();
        if (action === 'delete') next.splice(position, 1);
        else if (action === 'rotate') next[position].rotation = (next[position].rotation + 90) % 360;
        else { const target = position + (action === 'up' ? -1 : 1); [next[position], next[target]] = [next[target], next[position]]; }
        S.annots.__pages = [{ type: 'pagePlan', entries: next }];
        afterChange(); renderPageList();
      };
      row.append(button);
    }
    $('pageList').append(row);
  });
}
$('btnPages').onclick = () => { showDialog('pagesDialog'); renderPageList(); };
$('btnAbout').onclick = () => showDialog('aboutDialog');
$('btnSupport').onclick = () => showDialog('aboutDialog');
$('btnHelp').onclick = () => showDialog('helpDialog');
document.querySelectorAll('[data-close-dialog]').forEach(button => {
  button.onclick = () => button.closest('dialog').close();
});
for (const [key, label] of [
  ['github', 'GitHub’da yıldız ver ↗'],
  ['instagramCompany', 'EGORA DIGITAL · Instagram ↗'],
  ['instagramDeveloper', 'Yiğit Osman Bayrak · Instagram ↗'],
  ['website', 'EGORA DIGITAL · Web sitesi ↗']
]) {
  if (!BRAND[key]) continue;
  const button = document.createElement('button');
  button.className = 'btn';
  button.textContent = label;
  button.onclick = async () => {
    try { await window.api.openExternal(BRAND[key]); }
    catch { toast(t('Destek bağlantısı açılamadı.'), true); }
  };
  $('supportLinks').append(button);
}
$('supportPending').hidden = $('supportLinks').children.length > 0;
let appVersion = '';
let updateState = { status: 'idle' };
function renderUpdates(state = updateState) {
  updateState = state;
  const messages = {
    idle: 'Güncel sürüm: {version}', checking: 'Güncellemeler kontrol ediliyor…',
    available: 'Yeni sürüm hazır: {version}', current: 'Uygulaman güncel.', downloading: 'İndiriliyor: %{percent}',
    downloaded: 'Güncelleme indirildi: {version}. Kurmak için yeniden başlat.',
    manual: 'Bu sürümde güncellemeleri Sürümler sayfasından indir. Otomatik kurulum yalnızca kurulu Windows sürümünde kullanılabilir.',
    error: 'Güncelleme kontrolü veya indirme başarısız. Bağlantını kontrol et ya da Sürümler sayfasını aç.'
  };
  $('updateStatus').textContent = t(messages[state.status] || messages.idle, { version: state.version || appVersion, percent: state.percent || 0 });
  $('btnCheckUpdate').disabled = ['checking', 'downloading', 'downloaded'].includes(state.status);
  $('btnDownloadUpdate').hidden = state.status !== 'available';
  $('btnInstallUpdate').hidden = state.status !== 'downloaded';
}
$('btnUpdates').onclick = async () => { showDialog('updatesDialog'); renderUpdates(await window.api.updateStatus()); };
$('btnCheckUpdate').onclick = async () => { renderUpdates({ status: 'checking' }); renderUpdates(await window.api.checkUpdates()); };
$('btnDownloadUpdate').onclick = async () => renderUpdates(await window.api.downloadUpdate());
$('btnInstallUpdate').onclick = () => window.api.installUpdate();
$('btnReleasePage').onclick = () => window.api.openExternal('https://github.com/AlgoWolfx/EPDF/releases');
window.api.onUpdateState(renderUpdates);
window.api.appVersion().then(version => { appVersion = version; $('appVersion').textContent = `EPDF · ${t('Sürüm {version}', { version })}`; renderUpdates(); });
$('languageSelect').onchange = event => {
  setLanguage(event.target.value); updateButtons(); renderUpdates();
  if ($('pagesDialog').open) renderPageList();
  $('appVersion').textContent = `EPDF · ${t('Sürüm {version}', { version: appVersion })}`;
};
applyTranslations();
$('btnOpen').onclick = pickAndOpen;
$('btnOpen2').onclick = pickAndOpen;
$('btnSave').onclick = () => save(false);
$('btnSaveAs').onclick = () => save(true);
$('btnUndo').onclick = undo;
$('btnRedo').onclick = redo;
$('btnZoomIn').onclick = () => setScale(S.scale * 1.2);
$('btnZoomOut').onclick = () => setScale(S.scale / 1.2);
$('btnFit').onclick = fitWidth;
$('btnPrev').onclick = () => goToPage(S.current - 1);
$('btnNext').onclick = () => goToPage(S.current + 1);
$('pageNum').addEventListener('change', (e) => goToPage(Number(e.target.value) || 1));
$('width').addEventListener('input', (e) => { S.width = Number(e.target.value); });
$('fontSize').addEventListener('input',e=>{S.fontSize=Math.min(200,Math.max(1,Number(e.target.value)||16));});
$('btnFitPage').onclick=()=>{const page=S.pages[pagePlan()[S.current-1]?.source];if(page)setScale(Math.min((viewer.clientWidth-48)/page.vp.width,(viewer.clientHeight-40)/page.vp.height));};
document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => b.dataset.tool==='image'?images.pick():setTool(b.dataset.tool)));

buildSwatches();
inlineEditor=createInlineEditor({state:S,history,changed:afterChange,redraw:redrawPage,update:()=>{persist();updateButtons();},toast});
images=createImages({state:S,history,changed:afterChange,redraw:redrawPage,tool:setTool,toast});
desktop=createDesktop({state:S,plan:pagePlan,ensurePage,navigate:goToPage,inline:inlineEditor,images});
search=createSearch({state:S,plan:pagePlan,navigate:goToPage,ensurePage,redraw:redrawAll});
ocrController=setupOcr({ state: S, pagePlan, commitEditor, pushHistory, afterChange, updateButtons, toast, ensurePage });
syncColorUI();
updateButtons();
window.api.onOpenFile(openPath);
window.addEventListener('epdf-image-ready',()=>{redrawAll();desktop.invalidateThumbnails();});
window.addEventListener('resize', () => {
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => { for (const i of S.visible) renderPage(i); }, 150);
});
