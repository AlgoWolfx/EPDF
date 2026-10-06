import { createOcrSession, prepareOcrLines, blocksFromLines, classifyPage } from './ocr.js';
import { cancelBackground } from './background.js';
import { t } from './i18n.js';
import { inspectTextObjects } from './pdf-engine.js';

export function setupOcr({ state, pagePlan, commitEditor, pushHistory, afterChange, updateButtons, toast, ensurePage }) {
  const $ = id => document.getElementById(id);
  let results = [], session, renderTask, cancelled = false, closeWhenStopped = false;
  let cacheDocument, cache = new Map();
  const hide = document.createElement('button'); hide.className = 'btn'; hide.textContent = t('Arka planda');
  hide.onclick = () => $('ocrDialog').close();
  $('btnCloseOCR').before(hide);
  $('ocrActivity').onclick = () => { if (!$('ocrDialog').open) $('ocrDialog').show(); };
  function controls() {
    for (const id of ['ocrLanguage', 'ocrScope', 'ocrMode', 'ocrForce', 'btnRunOCR']) $(id).disabled = !!state.ocrRunning || !!state.ocrApplying;
    $('btnCancelOCR').hidden = !state.ocrRunning;
    $('btnApplyOCR').disabled = !!state.ocrRunning || !!state.ocrApplying || !results.some(result => result.lines.length);
    updateButtons();
  }
  function showResults() {
    $('ocrResults').replaceChildren();
    for (const result of results) {
      const heading = document.createElement('h3');
      heading.textContent = t('Sayfa {number}', { number: pagePlan().findIndex(entry => entry.source === result.page) + 1 });
      $('ocrResults').append(heading);
      result.lines.forEach((line, index) => {
        const row = document.createElement('div'); row.className = 'ocr-row' + (line.confidence < 75 ? ' low-confidence' : '');
        const confidence = document.createElement('small'); confidence.textContent = `%${line.confidence}`;
        confidence.title = t('Tanıma güveni');
        const input = document.createElement('textarea'); input.rows = 1; input.value = line.text;
        input.dataset.ocrPage = result.page; input.dataset.ocrLine = index;
        input.setAttribute('aria-label', t('Sayfa {page}, satır {line}', { page: result.page + 1, line: index + 1 }));
        input.addEventListener('input', () => { line.text = input.value.replace(/\r?\n/g, ' '); });
        row.append(confidence, input); $('ocrResults').append(row);
      });
    }
  }
  function cancel(close = false) {
    if (!state.ocrRunning) { $('ocrDialog').close(); return; }
    cancelled = true; closeWhenStopped = close; session?.cancel(); renderTask?.cancel();cancelBackground();
  }
  function open() {
    commitEditor();
    if (state.ocrRunning || state.ocrApplying) { if (!$('ocrDialog').open) $('ocrDialog').show(); return; }
    const current = pagePlan()[state.current - 1]?.source;
    const previous = (state.annots[current] || []).find(a => a.type === 'ocr');
    results = previous ? [{ page: current, lines: structuredClone(previous.lines) }] : [];
    if (previous) $('ocrMode').value = previous.mode;
    $('ocrStatus').textContent = t('Tanımayı başlat, sonuçları kontrol et ve uygula. Sarı alanlar düşük güvenle tanındı.');
    $('ocrProgress').value = 0; showResults(); controls(); if (!$('ocrDialog').open) $('ocrDialog').show();
  }
  $('btnOCR').onclick = open;
  $('btnCloseOCR').onclick = () => cancel(true);
  $('btnCancelOCR').onclick = () => cancel();
  $('ocrDialog').addEventListener('cancel', event => { if (state.ocrRunning) { event.preventDefault(); cancel(true); } });
  async function run() {
    if (state.ocrRunning) return;
    state.ocrRunning = true; cancelled = false; closeWhenStopped = false; results = []; showResults(); controls();
    if (cacheDocument !== state.pdf) { cache.clear(); cacheDocument = state.pdf; }
    const currentSource = pagePlan()[state.current - 1].source;
    const entries = $('ocrScope').value === 'all' ? [...pagePlan()].sort((a,b) => Math.abs(a.source-currentSource)-Math.abs(b.source-currentSource)) : [pagePlan()[state.current - 1]];
    const force = $('ocrForce').checked;
    const language = $('ocrLanguage').value;
    let completed = 0, skipped = 0, canvas;
    try {
      const reportProgress = event => {
        if (cancelled || completed >= entries.length) return;
        const progress = event.status === 'recognizing text' ? event.progress : 0;
        $('ocrProgress').value = Math.min(99, (completed + progress) / entries.length * 100);
        $('ocrStatus').textContent = t('Sayfa {page}/{total} · Metin tanınıyor…', { page: Math.min(completed + 1, entries.length), total: entries.length });
        $('ocrActivity').textContent = t('OCR {page}/{total}', {page: completed+1,total:entries.length});
      };
      for (const entry of entries) {
        if (cancelled) throw new Error('OCR_CANCELLED');
        const sourcePage = await state.pdf.getPage(entry.source + 1);
        const classification = await classifyPage(sourcePage);
        state.pages[entry.source].ocrState = 'pending';
        if (!force && !classification.needsOcr) { skipped++; completed++; continue; }
        if (cancelled) throw new Error('OCR_CANCELLED');
        await ensurePage(entry.source);
        const page = state.pages[entry.source];
        const key = entry.source + ':' + language + ':' + page.vp.rotation;
        if (!force && cache.has(key)) { results.push(structuredClone(cache.get(key))); completed++; showResults(); continue; }
        page.ocrState = 'processing'; reportProgress({status:'recognizing text',progress:0});
        session ||= createOcrSession(language, reportProgress);
        const scale = Math.min(300 / 72, Math.sqrt(16e6 / (page.vp.width * page.vp.height)));
        const viewport = sourcePage.getViewport({ scale, rotation: page.vp.rotation });
        canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        renderTask = sourcePage.render({ canvas, canvasContext: canvas.getContext('2d'), viewport });
        await renderTask.promise; renderTask = null;
        const { data } = await session.recognize(canvas);
        if (cancelled) throw new Error('OCR_CANCELLED');
        let lines = await prepareOcrLines(data.tsv, viewport, page.baseVp, canvas);
        if(cancelled)throw new Error('OCR_CANCELLED');
        if (classification.kind === 'mixed' && !force) {
          const objects=page.textObjects || await inspectTextObjects(state.bytes,entry.source);
          const native = objects.filter(item=>item.opacity>=.05).map(item => {
            const [left,bottom,right,top]=item.bounds;
            const corners=[[left,bottom],[right,top]].map(point=>page.baseVp.convertToViewportPoint(...point));
            return {x:Math.min(...corners.map(p=>p[0])),y:Math.min(...corners.map(p=>p[1])),
              w:Math.abs(corners[1][0]-corners[0][0]),h:Math.abs(corners[1][1]-corners[0][1])};
          });
          lines = lines.filter(line => !native.some(item => line.y < item.y+item.h && line.y+line.h > item.y && line.x < item.x + item.w && line.x + line.w > item.x));
        }
        const result = { page: entry.source, lines, blocks: blocksFromLines(lines) };
        results.push(result); cache.set(key,structuredClone(result)); page.ocrState = 'completed';
        completed++; canvas.width = 0; canvas.height = 0; canvas = null;
        showResults();
      }
      $('ocrProgress').value = 100;
      $('ocrActivity').textContent = t('OCR tamamlandı');
      $('ocrStatus').textContent = t('{pages} sayfa işlendi · {lines} satır tanındı · {skipped} metinli sayfa atlandı. Sonuçları kontrol et.', {
        pages: results.length, lines: results.reduce((sum, result) => sum + result.lines.length, 0), skipped
      });
    } catch (error) {
      for (const page of state.pages) if (['pending','processing'].includes(page.ocrState)) page.ocrState = cancelled ? 'pending' : 'failed';
      $('ocrActivity').textContent = t(cancelled ? 'OCR durduruldu' : 'OCR başarısız');
      results = []; showResults();
      $('ocrStatus').textContent = t(cancelled ? 'OCR durduruldu. Belge değiştirilmedi.' : 'OCR tamamlanamadı: {message}', { message: String(error?.message || error) });
    } finally {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      await session?.terminate().catch(() => {}); session = null; renderTask = null;
      state.ocrRunning = false; controls();
      if (closeWhenStopped) $('ocrDialog').close();
    }
  }
  $('btnRunOCR').onclick = run;
  async function apply() {
    if (state.ocrRunning || state.ocrApplying || !results.some(result => result.lines.length)) return;
    commitEditor();state.contentSelection=null;
    const mode = $('ocrMode').value;
    if (!['searchable', 'editable'].includes(mode)) return;
    const pdf=state.pdf,prepared=structuredClone(results),language=$('ocrLanguage').value;
    state.ocrApplying=true;controls();
    try{
    // A reopened searchable scan already has invisible PDF text. Replace that
    // layer rather than adding a second copy over the newly recognized words.
    const hidden=await Promise.all(prepared.map(async result=>(await inspectTextObjects(state.bytes,result.page)).filter(source=>source.opacity<.05)));
    if(state.pdf!==pdf)return;
    pushHistory();
    for (const [index,result] of prepared.entries()) {
      if (!result.lines.length) continue;
      state.annots[result.page] = (state.annots[result.page] || []).filter(a => a.type !== 'ocr');
      for(const source of hidden[index]){
        state.annots[result.page]=state.annots[result.page].filter(item=>item.type!=='replaceText'||item.source.index!==source.index);
        state.annots[result.page].push({type:'replaceText',source,text:'',size:source.size,color:source.color});
      }
      state.annots[result.page].push({ type: 'ocr', mode, language, blocks: result.blocks || blocksFromLines(result.lines), lines: structuredClone(result.lines) });
    }
    afterChange(); $('ocrDialog').close();
    toast(t('OCR sonuçları uygulandı. PDF olarak kaydetmeyi unutma.'));
    }catch{toast(t('OCR sonuçları uygulanamadı. Belgeyi yeniden açıp dene.'),true);}
    finally{state.ocrApplying=false;controls();}
  }
  $('btnApplyOCR').onclick = apply;
  return {
    async recognizePage(index) {
      if (state.ocrRunning) { toast(t('OCR sürüyor. Tamamlandığında metni seçebilirsin.')); return; }
      state.current = pagePlan().findIndex(entry => entry.source === index) + 1;
      open(); $('ocrScope').value = 'current'; $('ocrMode').value = 'editable';
      await run();
      if (results.some(result => result.lines.length)) await apply();
    },
    reset() { cache.clear();results=[];showResults();$('ocrDialog').close();$('ocrActivity').textContent='';controls(); }
  };
}
