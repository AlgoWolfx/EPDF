// Notları PDF'in üzerine kalıcı olarak işler (pdf-lib).
import { polylines, styleOf, effWidth, textMetrics, BASELINE, LINE_HEIGHT } from './geometry.js';
import { removeTextObjects } from './pdf-engine.js';

const {
  PDFDocument, StandardFonts, rgb, degrees,
  pushGraphicsState, popGraphicsState, setGraphicsState,
  moveTo, lineTo, closePath, stroke, fill,
  setLineWidth, setLineCap, setLineJoin, LineCapStyle, LineJoinStyle,
  setStrokingColor, setFillingColor
} = window.PDFLib;

const TR_FALLBACK = { ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I' };

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function buildPdf({ bytes, annots, viewports, fontBytes, applyPagePlan = true }) {
  const doc = await PDFDocument.load(await removeTextObjects(bytes, annots));

  const hasText = Object.values(annots).some(l => l.some(a => a.type === 'text' || (a.type === 'replaceText' && a.text)));
  let font = null;
  let unicodeFont = false;
  if (hasText) {
    if (fontBytes) {
      doc.registerFontkit(window.fontkit);
      font = await doc.embedFont(fontBytes, { subset: true });
      unicodeFont = true;
    } else {
      throw new Error('A Unicode font is required for text export.');
    }
  }

  for (const [key, list] of Object.entries(annots)) {
    if (key === '__pages') continue;
    if (!list.length) continue;
    const idx = Number(key);
    const page = doc.getPage(idx);
    const vp = viewports[idx];
    const angle = (((page.getRotation().angle % 360) + 360) % 360);
    const toPdf = (x, y) => vp.convertToPdfPoint(x, y);
    const gsCache = new Map();
    const gs = (opacity) => {
      if (!gsCache.has(opacity)) {
        const dict = doc.context.obj({ Type: 'ExtGState', CA: opacity, ca: opacity });
        gsCache.set(opacity, page.node.newExtGState('GS', dict));
      }
      return gsCache.get(opacity);
    };

    for (const a of list) {
      if (a.type === 'replaceText') {
        if (a.text) {
          const matrix = a.source.matrix;
          const rotation = Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI;
          a.text.split('\n').forEach((line, i) => {
            const radians = rotation * Math.PI / 180;
            page.drawText(line, { x: matrix[4] + i * a.size * LINE_HEIGHT * Math.sin(radians),
              y: matrix[5] - i * a.size * LINE_HEIGHT * Math.cos(radians),
              size: a.size, font, color: hexToRgb(a.color), rotate: degrees(rotation) });
          });
        }
        continue;
      }
      if (a.type === 'text') {
        const { lines } = textMetrics(a);
        lines.forEach((line, i) => {
          let s = line;
          if (!unicodeFont) s = s.replace(/[şŞğĞıİ]/g, c => TR_FALLBACK[c]);
          if (!s) return;
          const [x, y] = toPdf(a.x, a.y + a.size * BASELINE + i * a.size * LINE_HEIGHT);
          try {
            page.drawText(s, { x, y, size: a.size, font, color: hexToRgb(a.color), rotate: degrees(angle) });
          } catch {
            page.drawText(s.replace(/[^\x20-\x7e]/g, '?'), { x, y, size: a.size, font, color: hexToRgb(a.color), rotate: degrees(angle) });
          }
        });
        continue;
      }

      const st = styleOf(a);
      const color = hexToRgb(a.color);
      for (const pl of polylines(a)) {
        const ops = [
          pushGraphicsState(),
          setGraphicsState(gs(st.opacity)),
          setStrokingColor(color),
          setFillingColor(color),
          setLineWidth(effWidth(a)),
          setLineCap(LineCapStyle.Round),
          setLineJoin(LineJoinStyle.Round)
        ];
        pl.pts.forEach(([x, y], i) => {
          const [px, py] = toPdf(x, y);
          ops.push(i ? lineTo(px, py) : moveTo(px, py));
        });
        if (pl.closed) ops.push(closePath());
        ops.push(st.fill ? fill() : stroke());
        ops.push(popGraphicsState());
        page.pushOperators(...ops);
      }
    }
  }

  if (applyPagePlan && annots.__pages?.[0]) {
    const pages = doc.getPages();
    const plan = annots.__pages[0].entries;
    if (!plan.length || new Set(plan.map(entry => entry.source)).size !== plan.length ||
        plan.some(entry => !Number.isInteger(entry.source) || !pages[entry.source] || ![0, 90, 180, 270].includes(entry.rotation))) {
      throw new Error('Invalid page arrangement.');
    }
    for (let i = pages.length - 1; i >= 0; i--) doc.removePage(i);
    for (const entry of plan) {
      const page = pages[entry.source];
      page.setRotation(degrees((page.getRotation().angle + entry.rotation) % 360));
      doc.addPage(page);
    }
  }
  return doc.save();
}
