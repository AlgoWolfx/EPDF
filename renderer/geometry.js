// Ortak geometri: çizim, dokunma testi ve PDF'e aktarma aynı şekilleri kullanır.
// Koordinatlar sayfa birimindedir (PDF noktası, ölçek 1, sol-üst orijin).

export const FONT = 'Arial, sans-serif';
export const LINE_HEIGHT = 1.2;
// Textarea içindeki ilk satırın taban çizgisi (Arial) — ekranla PDF aynı yerde çıksın diye.
export const BASELINE = 0.9465;

const measureCtx = document.createElement('canvas').getContext('2d');

export function textMetrics(a) {
  measureCtx.font = `${a.size}px ${FONT}`;
  const lines = a.text.split('\n');
  const w = Math.max(1, ...lines.map(l => measureCtx.measureText(l).width));
  return { lines, w, h: lines.length * a.size * LINE_HEIGHT };
}

export function effWidth(a) {
  return a.type === 'highlighter' ? a.width * 3 + 6 : a.width;
}

export function styleOf(a) {
  switch (a.type) {
    case 'highlighter': return { opacity: 0.35, fill: false, stroke: true };
    case 'hlrect': return { opacity: 0.35, fill: true, stroke: false };
    default: return { opacity: 1, fill: false, stroke: true };
  }
}

function ellipsePts(a) {
  const cx = (a.x1 + a.x2) / 2, cy = (a.y1 + a.y2) / 2;
  const rx = Math.abs(a.x2 - a.x1) / 2, ry = Math.abs(a.y2 - a.y1) / 2;
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return pts;
}

// Bir nesneyi çizgi dizilerine çevirir. Metin için boş döner.
export function polylines(a) {
  switch (a.type) {
    case 'pen':
    case 'highlighter': {
      const pts = a.pts.length === 1 ? [a.pts[0], [a.pts[0][0] + 0.01, a.pts[0][1]]] : a.pts;
      return [{ pts, closed: false }];
    }
    case 'line':
    case 'underline':
      return [{ pts: [[a.x1, a.y1], [a.x2, a.y2]], closed: false }];
    case 'arrow': {
      const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
      const len = Math.max(10, a.width * 4);
      const barb = (d) => [a.x2 - len * Math.cos(ang + d), a.y2 - len * Math.sin(ang + d)];
      return [
        { pts: [[a.x1, a.y1], [a.x2, a.y2]], closed: false },
        { pts: [barb(0.5), [a.x2, a.y2], barb(-0.5)], closed: false }
      ];
    }
    case 'rect':
    case 'hlrect':
      return [{ pts: [[a.x1, a.y1], [a.x2, a.y1], [a.x2, a.y2], [a.x1, a.y2]], closed: true }];
    case 'ellipse':
      return [{ pts: ellipsePts(a), closed: true }];
    default:
      return [];
  }
}

export function bbox(a) {
  if (a.type === 'text') {
    const m = textMetrics(a);
    return { x: a.x, y: a.y, w: m.w, h: m.h };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pl of polylines(a)) for (const [x, y] of pl.pts) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const pad = effWidth(a) / 2;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function hitTest(a, x, y, tol) {
  if (a.type === 'text') {
    const b = bbox(a);
    return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
  }
  if (a.type === 'hlrect') {
    const b = bbox(a);
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }
  const reach = tol + effWidth(a) / 2;
  for (const pl of polylines(a)) {
    const p = pl.pts;
    const n = pl.closed ? p.length : p.length - 1;
    for (let i = 0; i < n; i++) {
      const q = p[(i + 1) % p.length];
      if (distToSeg(x, y, p[i][0], p[i][1], q[0], q[1]) <= reach) return true;
    }
  }
  return false;
}

export function moveAnnot(a, dx, dy) {
  if (a.pts) a.pts = a.pts.map(([x, y]) => [x + dx, y + dy]);
  else if (a.type === 'text') { a.x += dx; a.y += dy; }
  else { a.x1 += dx; a.x2 += dx; a.y1 += dy; a.y2 += dy; }
}

// Tuval bağlamı sayfa birimine ölçeklenmiş olarak verilir.
export function drawAnnot(ctx, a) {
  if (a.type === 'text') {
    ctx.font = `${a.size}px ${FONT}`;
    ctx.fillStyle = a.color;
    ctx.textBaseline = 'alphabetic';
    a.text.split('\n').forEach((line, i) => {
      ctx.fillText(line, a.x, a.y + a.size * BASELINE + i * a.size * LINE_HEIGHT);
    });
    return;
  }
  const st = styleOf(a);
  ctx.save();
  ctx.globalAlpha = st.opacity;
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = effWidth(a);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const pl of polylines(a)) {
    ctx.beginPath();
    pl.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (pl.closed) ctx.closePath();
    if (st.fill) ctx.fill();
    if (st.stroke) ctx.stroke();
  }
  ctx.restore();
}
