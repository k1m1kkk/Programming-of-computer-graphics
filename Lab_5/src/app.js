const $ = (id) => document.getElementById(id);
const $all = (selector) => [...document.querySelectorAll(selector)];
const nfmt = (number, digits = 2) => Number.isFinite(number) ? Number(number).toLocaleString('ru-RU', { maximumFractionDigits: digits }) : '—';
const coord = (x) => nfmt(x, 4);
const linePresets = {
  cross: [[-22, -11, 20, 14], [-24, 9, 22, -9], [-18, 0, 18, 0], [0, -17, 0, 18], [-15, 11, 15, 11], [13, -15, 13, 18], [-18, -13, -12, -9], [-7, -4, 8, 5]],
  border: [[-10, -8, 10, -8], [-10, 8, 10, 8], [-10, -8, -10, 8], [10, -8, 10, 8], [-15, 8, 15, 8], [-17, -8, 12, -8], [-10, 0, -10, 0], [10, 8, 10, 8]],
  vertex: [[-25, -23, 10, 8], [-25, 23, 10, -8], [0, -18, 20, 2], [-10, -8, -10, -8], [10, 8, 10, 8], [-15, 5, -10, 8], [-15, -8, 10, -8]],
  parallel: [[-24, 9, 24, 9], [-25, 8, 20, 8], [-25, -8, 20, -8], [-25, -9, 20, -9], [12, -19, 12, 19], [10, -20, 10, 20], [0, 0, 0, 0]]
};
const convexPresets = {
  diamond: '0 -12\n14 0\n0 12\n-14 0',
  triangle: '-16 -10\n17 -7\n0 15',
  hexagon: '-16 0\n-8 -12\n9 -12\n16 0\n9 12\n-8 12',
  square: '-12 -9\n12 -9\n12 9\n-12 9'
};
const polyPresets = {
  concave: '-18 -12\n-8 -12\n-8 2\n-3 2\n-3 -4\n9 -4\n9 -12\n18 -12\n18 15\n-18 15',
  split: '-18 -12\n-4 -12\n-4 12\n4 12\n4 -12\n18 -12\n18 14\n-18 14',
  hole: '-16 -13\n16 -13\n16 13\n-16 13\n\n-4 -4\n4 -4\n4 4\n-4 4',
  bowtie: '-16 -12\n16 12\n-16 12\n16 -12',
  corners: '-10 -8\n0 -20\n10 -8\n22 0\n10 8\n0 20\n-10 8\n-22 0',
  overlap: '-10 -8\n16 -8\n16 12\n-10 12'
};
const app = {
  mode: 'segments', algorithm: 'cohen', window: rect(-10, -8, 10, 8),
  segments: linePresets.cross.map((s) => [...s]), polygon: parseRings(polyPresets.concave),
  polygonResult: [], segmentResult: [], convexClip: parseRings(convexPresets.diamond)[0], comparison: null,
  camera: { x: 0, y: 0, scale: 14 }, width: 760, height: 440, pixelRatio: 1,
  pointer: null, animation: false, currentShift: { x: 0, y: 0 },
  worker: null, benchWorker: null, queryPending: false, queryDirty: false, queryCounter: 0,
  stressReady: false, stressCount: 0, stressNodes: 0, stressResult: null, stressBuildMs: 0,
  benchmark: null, benchmarkBusy: false, frameTimes: [], lastFrame: 0, lastResultTime: 0, paintScheduled: false,
  fps: 0, lastPaintAt: 0, renderFrameTimes: [], gpu: null
};
const canvas = $('geometry-canvas');
const stressCanvas = $('stress-canvas');
const ctx = canvas.getContext('2d', { alpha: true });
try { app.gpu = new StressRenderer(stressCanvas); } catch (error) { app.gpu = null; }

function showError(error) {
  const box = $('form-error');
  box.textContent = error?.message || String(error);
  box.hidden = false;
}
function clearError() { $('form-error').hidden = true; }
function valuesOfWindow() {
  const values = ['xmin', 'ymin', 'xmax', 'ymax'].map((id) => {
    const element = $(id);
    if (element.value.trim() === '') throw new Error(`Укажите ${id}.`);
    const value = Number(element.value.replace(',', '.'));
    if (!Number.isFinite(value)) throw new Error(`Проверьте ${id}.`);
    return value;
  });
  return rect(...values);
}
function syncWindow() {
  for (const key of ['xmin', 'ymin', 'xmax', 'ymax']) $(key).value = Number(app.window[key].toFixed(7));
}
function parseSegmentRows(text) {
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (lines.length > 30000) throw new Error('Ручной режим ограничен 30 000 отрезками; для больших данных используйте Quadtree.');
  return lines.map((line) => {
    const coords = line.replace(/,/g, '.').split(/\s+/).map(Number);
    if (coords.length !== 4 || !coords.every(Number.isFinite)) throw new Error(`В строке «${line}» нужны четыре координаты.`);
    return coords;
  });
}
function writeSegmentRows() { $('segments-input').value = app.segments.map((s) => s.map((v) => Number(v.toFixed(7))).join(' ')).join('\n'); }
function toScreen(x, y) { return { x: (x - app.camera.x) * app.camera.scale + app.width / 2,
  y: (app.camera.y - y) * app.camera.scale + app.height / 2 }; }
function toWorld(x, y) { return { x: (x - app.width / 2) / app.camera.scale + app.camera.x,
  y: app.camera.y - (y - app.height / 2) / app.camera.scale }; }
function frameCanvas() {
  const bounds = canvas.getBoundingClientRect();
  app.width = Math.max(240, bounds.width);
  app.height = Math.max(300, bounds.height);
  app.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  stressCanvas.width = Math.round(app.width * app.pixelRatio);
  stressCanvas.height = Math.round(app.height * app.pixelRatio);
  canvas.width = Math.round(app.width * app.pixelRatio);
  canvas.height = Math.round(app.height * app.pixelRatio);
  ctx.setTransform(app.pixelRatio, 0, 0, app.pixelRatio, 0, 0);
  queuePaint();
}
function queuePaint() {
  if (app.paintScheduled) return;
  app.paintScheduled = true;
  requestAnimationFrame(() => { app.paintScheduled = false; paint(); });
}
function gridStep() {
  const target = 66 / app.camera.scale;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(target, 1e-9)));
  return [1, 2, 5, 10].map((v) => v * magnitude).find((v) => v >= target) || 10 * magnitude;
}
function paintGrid() {
  ctx.clearRect(0, 0, app.width, app.height);
  if (app.mode !== 'stress') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, app.width, app.height); }
  const step = gridStep();
  const topLeft = toWorld(0, 0), bottomRight = toWorld(app.width, app.height);
  const xmin = topLeft.x, xmax = bottomRight.x, ymin = bottomRight.y, ymax = topLeft.y;
  if ($('show-grid').checked) {
    ctx.beginPath(); ctx.strokeStyle = '#edf0f5'; ctx.lineWidth = 1;
    for (let x = Math.ceil(xmin / step) * step; x <= xmax + EPS; x += step) {
      const px = Math.round(toScreen(x, 0).x) + .5; ctx.moveTo(px, 0); ctx.lineTo(px, app.height);
    }
    for (let y = Math.ceil(ymin / step) * step; y <= ymax + EPS; y += step) {
      const py = Math.round(toScreen(0, y).y) + .5; ctx.moveTo(0, py); ctx.lineTo(app.width, py);
    }
    ctx.stroke();
  }
  if (!$('show-axes').checked) return;
  const zero = toScreen(0, 0);
  ctx.strokeStyle = '#b9c3d2'; ctx.lineWidth = 1.25; ctx.beginPath();
  ctx.moveTo(zero.x, 0); ctx.lineTo(zero.x, app.height);
  ctx.moveTo(0, zero.y); ctx.lineTo(app.width, zero.y); ctx.stroke();
  ctx.fillStyle = '#7b8799'; ctx.font = '11px system-ui';
  for (let x = Math.ceil(xmin / step) * step; x <= xmax + EPS; x += step) {
    const pos = toScreen(x, 0);
    ctx.fillText(nfmt(x, 4), pos.x + 3, Math.max(14, Math.min(app.height - 8, zero.y + 15)));
  }
  for (let y = Math.ceil(ymin / step) * step; y <= ymax + EPS; y += step) {
    if (Math.abs(y) <= EPS) continue;
    const pos = toScreen(0, y);
    ctx.fillText(nfmt(y, 4), Math.max(5, Math.min(app.width - 35, zero.x + 6)), pos.y - 3);
  }
}
function drawWindow() {
  const r = app.window, lt = toScreen(r.xmin, r.ymax), rb = toScreen(r.xmax, r.ymin);
  ctx.fillStyle = 'rgba(40, 99, 189, 0.055)';
  ctx.fillRect(lt.x, lt.y, rb.x - lt.x, rb.y - lt.y);
  ctx.setLineDash([7, 4]); ctx.strokeStyle = '#2863bd'; ctx.lineWidth = 2;
  ctx.strokeRect(lt.x, lt.y, rb.x - lt.x, rb.y - lt.y);
  ctx.setLineDash([]);
  for (const x of [r.xmin, r.xmax]) for (const y of [r.ymin, r.ymax]) {
    const p = toScreen(x, y);
    ctx.fillStyle = 'white'; ctx.strokeStyle = '#2863bd'; ctx.lineWidth = 1.4;
    ctx.fillRect(p.x - 4.5, p.y - 4.5, 9, 9); ctx.strokeRect(p.x - 4.5, p.y - 4.5, 9, 9);
  }
}
function drawSegment(s, color, width = 1.8, shift = null) {
  const dx = shift?.x || 0, dy = shift?.y || 0;
  const a = toScreen(s[0] + dx, s[1] + dy), b = toScreen(s[2] + dx, s[3] + dy);
  ctx.beginPath(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
  if (Math.abs(a.x - b.x) <= 0.001 && Math.abs(a.y - b.y) <= 0.001) {
    ctx.arc(a.x, a.y, Math.max(2.7, width * 1.4), 0, Math.PI * 2); ctx.fill();
  } else { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
}
function drawPolyContours(rings, fill, stroke) {
  if (!rings.length) return;
  ctx.beginPath();
  for (const ring of rings) {
    if (ring.length < 2) continue;
    let v = toScreen(ring[0].x, ring[0].y);
    ctx.moveTo(v.x, v.y);
    for (let i = 1; i < ring.length; i++) {
      v = toScreen(ring[i].x, ring[i].y); ctx.lineTo(v.x, v.y);
    }
    ctx.closePath();
  }
  if (fill) { ctx.fillStyle = fill; ctx.fill('evenodd'); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
function drawConvexClip() {
  drawPolyContours([app.convexClip], 'rgba(40, 99, 189, 0.055)', '#2863bd');
  for (const v of app.convexClip) {
    const p = toScreen(v.x, v.y);
    ctx.fillStyle = 'white'; ctx.strokeStyle = '#2863bd'; ctx.lineWidth = 1.3;
    ctx.fillRect(p.x - 4, p.y - 4, 8, 8); ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
  }
}
function writeConvexRows() { $('convex-input').value = app.convexClip.map(v => `${Number(v.x.toFixed(9))} ${Number(v.y.toFixed(9))}`).join('\n'); }
function paint() {
  paintGrid();
  if (app.mode === 'segments' || app.mode === 'convex') {
    if ($('show-original').checked) for (const segment of app.segments) drawSegment(segment, '#a8b0bd', 1.8);
    if (app.mode === 'convex') drawConvexClip(); else drawWindow();
    for (const seg of app.segmentResult) if (seg) drawSegment(seg, '#13996f', 3);
    for (const s of app.segments) for (const k of [0, 2]) {
      const p = toScreen(s[k], s[k + 1]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#9da7b7'; ctx.fill();
    }
  } else if (app.mode === 'polygons') {
    if ($('show-original').checked) drawPolyContours(app.polygon, 'rgba(135,148,169,.11)', '#a1aabb');
    drawWindow();
    drawPolyContours(app.polygonResult, 'rgba(20,151,110,.28)', '#15966e');
    if ($('show-original').checked) for (const ring of app.polygon) for (const v of ring) {
      const p = toScreen(v.x, v.y); ctx.fillStyle = '#95a1b4'; ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
    }
  } else {
    drawWindow();
    if (app.stressResult && !app.gpu) {
      const array = app.stressResult.output;
      ctx.save();
      const lt = toScreen(app.window.xmin, app.window.ymax), rb = toScreen(app.window.xmax, app.window.ymin);
      ctx.beginPath(); ctx.rect(lt.x, lt.y, rb.x - lt.x, rb.y - lt.y); ctx.clip();
      ctx.beginPath(); ctx.strokeStyle = '#11956d'; ctx.lineWidth = 1.05;
      for (let i = 0; i < array.length; i += 4) {
        const a = toScreen(array[i] + app.currentShift.x, array[i + 1] + app.currentShift.y);
        const b = toScreen(array[i + 2] + app.currentShift.x, array[i + 3] + app.currentShift.y);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  if (app.mode === 'stress' && app.gpu) {
    app.gpu.draw(app.camera, app.width, app.height, app.pixelRatio, app.window, app.currentShift);
  }
  if (app.mode === 'stress' && app.animation && app.stressReady) {
    const now = performance.now();
    if (app.lastPaintAt) app.renderFrameTimes.push(now - app.lastPaintAt);
    if (app.renderFrameTimes.length > 60) app.renderFrameTimes.shift();
    app.lastPaintAt = now;
    if (app.renderFrameTimes.length >= 8) {
      const mean = app.renderFrameTimes.reduce((a, b) => a + b, 0) / app.renderFrameTimes.length;
      $('fps-label').textContent = `Рендер ${nfmt(1000 / mean, 1)} FPS`;
    }
  }
}
function setStageMessage(text) { $('canvas-badge').textContent = text; }
function recomputeSmall() {
  if (app.mode === 'segments' || app.mode === 'convex') {
    const start = performance.now();
    const fn = app.mode === 'convex' ? (x1,y1,x2,y2) => clipCyrusBeck(x1,y1,x2,y2,app.convexClip,null,app.convexSign) : (app.algorithm === 'cohen' ? clipCohen : clipLiang);
    app.segmentResult = app.segments.map((s) => fn(...s, app.window));
    const elapsed = performance.now() - start;
    $('stat-total').textContent = nfmt(app.segments.length, 0);
    $('stat-visible').textContent = nfmt(app.segmentResult.filter(Boolean).length, 0);
    $('stat-work').textContent = `${nfmt(elapsed, 3)} мс`;
    $('stat-total-label').textContent = 'Всего отрезков';
    setStageMessage(app.mode === 'convex' ? 'Сайрус–Бек · выпуклый многоугольник' : app.algorithm === 'cohen' ? 'Коэн–Сазерленд · вариант 10' : 'Лианг–Барски');
    renderSegmentsTable();
  } else if (app.mode === 'polygons') {
    const start = performance.now();
    app.polygonResult = clipPolygon(app.polygon, rectangleRing(app.window));
    const elapsed = performance.now() - start;
    $('stat-total').textContent = nfmt(app.polygon.reduce((acc, ring) => acc + ring.length, 0), 0);
    $('stat-total-label').textContent = 'Исходных вершин';
    $('stat-visible').textContent = nfmt(app.polygonResult.length, 0);
    $('stat-work').textContent = `${nfmt(elapsed, 3)} мс`;
    setStageMessage('Контурный граф · even-odd');
    renderPolygonTable();
  } else {
    requestStressQuery();
  }
  queuePaint();
}
function renderSegmentsTable() {
  $('segment-table').innerHTML = app.segments.slice(0, 15).map((s, i) => `<tr><td>${i + 1}</td><td>${s.map(coord).join(' · ')}</td><td>${app.segmentResult[i]?.map(coord).join(' · ') || 'Отброшен'}</td></tr>`).join('') +
    (app.segments.length > 15 ? '<tr><td colspan="3">Показаны первые 15 отрезков</td></tr>' : '');
}
function renderPolygonTable() {
  const rings = app.polygonResult;
  $('polygon-table').innerHTML = rings.map((ring, i) => {
    const area = polygonArea(ring);
    return `<tr><td>${i + 1}</td><td>${ring.length}</td><td>${nfmt(area, 4)}</td><td>${area < 0 ? 'Отверстие' : 'Внешняя граница'}</td></tr>`;
  }).join('') || '<tr><td colspan="4">Видимых площадных областей нет</td></tr>';
  const shapeArea = rings.reduce((sum, ring) => sum + polygonArea(ring), 0);
  $('polygon-stats').innerHTML = `<div class="compare-table"><div><small>Внешние контуры</small><strong>${rings.filter((r) => polygonArea(r) > 0).length}</strong></div><div><small>Внутренние отверстия</small><strong>${rings.filter((r) => polygonArea(r) < 0).length}</strong></div><div><small>Площадь пересечения</small><strong>${nfmt(shapeArea, 4)}</strong></div></div>`;
}
function runComparison() {
  if (app.mode === 'convex') {
    const ops = newOps();
    let visible = 0;
    for (const segment of app.segments) if (clipCyrusBeck(...segment, app.convexClip, ops, app.convexSign)) visible++;
    $('compare-results').innerHTML = `<div class="compare-table"><div><small>Сайрус–Бек · ${app.convexClip.length} рёбер</small><strong>${nfmt(ops.mul,0)} × / ${nfmt(ops.div,0)} ÷</strong><span>Видимых: ${visible}</span></div></div>`;
    return;
  }
  if (app.mode === 'stress') {
    if (!app.stressReady) { showError('Сначала создайте набор отрезков.'); return; }
    const b = localWindow(app.currentShift);
    app.worker?.postMessage({ kind: 'compare', bounds: b,
      motionTime: app.animation ? performance.now() : null,
      motionAmplitude: app.animation && $('independent-motion').checked ? 3 : 0 });
    return;
  }
  const a = newOps(), b = newOps();
  let disagreements = 0;
  for (const s of app.segments) {
    const x = clipCohen(...s, app.window, a), y = clipLiang(...s, app.window, b);
    if (!equivalentSegments(x, y)) disagreements++;
  }
  showComparison({ cohen: a, liang: b, mismatch: disagreements, fastRejected: 0 }, app.segments.length);
}
function showComparison(result, count, target = 'compare-results') {
  const { cohen, liang, mismatch, fastRejected } = result;
  $(target).innerHTML = `<div class="compare-table"><div><small>Коэн–Сазерленд</small><strong>${nfmt(cohen.mul, 0)} × / ${nfmt(cohen.div, 0)} ÷</strong><span>Умножения / деления</span></div><div><small>Лианг–Барски</small><strong>${nfmt(liang.mul, 0)} × / ${nfmt(liang.div, 0)} ÷</strong><span>Умножения / деления</span></div><div><small>Расхождений</small><strong class="${mismatch ? 'note-error' : 'note-good'}">${nfmt(mismatch, 0)}</strong><span>Проверено: ${nfmt(count, 0)}, AABB: ${nfmt(fastRejected, 0)}</span></div></div>`;
}
function applyWindow() {
  try { app.window = valuesOfWindow(); clearError(); recomputeSmall(); } catch (e) { showError(e); }
}
function showMode() {
  app.mode = $('mode').value;
  $('segment-controls').hidden = app.mode !== 'segments' && app.mode !== 'convex';
  $('convex-controls').hidden = app.mode !== 'convex';
  $('rectangle-controls').hidden = app.mode === 'convex';
  $('algorithm-field').hidden = app.mode === 'convex';
  $('polygon-controls').hidden = app.mode !== 'polygons';
  $('stress-controls').hidden = app.mode !== 'stress';
  $('segment-details').hidden = app.mode !== 'segments' && app.mode !== 'convex';
  $('polygon-details').hidden = app.mode !== 'polygons';
  $('stress-details').hidden = app.mode !== 'stress';
  app.animation = app.mode === 'stress' && $('animate-stress').checked;
  if (app.mode === 'stress') {
    app.camera.scale = 5; app.camera.x = 0; app.camera.y = 0;
    $('stat-total').textContent = nfmt(app.stressCount, 0);
    $('stat-total-label').textContent = 'Всего отрезков';
    $('stat-visible').textContent = '—'; $('stat-work').textContent = '—';
    setStageMessage(app.stressReady ? 'Quadtree' : 'Создайте набор данных');
    requestStressQuery();
  } else { app.camera.scale = 14; app.camera.x = 0; app.camera.y = 0; recomputeSmall(); }
  updateZoom(); queuePaint();
}
function updateZoom() { $('zoom-value').textContent = `${nfmt(app.camera.scale / (app.mode === 'stress' ? 5 : 14) * 100, 0)} %`; }
function scaleAt(factor, x = app.width / 2, y = app.height / 2) {
  const anchor = toWorld(x, y);
  app.camera.scale = Math.min(260, Math.max(.16, app.camera.scale * factor));
  app.camera.x = anchor.x - (x - app.width / 2) / app.camera.scale;
  app.camera.y = anchor.y + (y - app.height / 2) / app.camera.scale;
  updateZoom(); queuePaint();
}
function resetCamera() {
  const vertices = (app.mode === 'segments' || app.mode === 'convex') ? app.segments.flatMap(([a, b, c, d]) => [[a, b], [c, d]]) :
    app.mode === 'polygons' ? app.polygon.flat().map((p) => [p.x, p.y]) : [];
  if (app.mode === 'convex') for (const p of app.convexClip) vertices.push([p.x, p.y]);
  else vertices.push([app.window.xmin, app.window.ymin], [app.window.xmax, app.window.ymax]);
  const xs = vertices.map((v) => v[0]), ys = vertices.map((v) => v[1]);
  const width = Math.max(10, Math.max(...xs) - Math.min(...xs));
  const height = Math.max(10, Math.max(...ys) - Math.min(...ys));
  app.camera.x = (Math.max(...xs) + Math.min(...xs)) / 2;
  app.camera.y = (Math.max(...ys) + Math.min(...ys)) / 2;
  app.camera.scale = Math.min(app.width * .86 / width, app.height * .84 / height, 70);
  if (app.mode === 'stress') app.camera.scale = 5;
  updateZoom(); queuePaint();
}
function pointerLocation(event) {
  const b = canvas.getBoundingClientRect();
  return { x: event.clientX - b.left, y: event.clientY - b.top };
}
function nearPixels(p, q, radius) { return Math.hypot(p.x - q.x, p.y - q.y) <= radius; }
function pixelDistanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 <= 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function hitTarget(p) {
  const r = app.window;
  if (app.mode === 'convex') for (let i = 0; i < app.convexClip.length; i++) {
    if (nearPixels(p, toScreen(app.convexClip[i].x, app.convexClip[i].y), 10)) return { kind: 'convex-vertex', i };
  }
  if (app.mode !== 'convex') for (const [name, x, y] of [['lb',r.xmin,r.ymin],['lt',r.xmin,r.ymax],['rb',r.xmax,r.ymin],['rt',r.xmax,r.ymax]]) {
    if (nearPixels(p, toScreen(x, y), 10)) return { kind: 'corner', corner: name };
  }
  if (app.mode === 'segments' || app.mode === 'convex') for (let i = 0; i < app.segments.length; i++) for (const k of [0, 2]) {
    const s = app.segments[i];
    if (nearPixels(p, toScreen(s[k], s[k + 1]), 9)) return { kind: 'endpoint', i, k };
  }
  if (app.mode === 'segments' || app.mode === 'convex') for (let i = app.segments.length - 1; i >= 0; i--) {
    const s = app.segments[i];
    if (pixelDistanceToSegment(p, toScreen(s[0], s[1]), toScreen(s[2], s[3])) <= 5) return { kind: 'move-segment', i };
  }
  const w = toWorld(p.x, p.y);
  if (app.mode === 'convex' && insideEvenOdd(w, [app.convexClip])) return { kind: 'move-clip' };
  if (app.mode !== 'convex' && w.x >= r.xmin && w.x <= r.xmax && w.y >= r.ymin && w.y <= r.ymax) return { kind: 'move-window' };
  return { kind: 'pan' };
}
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const p = pointerLocation(event);
  app.pointer = { ...hitTarget(p), first: p, previous: p };
  canvas.setPointerCapture(event.pointerId);
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', (event) => {
  const p = pointerLocation(event);
  const w = toWorld(p.x, p.y);
  $('cursor-coordinates').textContent = `(${coord(w.x)}; ${coord(w.y)})`;
  if (!app.pointer) return;
  const previousWorld = toWorld(app.pointer.previous.x, app.pointer.previous.y);
  const dx = w.x - previousWorld.x, dy = w.y - previousWorld.y;
  const target = app.pointer;
  if (target.kind === 'pan') {
    app.camera.x -= dx; app.camera.y -= dy;
  } else if (target.kind === 'move-clip' || target.kind === 'convex-vertex') {
    const proposed = app.convexClip.map(v => ({ ...v }));
    if (target.kind === 'move-clip') for (const v of proposed) { v.x += dx; v.y += dy; }
    else proposed[target.i] = {x:w.x,y:w.y};
    try { const sign = convexOrientation(proposed); app.convexClip = proposed; app.convexSign = sign; writeConvexRows(); } catch (_) {}
  } else if (target.kind === 'move-window') {
    for (const key of ['xmin', 'xmax']) app.window[key] += dx;
    for (const key of ['ymin', 'ymax']) app.window[key] += dy;
    syncWindow();
  } else if (target.kind === 'corner') {
    const keyX = target.corner.includes('l') ? 'xmin' : 'xmax';
    const keyY = target.corner.includes('b') ? 'ymin' : 'ymax';
    const proposedX = w.x, proposedY = w.y;
    if (keyX === 'xmin') app.window.xmin = Math.min(proposedX, app.window.xmax - EPS * 4);
    else app.window.xmax = Math.max(proposedX, app.window.xmin + EPS * 4);
    if (keyY === 'ymin') app.window.ymin = Math.min(proposedY, app.window.ymax - EPS * 4);
    else app.window.ymax = Math.max(proposedY, app.window.ymin + EPS * 4);
    syncWindow();
  } else if (target.kind === 'move-segment') {
    const s = app.segments[target.i];
    s[0] += dx; s[1] += dy; s[2] += dx; s[3] += dy;
    writeSegmentRows();
  } else if (target.kind === 'endpoint') {
    app.segments[target.i][target.k] = w.x;
    app.segments[target.i][target.k + 1] = w.y;
    writeSegmentRows();
  }
  target.previous = p;
  if (target.kind === 'pan') queuePaint(); else recomputeSmall();
});
function endPointer() { app.pointer = null; canvas.style.cursor = 'crosshair'; }
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (event) => { event.preventDefault(); const p = pointerLocation(event); scaleAt(event.deltaY > 0 ? .88 : 1.13, p.x, p.y); }, { passive: false });

function makeWorker() {
  const url = URL.createObjectURL(new Blob([INLINE_WORKER_SOURCE], { type: 'text/javascript' }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}
function localWindow(shift = { x: 0, y: 0 }) {
  const r = app.window;
  return [r.xmin - shift.x, r.ymin - shift.y, r.xmax - shift.x, r.ymax - shift.y];
}
function createStressData() {
  clearError();
  if (app.worker) app.worker.terminate();
  app.worker = makeWorker();
  app.stressReady = false;
  app.stressResult = null;
  if (app.gpu) app.gpu.upload(new Float32Array(0));
  app.queryPending = false;
  app.queryDirty = false;
  app.stressCount = Number($('stress-count').value);
  const depth = Number($('tree-depth').value), density = Number($('stress-density').value);
  $('stress-summary').textContent = `Формируем ${nfmt(app.stressCount, 0)} отрезков и индекс...`;
  $('build-tree').disabled = true;
  app.worker.onmessage = (event) => {
    const message = event.data;
    if (message.kind === 'ready') {
      app.stressReady = true; app.stressNodes = message.nodes;
      app.stressBuildMs = message.buildMs;
      $('build-tree').disabled = false;
      $('stress-summary').textContent = `${nfmt(message.count, 0)} отрезков · ${nfmt(message.nodes, 0)} узлов · построение ${nfmt(message.buildMs, 0)} мс · генерация ${nfmt(message.generatedMs, 0)} мс`;
      $('stat-total').textContent = nfmt(app.stressCount, 0);
      setStageMessage(depth ? `Quadtree · глубина ${depth}` : 'Полный перебор');
      requestStressQuery();
    } else if (message.kind === 'queryResult') {
      app.queryPending = false;
      if (app.mode !== 'stress' || message.id !== app.queryCounter) return;
      app.stressResult = message.result;
      if (app.gpu) app.gpu.upload(message.result.output);
      if (!app.animation) app.currentShift = {x:0,y:0};
      $('stat-total').textContent = nfmt(app.stressCount, 0);
      $('stat-visible').textContent = nfmt(message.result.visible, 0);
      $('stat-work').textContent = `${nfmt(message.ms, 2)} мс`;
      $('tree-nodes-visited').textContent = nfmt(message.result.treeNodesVisited, 0);
      $('tree-candidates').textContent = nfmt(message.result.candidates, 0);
      $('tree-rejected').textContent = nfmt(message.result.prefiltered, 0);
      $('tree-rendered').textContent = nfmt(message.result.stored, 0);
      $('stat-work-hint').textContent = 'Вычисление в Web Worker';
      if (app.animation) {
        const now = performance.now();
        if (app.lastResultTime) app.frameTimes.push(now - app.lastResultTime);
        if (app.frameTimes.length > 40) app.frameTimes.shift();
        app.lastResultTime = now;
        if (app.frameTimes.length) {
          const mean = app.frameTimes.reduce((a, b) => a + b, 0) / app.frameTimes.length;
          $('query-fps-label').textContent = `Точное отсечение ${nfmt(1000 / mean, 1)} Гц`;
        }
      }
      queuePaint();
      if (app.queryDirty) { app.queryDirty = false; requestStressQuery(); }
    } else if (message.kind === 'comparison') {
      const result = message.result;
      showComparison(result, app.stressCount, 'stress-compare-results');
    } else if (message.kind === 'error') { $('build-tree').disabled = false; showError(message.message); }
  };
  app.worker.onerror = (event) => { $('build-tree').disabled = false; showError(event.message); };
  app.worker.postMessage({ kind: 'init', count: app.stressCount, depth, density });
}
function requestStressQuery() {
  if (app.mode !== 'stress' || !app.stressReady || !app.worker) return;
  if (app.queryPending) { app.queryDirty = true; return; }
  app.queryPending = true;
  const shift = app.animation ? { ...app.currentShift } : { x: 0, y: 0 };
  app.requestShift = shift;
  app.worker.postMessage({ kind: 'query', id: ++app.queryCounter, bounds: localWindow(shift), algorithm: app.algorithm,
    motionTime: app.animation ? performance.now() : null,
    motionAmplitude: app.animation && $('independent-motion').checked ? 3 : 0 });
}
function animationFrame() {
  if (app.animation && app.mode === 'stress' && app.stressReady) {
    const now = performance.now();
    app.currentShift = { x: 23 * Math.sin(now * .0005), y: 17 * Math.cos(now * .00065) };
    requestStressQuery();
    queuePaint();
  }
  requestAnimationFrame(animationFrame);
}
function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 400);
}
function chartSvg(rows, metric, title) {
  const W = 580, H = 275, L = 72, R = 17, T = 18, B = 48;
  const innerW = W - L - R, innerH = H - T - B;
  const values = rows.map((row) => row[metric]);
  const maxY = Math.max(0.000001, ...values) * 1.12;
  const depths = [...new Set(rows.map((r) => r.depth))].sort((a, b) => a - b);
  const x = (depth) => L + innerW * depths.indexOf(depth) / Math.max(1, depths.length - 1);
  const y = (v) => T + innerH * (1 - v / maxY);
  const colors = ['#2863bd', '#13996f', '#c08735', '#9a57a5'];
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}" xmlns="http://www.w3.org/2000/svg">`;
  for (let k = 0; k <= 4; k++) {
    const value = maxY * k / 4;
    const Y = y(value);
    svg += `<line x1="${L}" y1="${Y}" x2="${W - R}" y2="${Y}" stroke="#ebeff4"/><text x="${L - 8}" y="${Y + 4}" text-anchor="end" font-size="11" fill="#718097">${nfmt(value, metric === 'meanCandidates' ? 0 : 2)}</text>`;
  }
  for (const depth of depths) svg += `<text x="${x(depth)}" y="${H - B + 19}" text-anchor="middle" font-size="12" fill="#718097">${depth}</text>`;
  svg += `<text x="${W / 2}" y="${H - 5}" text-anchor="middle" font-size="11" fill="#647287">Глубина дерева (0 = полный перебор)</text>`;
  const densities = [...new Set(rows.map((r) => r.density))].sort((a, b) => a - b);
  densities.forEach((density, index) => {
    const series = rows.filter((row) => row.density === density).sort((a, b) => a.depth - b.depth);
    const pts = series.map((r) => `${x(r.depth)},${y(r[metric])}`).join(' ');
    svg += `<polyline fill="none" stroke="${colors[index]}" stroke-width="2.5" points="${pts}"/>`;
    for (const point of series) svg += `<circle r="4" fill="${colors[index]}" cx="${x(point.depth)}" cy="${y(point[metric])}"><title>${density}×, глубина ${point.depth}: ${nfmt(point[metric], 3)}</title></circle>`;
  });
  svg += '</svg><div class="chart-legend">' + densities.map((density, i) => `<span><i style="background:${colors[i]}"></i> Плотность ${density}×</span>`).join('') + '</div>';
  return svg;
}
function showBenchmark(result) {
  app.benchmark = result;
  $('benchmark-empty').hidden = true;
  $('benchmark-content').hidden = false;
  $('chart-depth').innerHTML = chartSvg(result.results, 'medianMs', 'Время отсечения');
  $('chart-candidates').innerHTML = chartSvg(result.results, 'meanCandidates', 'Число кандидатов');
  $('benchmark-table').innerHTML = result.results.map((row) => `<tr><td>${row.density}×</td><td>${row.depth}</td><td>${nfmt(row.buildMs, 2)}</td><td>${nfmt(row.medianMs, 3)}</td><td>${nfmt(row.p95Ms, 3)}</td><td>${nfmt(row.meanCandidates, 0)}</td><td>${nfmt(row.nodes, 0)}</td></tr>`).join('');
}
function startBenchmark() {
  if (app.benchmarkBusy) return;
  app.benchmarkBusy = true;
  $('run-benchmark').disabled = true;
  $('benchmark-progress').hidden = false;
  const worker = makeWorker();
  app.benchWorker = worker;
  worker.onmessage = ({ data: message }) => {
    if (message.kind === 'progress') {
      const { done, total, density, depth } = message.info;
      $('benchmark-progress-value').textContent = `${Math.round(done * 100 / total)}%`;
      $('benchmark-progress-fill').style.width = `${done * 100 / total}%`;
      $('benchmark-progress-text').textContent = `Плотность ${density}×, глубина ${depth} · ${done}/${total}`;
    } else if (message.kind === 'benchmarkResult') {
      app.benchmarkBusy = false;
      $('run-benchmark').disabled = false;
      $('benchmark-progress').hidden = true;
      showBenchmark(message.result);
      worker.terminate();
    } else if (message.kind === 'error') {
      app.benchmarkBusy = false;
      $('run-benchmark').disabled = false;
      $('benchmark-progress-text').textContent = message.message;
      worker.terminate();
    }
  };
  worker.onerror = (e) => { app.benchmarkBusy = false; $('run-benchmark').disabled = false; $('benchmark-progress-text').textContent = e.message; worker.terminate(); };
  worker.postMessage({ kind: 'benchmark', options: { count: 500000, depths: [0, 4, 6, 8], densities: [0.6, 1, 3], samples: 16, seed: 2026 } });
}
function checks() {
  const tests = [];
  const sampleRect = rect(-5, -5, 5, 5);
  const assert = (name, predicate) => { try { tests.push({ name, ok: !!predicate() }); } catch (e) { tests.push({ name, ok: false, error: e.message }); } };
  const eq = (a, b) => equivalentSegments(a, b);
  assert('Отрезок на верхней границе окна', () => eq(clipCohen(-5,5,5,5,sampleRect), [-5,5,5,5]) && eq(clipLiang(-5,5,5,5,sampleRect), [-5,5,5,5]));
  assert('Отрезок на вертикальной границе', () => eq(clipCohen(5,-5,5,5,sampleRect), [5,-5,5,5]));
  assert('Нулевая длина точно в вершине окна', () => eq(clipCohen(-5,-5,-5,-5,sampleRect), [-5,-5,-5,-5]) && eq(clipLiang(-5,-5,-5,-5,sampleRect), [-5,-5,-5,-5]));
  assert('Параллельный отрезок вне окна', () => clipCohen(-6,6,6,6,sampleRect) === null && clipLiang(-6,6,6,6,sampleRect) === null);
  assert('Пересечение диагонали в двух вершинах окна', () => eq(clipCohen(-9,-9,9,9,sampleRect), [-5,-5,5,5]) && eq(clipLiang(-9,-9,9,9,sampleRect), [-5,-5,5,5]));
  assert('AABB: исключение без точного отсечения', () => aabbMask(-10,6,10,7,sampleRect) !== 0);
  assert('ε-проверка при расхождении на половину ε', () => near(5,5+EPS/2) && outcode(5+EPS/2,0,sampleRect) === 0);
  assert('Вогнутый полигон распадается на две части', () => clipPolygon(parseRings(polyPresets.split), rectangleRing(sampleRect)).length === 2);
  assert('Вложенный контур создаёт отверстие', () => clipPolygon(parseRings(polyPresets.hole), rectangleRing(sampleRect)).some((r) => polygonArea(r) < 0));
  assert('Самопересечение разрешается в несколько контуров', () => clipPolygon(parseRings(polyPresets.bowtie), rectangleRing(sampleRect)).length === 2);
  assert('Рёбра через вершины отсекателя', () => clipPolygon([rectangleRing(sampleRect)], rectangleRing(sampleRect)).length === 1);
  assert('Вариант 10: Сайрус–Бек для выпуклого ромба', () => {
    const diamond = parseRings(convexPresets.diamond)[0];
    return equivalentSegments(clipCyrusBeck(-20, 0, 20, 0, diamond), [-14,0,14,0]);
  });
  assert('Сайрус–Бек принимает оба направления обхода', () => {
    const diamond = parseRings(convexPresets.diamond)[0];
    return equivalentSegments(clipCyrusBeck(-20, 0, 20, 0, [...diamond].reverse()), [-14,0,14,0]);
  });
  assert('Сайрус–Бек отклоняет невыпуклый отсекатель', () => {
    try { convexOrientation(parseRings('0 0\n5 0\n2 2\n5 5\n0 5')[0]); return false; }
    catch (_) { return true; }
  });
  assert('Тонкий полигон не исчезает (ширина 10⁻⁶)', () => {
    const w = 1e-6;
    const ring = [{x:0,y:-3},{x:w,y:-3},{x:w,y:3},{x:0,y:3}];
    const result = clipPolygon([ring],rectangleRing(sampleRect));
    return result.length === 1 && near(result.reduce((a,b)=>a+polygonArea(b),0),6e-6,1e-9);
  });
  assert('Алгоритмы согласованы в ε-окрестности границы', () => {
    const line = [5.00000005,0,5.000001,-5];
    return equivalentSegments(clipCohen(...line,sampleRect),clipLiang(...line,sampleRect));
  });
  assert('Координаты данных хранятся в Float64Array', () => makeDataset(10) instanceof Float64Array);
  assert('Quadtree при независимом движении совпадает с полным перебором', () => {
    const data = makeDataset(3500, 3, 55);
    const tree = new Quadtree(data, DATA_BOUNDS, {maxDepth:6});
    const options = {motionTime:123456,motionAmplitude:3,maxVisible:0};
    return scanSegments(data,sampleRect,'cohen',{tree,...options}).visible ===
      scanSegments(data,sampleRect,'cohen',options).visible;
  });
  assert('Quadtree эквивалентен полному перебору', () => {
    const data = makeDataset(3500, 1, 44);
    const tree = new Quadtree(data, DATA_BOUNDS, { maxDepth: 6 });
    return scanSegments(data, sampleRect, 'liang', { tree }).visible === scanSegments(data, sampleRect, 'liang').visible;
  });
  assert('Коэн и Лианг дают одинаковое число видимых', () => compareAlgorithms(makeDataset(3500,1,11), sampleRect).mismatch === 0);
  $('check-results').innerHTML = tests.map((test) => `<div class="check-item ${test.ok ? '' : 'fail'}"><span>${test.name}${test.error ? ': ' + test.error : ''}</span><strong>${test.ok ? 'ПРОЙДЕНО' : 'ОШИБКА'}</strong></div>`).join('');
  const passed = tests.filter((t) => t.ok).length;
  $('check-summary').textContent = `Выполнено ${tests.length} проверок · успешно ${passed} · ошибок ${tests.length - passed}.`;
}
function wire() {
  $all('.nav-item').forEach((button) => button.addEventListener('click', () => {
    const name = button.dataset.tab;
    $all('.nav-item').forEach((item) => item.classList.toggle('active', item === button));
    $all('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === `panel-${name}`));
    if (name === 'demo') { frameCanvas(); requestStressQuery(); }
  }));
  $('mode').addEventListener('change', showMode);
  $('algorithm').addEventListener('change', () => { app.algorithm = $('algorithm').value; recomputeSmall(); });
  $all('[data-line-preset]').forEach((button) => button.addEventListener('click', () => {
    app.segments = linePresets[button.dataset.linePreset].map((s) => [...s]); writeSegmentRows(); clearError(); recomputeSmall();
  }));
  $all('[data-convex-preset]').forEach((button) => button.addEventListener('click', () => {
    const clip = parseRings(convexPresets[button.dataset.convexPreset])[0];
    app.convexSign = convexOrientation(clip); app.convexClip = clip; writeConvexRows(); clearError(); recomputeSmall();
  }));
  $('apply-convex').addEventListener('click', () => {
    try {
      const rings = parseRings($('convex-input').value);
      if (rings.length !== 1) throw new Error('У выпуклого отсекателя должен быть один замкнутый контур.');
      const sign = convexOrientation(rings[0]);
      app.convexClip = rings[0]; app.convexSign = sign; clearError(); recomputeSmall();
    } catch (e) { showError(e); }
  });
  $all('[data-poly-preset]').forEach((button) => button.addEventListener('click', () => {
    $('polygon-input').value = polyPresets[button.dataset.polyPreset];
    app.polygon = parseRings($('polygon-input').value); clearError(); recomputeSmall();
  }));
  $('apply-segments').addEventListener('click', () => {
    try { app.segments = parseSegmentRows($('segments-input').value); clearError(); recomputeSmall(); }
    catch (e) { showError(e); }
  });
  $('apply-polygon').addEventListener('click', () => {
    try { app.polygon = parseRings($('polygon-input').value); clearError(); recomputeSmall(); }
    catch (e) { showError(e); }
  });
  $('file-input').addEventListener('change', async (event) => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const parsed = parseSegments(await file.text());
      if (parsed.segments.length > 30000) throw new Error('Для визуального ручного режима файл должен содержать не более 30 000 отрезков; для 500 000 используйте потоковый режим.');
      app.segments = parsed.segments; app.window = parsed.window;
      $('mode').value = 'segments'; showMode(); syncWindow(); writeSegmentRows(); clearError(); resetCamera(); recomputeSmall();
    } catch (e) { showError(e); } finally { event.target.value = ''; }
  });
  $('export-txt').addEventListener('click', () => downloadText('segments_lab5.txt', serializeSegments(app.segments, app.window)));
  $('export-png').addEventListener('click', () => {
    if (app.mode === 'stress' && app.gpu) app.gpu.draw(app.camera, app.width, app.height, app.pixelRatio, app.window, app.currentShift);
    const image = document.createElement('canvas');
    image.width = canvas.width; image.height = canvas.height;
    const layer = image.getContext('2d');
    layer.fillStyle = '#ffffff'; layer.fillRect(0, 0, image.width, image.height);
    if (app.mode === 'stress') layer.drawImage(stressCanvas, 0, 0);
    layer.drawImage(canvas, 0, 0);
    image.toBlob((blob) => {
    if (!blob) return; const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'cliplab_view.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 400);
    });
  });
  $('apply-window').addEventListener('click', applyWindow);
  ['xmin', 'ymin', 'xmax', 'ymax'].forEach((id) => $(id).addEventListener('keydown', (event) => { if (event.key === 'Enter') applyWindow(); }));
  $('zoom-in').addEventListener('click', () => scaleAt(1.25));
  $('zoom-out').addEventListener('click', () => scaleAt(.8));
  $('reset-camera').addEventListener('click', resetCamera);
  ['show-grid', 'show-axes', 'show-original'].forEach((id) => $(id).addEventListener('change', queuePaint));
  $('compare').addEventListener('click', runComparison);
  $('build-tree').addEventListener('click', createStressData);
  $('stress-compare').addEventListener('click', runComparison);
  $('animate-stress').addEventListener('change', () => {
    app.animation = $('animate-stress').checked;
    app.frameTimes = []; app.lastResultTime = 0; app.renderFrameTimes = []; app.lastPaintAt = 0;
    $('fps-label').textContent = app.animation ? 'Рендер: измерение...' : '— FPS';
    $('query-fps-label').textContent = 'Точное отсечение: —';
    if (!app.animation) { app.currentShift = { x:0,y:0 }; requestStressQuery(); queuePaint(); }
  });
  $('independent-motion').addEventListener('change', requestStressQuery);
  $('run-benchmark').addEventListener('click', startBenchmark);
  $('export-json').addEventListener('click', () => { if (app.benchmark) downloadText('lab5-benchmark.json', JSON.stringify(app.benchmark, null, 2), 'application/json'); });
  $('export-csv').addEventListener('click', () => {
    if (!app.benchmark) return;
    const fields = ['count', 'density', 'depth', 'buildMs', 'medianMs', 'p95Ms', 'meanCandidates', 'meanVisible', 'nodes', 'samples'];
    downloadText('lab5-benchmark.csv', [fields.join(','), ...app.benchmark.results.map((r) => fields.map((f) => r[f]).join(','))].join('\n'), 'text/csv');
  });
  $('run-checks').addEventListener('click', checks);
  new ResizeObserver(frameCanvas).observe($('geometry-viewport'));
}
app.convexSign = convexOrientation(app.convexClip);
writeConvexRows();
writeSegmentRows();
$('polygon-input').value = polyPresets.concave;
wire();
recomputeSmall();
frameCanvas();
requestAnimationFrame(animationFrame);
