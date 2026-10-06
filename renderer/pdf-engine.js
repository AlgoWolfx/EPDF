import { init } from '../node_modules/@embedpdf/pdfium/dist/index.browser.js';

let enginePromise;
async function engine() {
  enginePromise ||= window.api.loadPdfiumWasm().then(wasmBinary => init({ wasmBinary })).then(module => {
    module.PDFiumExt_Init();
    return module;
  }).catch(error => { enginePromise = null; throw error; });
  return enginePromise;
}

function withDocument(module, bytes, callback) {
  const runtime = module.pdfium;
  const ptr = runtime.wasmExports.malloc(bytes.length);
  runtime.HEAPU8.set(bytes, ptr);
  const doc = module.FPDF_LoadMemDocument64(ptr, bytes.length, '');
  if (!doc) { runtime.wasmExports.free(ptr); throw new Error('PDF content could not be loaded.'); }
  try { return callback(doc, runtime); }
  finally { module.FPDF_CloseDocument(doc); runtime.wasmExports.free(ptr); }
}

function objectText(module, runtime, object, textPage) {
  const size = module.FPDFTextObj_GetText(object, textPage, 0, 0);
  if (size <= 2) return '';
  const ptr = runtime.wasmExports.malloc(size);
  try {
    module.FPDFTextObj_GetText(object, textPage, ptr, size);
    return runtime.UTF16ToString(ptr);
  } finally { runtime.wasmExports.free(ptr); }
}

export async function inspectTextObjects(bytes, pageIndex) {
  const module = await engine();
  return withDocument(module, bytes, (doc, runtime) => {
    const page = module.FPDF_LoadPage(doc, pageIndex);
    if (!page) throw new Error('Page could not be loaded.');
    const textPage = module.FPDFText_LoadPage(page);
    const scratch = runtime.wasmExports.malloc(64);
    try {
      const objects = [];
      for (let index = 0; index < module.FPDFPage_CountObjects(page); index++) {
        const object = module.FPDFPage_GetObject(page, index);
        if (module.FPDFPageObj_GetType(object) !== 1) continue;
        const text = objectText(module, runtime, object, textPage);
        if (!text.trim() || !module.FPDFPageObj_GetBounds(object, scratch, scratch + 4, scratch + 8, scratch + 12)) continue;
        const bounds = [0, 4, 8, 12].map(offset => runtime.getValue(scratch + offset, 'float'));
        if (!module.FPDFPageObj_GetMatrix(object, scratch + 16)) continue;
        const matrix = [0, 4, 8, 12, 16, 20].map(offset => runtime.getValue(scratch + 16 + offset, 'float'));
        module.FPDFTextObj_GetFontSize(object, scratch + 40);
        const size = runtime.getValue(scratch + 40, 'float') * Math.hypot(matrix[0], matrix[1]);
        let color = '#111111';
        if (module.FPDFPageObj_GetFillColor(object, scratch + 44, scratch + 48, scratch + 52, scratch + 56)) {
          color = '#' + [44, 48, 52].map(offset => runtime.getValue(scratch + offset, 'i32').toString(16).padStart(2, '0')).join('');
        }
        // Skewed, mirrored and vertical text needs a full typesetting editor.
        const editable = Math.abs(matrix[0] * matrix[2] + matrix[1] * matrix[3]) < .01 &&
          Math.abs(Math.hypot(matrix[0], matrix[1]) - Math.hypot(matrix[2], matrix[3])) < .01 &&
          Math.abs(matrix[0]) > .001 && matrix[0] * matrix[3] - matrix[1] * matrix[2] > 0 && Number.isFinite(size) && size > 0;
        objects.push({ index, text, bounds, matrix, size, color, editable });
      }
      return objects;
    } finally {
      runtime.wasmExports.free(scratch);
      module.FPDFText_ClosePage(textPage);
      module.FPDF_ClosePage(page);
    }
  });
}

export async function removeTextObjects(bytes, annots) {
  const replacements = Object.entries(annots).filter(([, list]) => list.some(a => a.type === 'replaceText'));
  if (!replacements.length) return bytes.slice();
  const module = await engine();
  return withDocument(module, bytes, (doc, runtime) => {
    for (const [index, list] of replacements) {
      const page = module.FPDF_LoadPage(doc, Number(index));
      if (!page) throw new Error('Page could not be loaded.');
      let textPage = module.FPDFText_LoadPage(page);
      try {
        const edits = list.filter(a => a.type === 'replaceText').sort((a, b) => b.source.index - a.source.index);
        const seen = new Set();
        const objects = [];
        for (const edit of edits) {
          if (seen.has(edit.source.index)) throw new Error('Duplicate text edit.');
          seen.add(edit.source.index);
          const object = module.FPDFPage_GetObject(page, edit.source.index);
          if (!object || module.FPDFPageObj_GetType(object) !== 1 ||
              objectText(module, runtime, object, textPage) !== edit.source.text) {
            throw new Error('The source text has changed. Reopen the original PDF.');
          }
          objects.push(object);
        }
        module.FPDFText_ClosePage(textPage);
        textPage = 0;
        for (const object of objects) {
          if (!module.FPDFPage_RemoveObject(page, object)) throw new Error('Text could not be removed.');
          module.FPDFPageObj_Destroy(object);
        }
        if (!module.FPDFPage_GenerateContent(page)) throw new Error('Page could not be updated.');
      } finally { if (textPage) module.FPDFText_ClosePage(textPage); module.FPDF_ClosePage(page); }
    }
    const writer = module.PDFiumExt_OpenFileWriter();
    if (!writer) throw new Error('Edited PDF could not be exported.');
    let ptr;
    try {
      if (!module.FPDF_SaveAsCopy(doc, writer, 2)) throw new Error('Edited PDF could not be exported.');
      const size = module.PDFiumExt_GetFileWriterSize(writer);
      ptr = runtime.wasmExports.malloc(size);
      module.PDFiumExt_GetFileWriterData(writer, ptr, size);
      return runtime.HEAPU8.slice(ptr, ptr + size);
    } finally {
      if (ptr) runtime.wasmExports.free(ptr);
      module.PDFiumExt_CloseFileWriter(writer);
    }
  });
}
