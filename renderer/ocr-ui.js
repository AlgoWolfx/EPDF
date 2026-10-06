import { createOcrSession, linesFromTsv } from './ocr.js';
import { t } from './i18n.js';

export function setupOcr({ state, pagePlan, commitEditor, pushHistory, afterChange, updateButtons, toast }) {
  const $ = id => document.getElementById(id);
  let results = [], session, renderTask, cancelled = false, closeWhenStopped = false;
  function controls() {
    for (const id of ['ocrLanguage', 'ocrScope', 'ocrMode', 'ocrForce', 'btnRunOCR']) $(id).disabled = !!state.ocrRunning;
    $('btnCancelOCR').hidden = !state.ocrRunning;
    $('btnApplyOCR').disabled = !!state.ocrRunning || !results.some(result => result.lines.length);
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
    cancelled = true; closeWhenStopped = close; session?.cancel(); renderTask?.cancel();
  }
  $('btnOCR').onclick = () => {
    commitEditor();
    const current = pagePlan()[state.current - 1]?.source;
    const previous = (state.annots[current] || []).find(a => a.type === 'ocr');
    results = previous ? [{ page: current, lines: structuredClone(previous.lines) }] : [];
    if (previous) $('ocrMode').value = previous.mode;
    $('ocrStatus').textContent = t('Tanımayı başlat, sonuçları kontrol et ve uygula. Sarı alanlar düşük güvenle tanındı.');
    $('ocrProgress').value = 0; showResults(); controls(); $('ocrDialog').showModal();
  };
  $('btnCloseOCR').onclick = () => cancel(true);
  $('btnCancelOCR').onclick = () => cancel();
  $('ocrDialog').addEventListener('cancel', event => { if (state.ocrRunning) { event.preventDefault(); cancel(true); } });
  $('btnRunOCR').onclick = async () => {
    if (state.ocrRunning) return;
    state.ocrRunning = true; cancelled = false; closeWhenStopped = false; results = []; showResults(); controls();
    const entries = $('ocrScope').value === 'all' ? pagePlan() : [pagePlan()[state.current - 1]];
    const force = $('ocrForce').checked;
    let completed = 0, skipped = 0, canvas;
    try {
      const reportProgress = event => {
        if (cancelled || completed >= entries.length) return;
        const progress = event.status === 'recognizing text' ? event.progress : 0;
        $('ocrProgress').value = Math.min(99, (completed + progress) / entries.length * 100);
        $('ocrStatus').textContent = t('Sayfa {page}/{total} · Metin tanınıyor…', { page: Math.min(completed + 1, entries.length), total: entries.length });
      };
      for (const entry of entries) {
        if (cancelled) throw new Error('OCR_CANCELLED');
        const sourcePage = await state.pdf.getPage(entry.source + 1);
        const content = await sourcePage.getTextContent();
        if (!force && content.items.some(item => item.str?.trim())) { skipped++; completed++; continue; }
        if (cancelled) throw new Error('OCR_CANCELLED');
        session ||= createOcrSession($('ocrLanguage').value, reportProgress);
        const page = state.pages[entry.source];
        const scale = Math.min(300 / 72, Math.sqrt(16e6 / (page.vp.width * page.vp.height)));
        const viewport = sourcePage.getViewport({ scale, rotation: page.vp.rotation });
        canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        renderTask = sourcePage.render({ canvas, canvasContext: canvas.getContext('2d'), viewport });
        await renderTask.promise; renderTask = null;
        const { data } = await session.recognize(canvas);
        if (cancelled) throw new Error('OCR_CANCELLED');
        results.push({ page: entry.source, lines: linesFromTsv(data.tsv, viewport, page.baseVp) });
        completed++; canvas.width = 0; canvas.height = 0; canvas = null;
        showResults();
      }
      $('ocrProgress').value = 100;
      $('ocrStatus').textContent = t('{pages} sayfa işlendi · {lines} satır tanındı · {skipped} metinli sayfa atlandı. Sonuçları kontrol et.', {
        pages: results.length, lines: results.reduce((sum, result) => sum + result.lines.length, 0), skipped
      });
    } catch (error) {
      results = []; showResults();
      $('ocrStatus').textContent = t(cancelled ? 'OCR durduruldu. Belge değiştirilmedi.' : 'OCR tamamlanamadı: {message}', { message: String(error?.message || error) });
    } finally {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      await session?.terminate().catch(() => {}); session = null; renderTask = null;
      state.ocrRunning = false; controls();
      if (closeWhenStopped) $('ocrDialog').close();
    }
  };
  $('btnApplyOCR').onclick = () => {
    if (state.ocrRunning || !results.some(result => result.lines.length)) return;
    const mode = $('ocrMode').value;
    if (!['searchable', 'editable'].includes(mode)) return;
    pushHistory();
    for (const result of results) {
      if (!result.lines.length) continue;
      state.annots[result.page] = (state.annots[result.page] || []).filter(a => a.type !== 'ocr');
      state.annots[result.page].push({ type: 'ocr', mode, language: $('ocrLanguage').value, lines: structuredClone(result.lines) });
    }
    afterChange(); $('ocrDialog').close();
    toast(t('OCR sonuçları uygulandı. PDF olarak kaydetmeyi unutma.'));
  };
}
