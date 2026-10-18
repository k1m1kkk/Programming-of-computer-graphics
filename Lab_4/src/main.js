import { ALGORITHMS } from './RasterEngine.js';
import { VirtualGrid } from './VirtualGrid.js';
import { GridPainter } from './GridPainter.js';
import { runChecks } from './checks.js';
import { runBenchmark } from './Benchmark.js';

const $ = (id) => document.getElementById(id);
let grid = new VirtualGrid(81, 61);
let requestedCell = 18;
const painter = new GridPainter($('grid-canvas'), grid);
let trace = [];
let currentStep = 0;
let results = null;
let worker = null;
let fallbackActive = false;
let sunMode = false;
const maxTrace = 10000;
const lineKeys = ['x0', 'y0', 'x1', 'y1'];
const colors = { step: '#64748b', dda: '#ea8e46', bresenham: '#2563db', wu: '#2c9f91', castle: '#a16cd6', circle: '#2563db' };
const labels = { step: 'Пошаговый', dda: 'ЦДА', bresenham: 'Брезенхем', wu: 'Ву', castle: 'Кастл–Питвей', circle: 'Окружность' };

function selectTab(tab) {
  for (const item of document.querySelectorAll('.panel')) item.classList.toggle('active', item.id === `panel-${tab}`);
  for (const item of document.querySelectorAll('.nav-item')) {
    const active = item.dataset.tab === tab;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', String(active));
  }
}
for (const item of document.querySelectorAll('.nav-item')) item.addEventListener('click', () => selectTab(item.dataset.tab));

function number(id) {
  const str = $(id).value.trim();
  const n = Number(str);
  if (str === '' || !Number.isSafeInteger(n) || Math.abs(n) > 250) throw new Error(`${id}: введите целое число от −250 до 250.`);
  return n;
}

function readArguments() {
  const algorithm = ALGORITHMS[$('algorithm').value];
  if (algorithm.kind === 'line') return [number('x0'), number('y0'), number('x1'), number('y1')];
  const cx = number('cx');
  const cy = number('cy');
  if (algorithm.kind === 'circle') {
    const radius = number('radius');
    if (radius < 0) throw new Error('Радиус не может быть отрицательным.');
    return [cx, cy, radius];
  }
  if (algorithm.kind === 'ellipse') {
    const rx = number('rx');
    const ry = number('ry');
    if (rx < 0 || ry < 0) throw new Error('Полуоси не могут быть отрицательными.');
    return [cx, cy, rx, ry, $('arc').value];
  }
  if (algorithm.kind === 'parabola') {
    const extent = number('parabola-extent');
    const scale = number('parabola-scale');
    if (extent < 0 || scale <= 0) throw new Error('Для параболы полуширина ≥ 0 и параметр p > 0.');
    if (extent * extent > 250 * scale) throw new Error('Высота параболы превышает 250: увеличьте p или уменьшите полуширину.');
    return [cx, cy, extent, scale, $('parabola-direction').value];
  }
  if (algorithm.kind === 'hyperbola') {
    const a = number('hyperbola-a');
    const b = number('hyperbola-b');
    const height = number('hyperbola-height');
    if (a <= 0 || b <= 0 || height < 0) throw new Error('Для гиперболы a и b > 0, высота ≥ 0.');
    if (a * a * (b * b + height * height) > 250 * 250 * b * b) throw new Error('Ширина гиперболы превышает 250: измените полуоси или высоту.');
    return [cx, cy, a, b, height, $('hyperbola-branches').value];
  }
  throw new Error('Неизвестный алгоритм.');
}

function updateStats() {
  $('stat-pixels').textContent = grid.touched.toLocaleString('ru-RU');
  $('stat-calls').textContent = grid.calls.toLocaleString('ru-RU');
  $('stat-clipped').textContent = grid.clipped.toLocaleString('ru-RU');
  $('step-counter').textContent = `${currentStep.toLocaleString('ru-RU')} / ${trace.length.toLocaleString('ru-RU')}`;
  $('step-range').max = String(trace.length);
  $('step-range').value = String(currentStep);
}

function displayTrace() {
  const output = $('trace-body');
  output.replaceChildren();
  const start = Math.max(0, currentStep - 9);
  const slice = trace.slice(start, currentStep);
  if (!slice.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'Выберите шаг, чтобы увидеть вызовы SetPixel.';
    row.append(cell);
    output.append(row);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < slice.length; i++) {
    const point = slice[i];
    const row = document.createElement('tr');
    const items = [String(start + i + 1), String(point.x), String(point.y), point.intensity.toFixed(4), point.clipped ? 'Вне поля' : 'Записан'];
    for (const item of items) {
      const cell = document.createElement('td');
      cell.textContent = item;
      row.append(cell);
    }
    fragment.append(row);
  }
  output.append(fragment);
}

function centerViewport() {
  const element = $('viewport');
  element.scrollLeft = Math.max(0, (painter.canvas.width - element.clientWidth) / 2);
  element.scrollTop = Math.max(0, (painter.canvas.height - element.clientHeight) / 2);
}

function replay(step, recenter = false) {
  currentStep = Math.min(trace.length, Math.max(0, step));
  grid.Clear();
  for (let i = 0; i < currentStep; i++) {
    const p = trace[i];
    grid.SetPixel(p.x, p.y, p.intensity);
  }
  painter.Paint();
  if (recenter) centerViewport();
  updateStats();
  displayTrace();
}

function configureGrid(kind, args) {
  let xMin; let xMax; let yMin; let yMax;
  if (kind === 'line') {
    [xMin, xMax] = [Math.min(args[0], args[2]), Math.max(args[0], args[2])];
    [yMin, yMax] = [Math.min(args[1], args[3]), Math.max(args[1], args[3])];
    if (sunMode) { xMin = -20; xMax = 20; yMin = -20; yMax = 20; }
  } else if (kind === 'circle' || kind === 'ellipse') {
    const rx = args[2];
    const ry = kind === 'circle' ? rx : args[3];
    [xMin, xMax] = [args[0] - rx, args[0] + rx];
    [yMin, yMax] = [args[1] - ry, args[1] + ry];
  } else if (kind === 'parabola') {
    const [cx, cy, extent, scale, direction] = args;
    const extentY = Math.ceil(extent * extent / scale) + 1;
    [xMin, xMax] = [cx - extent, cx + extent];
    [yMin, yMax] = direction === 'up' ? [cy, cy + extentY] : [cy - extentY, cy];
  } else {
    const [cx, cy, a, b, height, branches] = args;
    const xBound = Math.ceil(a * Math.sqrt(1 + (height / b) ** 2)) + 2;
    [xMin, xMax] = branches === 'right' ? [cx + a, cx + xBound] : branches === 'left' ? [cx - xBound, cx - a] : [cx - xBound, cx + xBound];
    [yMin, yMax] = [cy - height, cy + height];
  }
  const minX = Math.min(-40, xMin - 8);
  const minY = Math.min(-30, yMin - 8);
  const maxX = Math.max(40, xMax + 8);
  const maxY = Math.max(30, yMax + 8);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  if (grid.width !== width || grid.height !== height || grid.minX !== minX || grid.minY !== minY) {
    grid = new VirtualGrid(width, height, minX, minY);
    painter.grid = grid;
  }
  const maxCell = Math.max(3, Math.min(36, Math.floor(3900 / Math.max(width, height))));
  painter.cell = Math.min(requestedCell, maxCell);
  $('zoom-value').textContent = painter.cell === requestedCell ? `${painter.cell} px` : `${painter.cell} px (лимит)`;
  $('grid-dimensions').textContent = `${width} × ${height} ячеек`;
}

function render() {
  try {
    const key = $('algorithm').value;
    const args = readArguments();
    configureGrid(ALGORITHMS[key].kind, args);
    grid.Clear();
    $('form-error').hidden = true;
    trace = [];
    let overflow = false;
    const sink = {
      SetPixel(x, y, intensity) {
        grid.SetPixel(x, y, intensity);
        if (trace.length < maxTrace) trace.push({ x, y, intensity, clipped: x < grid.minX || x >= grid.minX + grid.width || y < grid.minY || y >= grid.minY + grid.height });
        else overflow = true;
      },
    };
    if (sunMode && ALGORITHMS[key].kind === 'line') {
      for (const [x, y] of [[20, 9], [9, 20], [-9, 20], [-20, 9], [-20, -9], [-9, -20], [9, -20], [20, -9]]) {
        ALGORITHMS[key].fn(sink, 0, 0, x, y);
      }
    } else {
      ALGORITHMS[key].fn(sink, ...args);
    }
    replay(trace.length, true);
    if (overflow) {
      $('form-error').textContent = `Трассировка ограничена ${maxTrace} вызовами; уменьшите параметры фигуры.`;
      $('form-error').hidden = false;
    }
  } catch (error) {
    $('form-error').textContent = error.message;
    $('form-error').hidden = false;
  }
}

function toggleKind() {
  const kind = ALGORITHMS[$('algorithm').value].kind;
  $('line-fields').hidden = kind !== 'line';
  $('curve-fields').hidden = kind === 'line';
  $('radius-field').hidden = kind !== 'circle';
  $('ellipse-fields').hidden = kind !== 'ellipse';
  $('parabola-fields').hidden = kind !== 'parabola';
  $('hyperbola-fields').hidden = kind !== 'hyperbola';
  render();
}
$('algorithm').addEventListener('change', () => { sunMode = false; toggleKind(); });
$('render').addEventListener('click', render);
$('swap').addEventListener('click', () => {
  sunMode = false;
  for (const [a, b] of [['x0', 'x1'], ['y0', 'y1']]) [$(a).value, $(b).value] = [$(b).value, $(a).value];
  render();
});
for (const id of [...lineKeys, 'cx', 'cy', 'radius', 'rx', 'ry', 'arc', 'parabola-extent', 'parabola-scale', 'parabola-direction', 'hyperbola-a', 'hyperbola-b', 'hyperbola-height', 'hyperbola-branches']) $(id).addEventListener('change', () => { sunMode = false; render(); });
for (const id of ['show-grid', 'show-axes', 'show-labels']) $(id).addEventListener('change', () => {
  painter.showGrid = $('show-grid').checked;
  painter.showAxes = $('show-axes').checked;
  painter.showLabels = $('show-labels').checked;
  painter.Paint();
});
function changeZoom(delta) {
  requestedCell = Math.max(3, Math.min(36, requestedCell + delta));
  const maxCell = Math.max(3, Math.min(36, Math.floor(3900 / Math.max(grid.width, grid.height))));
  painter.cell = Math.min(requestedCell, maxCell);
  $('zoom-value').textContent = painter.cell === requestedCell ? `${painter.cell} px` : `${painter.cell} px (лимит)`;
  painter.Paint();
  centerViewport();
}
$('zoom-out').addEventListener('click', () => changeZoom(-2));
$('zoom-in').addEventListener('click', () => changeZoom(2));
$('step-range').addEventListener('input', (event) => replay(Number(event.target.value)));
$('step-prev').addEventListener('click', () => replay(currentStep - 1));
$('step-next').addEventListener('click', () => replay(currentStep + 1));
$('step-all').addEventListener('click', () => replay(trace.length));
$('png').addEventListener('click', () => painter.canvas.toBlob((blob) => { if (blob) download(blob, 'raster-10a.png'); }));
$('grid-canvas').addEventListener('mousemove', (event) => {
  const rect = painter.canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) * painter.canvas.width / rect.width / painter.cell) + grid.minX;
  const y = grid.minY + grid.height - 1 - Math.floor((event.clientY - rect.top) * painter.canvas.height / rect.height / painter.cell);
  $('hover-position').textContent = `(${x}, ${y}) · α ${grid.GetPixel(x, y).toFixed(2)}`;
});
$('grid-canvas').addEventListener('mouseleave', () => { $('hover-position').textContent = '—'; });

const presets = {
  octants: { algorithm: 'bresenham', x0: 0, y0: 0, x1: 20, y1: 9 },
  horizontal: { algorithm: 'bresenham', x0: -20, y0: 7, x1: 19, y1: 7 },
  vertical: { algorithm: 'dda', x0: -5, y0: -20, x1: -5, y1: 18 },
  point: { algorithm: 'step', x0: 4, y0: -3, x1: 4, y1: -3 },
  circle: { algorithm: 'circle', cx: 0, cy: 0, radius: 15 },
  ellipse: { algorithm: 'ellipse', cx: 0, cy: 0, rx: 24, ry: 13, arc: 'full' },
  parabola: { algorithm: 'parabola', cx: 0, cy: -12, 'parabola-extent': 24, 'parabola-scale': 16, 'parabola-direction': 'up' },
  hyperbola: { algorithm: 'hyperbola', cx: 0, cy: 0, 'hyperbola-a': 9, 'hyperbola-b': 13, 'hyperbola-height': 24, 'hyperbola-branches': 'both' },
};
for (const item of document.querySelectorAll('[data-preset]')) item.addEventListener('click', () => {
  const preset = presets[item.dataset.preset];
  sunMode = item.dataset.preset === 'octants';
  for (const [id, value] of Object.entries(preset)) $(id).value = String(value);
  toggleKind();
});

function download(content, filename) {
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 400);
}
function svgNode(type, attrs = {}, label = undefined) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', type);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (label !== undefined) node.textContent = label;
  return node;
}

function chart(targetId, rows, xKey, series) {
  const element = $(targetId);
  element.replaceChildren();
  if (!rows.length) return;
  const w = 630; const h = 320;
  const l = 61; const r = 18; const t = 23; const b = 48;
  const allValues = series.flatMap((key) => rows.map((row) => row[key]));
  const max = Math.max(...allValues, .001) * 1.14;
  const xMin = rows[0][xKey];
  const xMax = rows[rows.length - 1][xKey];
  const xScale = (value) => l + (value - xMin) / (xMax - xMin || 1) * (w - l - r);
  const yScale = (value) => h - b - value / max * (h - t - b);
  const svg = svgNode('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': `График: ${targetId}` });
  for (let i = 0; i <= 4; i++) {
    const y = h - b - (i / 4) * (h - t - b);
    svg.append(svgNode('line', { x1: l, y1: y, x2: w - r, y2: y, stroke: '#e7edf6' }));
    svg.append(svgNode('text', { x: l - 10, y: y + 4, 'text-anchor': 'end', 'font-size': 12, fill: '#74869c' }, (i / 4 * max).toFixed(max < 10 ? 2 : 1)));
  }
  rows.forEach((row) => {
    const x = xScale(row[xKey]);
    svg.append(svgNode('text', { x, y: h - b + 20, 'text-anchor': 'middle', 'font-size': 11, fill: '#7588a0' }, String(row[xKey])));
  });
  svg.append(svgNode('text', { x: 16, y: 15, 'font-size': 12, fill: '#6b7c92' }, 'мс'));
  for (const key of series) {
    const path = rows.map((row, i) => `${i ? 'L' : 'M'} ${xScale(row[xKey]).toFixed(2)} ${yScale(row[key]).toFixed(2)}`).join(' ');
    svg.append(svgNode('path', { d: path, fill: 'none', stroke: colors[key], 'stroke-width': 2.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    for (const row of rows) {
      const point = svgNode('circle', { cx: xScale(row[xKey]), cy: yScale(row[key]), r: 3.2, fill: colors[key] });
      point.append(svgNode('title', {}, `${labels[key]}: ${row[xKey]} → ${row[key].toFixed(3)} мс`));
      svg.append(point);
    }
  }
  element.append(svg);
  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  for (const key of series) {
    const row = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.background = colors[key];
    row.append(swatch, document.createTextNode(labels[key]));
    legend.append(row);
  }
  element.append(legend);
}

function renderBenchmark() {
  $('benchmark-empty').hidden = true;
  $('benchmark-results').hidden = false;
  chart('chart-count', results.countResults, 'count', ['step', 'dda', 'bresenham', 'wu', 'castle']);
  chart('chart-length', results.lengthResults, 'length', ['step', 'dda', 'bresenham', 'wu', 'castle']);
  chart('chart-circles', results.circleResults, 'count', ['circle']);
  const last = results.countResults.at(-1);
  $('benchmark-info').textContent = `UTC: ${results.meta.generatedAt} · ${results.meta.userAgent} · медиана ${results.meta.repetitions} повторов · время в миллисекундах.`;
  $('benchmark-table').replaceChildren();
  for (const key of ['step', 'dda', 'bresenham', 'wu', 'castle']) {
    const tr = document.createElement('tr');
    for (const value of [labels[key], last[key].toFixed(3), `${last[key + '_raw'].calls.toLocaleString('ru-RU')} вызовов SetPixel`]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      tr.append(cell);
    }
    $('benchmark-table').append(tr);
  }
  const tr = document.createElement('tr');
  for (const item of ['Брезенхем · окружность', results.circleResults.at(-1).circle.toFixed(3), '50 000 окружностей']) {
    const cell = document.createElement('td');
    cell.textContent = item;
    tr.append(cell);
  }
  $('benchmark-table').append(tr);
}

function updateBenchmarkProgress({ percent, text }) {
  $('progress-text').textContent = text;
  $('progress-value').textContent = `${percent}%`;
  $('progress-fill').style.width = `${percent}%`;
}

function finishBenchmark(value) {
  results = value;
  renderBenchmark();
  $('run-benchmark').disabled = false;
  $('progress-text').textContent = 'Измерения завершены.';
}

async function runWithoutWorker() {
  if (fallbackActive) return;
  fallbackActive = true;
  $('progress-text').textContent = 'Выполнение без Web Worker...';
  try {
    finishBenchmark(await runBenchmark(updateBenchmarkProgress));
  } catch (error) {
    $('progress-text').textContent = `Ошибка: ${error.message}`;
    $('run-benchmark').disabled = false;
  } finally {
    fallbackActive = false;
  }
}

$('run-benchmark').addEventListener('click', () => {
  if (worker || fallbackActive) return;
  $('progress-box').hidden = false;
  updateBenchmarkProgress({ percent: 0, text: 'Запуск бенчмарка...' });
  $('run-benchmark').disabled = true;
  try {
    worker = new Worker(new URL('./benchmark.worker.js', import.meta.url), { type: 'module' });
  } catch (_error) {
    void runWithoutWorker();
    return;
  }
  worker.onmessage = (event) => {
    const message = event.data;
    if (message.type === 'progress') updateBenchmarkProgress(message);
    if (message.type === 'error') {
      $('progress-text').textContent = `Ошибка: ${message.message}`;
      worker.terminate(); worker = null;
      $('run-benchmark').disabled = false;
    }
    if (message.type === 'done') {
      finishBenchmark(message.results);
      worker.terminate(); worker = null;
    }
  };
  worker.onerror = () => {
    worker?.terminate(); worker = null;
    void runWithoutWorker();
  };
  worker.postMessage({ type: 'start' });
});
$('export-json').addEventListener('click', () => {
  if (results) download(new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' }), 'benchmark-raster-10a.json');
});
$('export-csv').addEventListener('click', () => {
  if (!results) return;
  const rows = ['series,parameter,step_ms,dda_ms,bresenham_ms,wu_ms,castle_ms,circle_ms'];
  for (const r of results.countResults) rows.push(`line_count,${r.count},${r.step},${r.dda},${r.bresenham},${r.wu},${r.castle},`);
  for (const r of results.lengthResults) rows.push(`line_length,${r.length},${r.step},${r.dda},${r.bresenham},${r.wu},${r.castle},`);
  for (const r of results.circleResults) rows.push(`circle_count,${r.count},,,,,,${r.circle}`);
  download(new Blob(['\ufeff', rows.join('\n')], { type: 'text/csv;charset=utf-8' }), 'benchmark-raster-10a.csv');
});
$('run-checks').addEventListener('click', () => {
  const values = runChecks();
  const passed = values.filter((r) => r.pass).length;
  $('check-summary').textContent = `Успешно: ${passed} из ${values.length}. ${passed === values.length ? 'Все проверки пройдены.' : 'Найдены ошибки, посмотрите список.'}`;
  $('check-results').replaceChildren();
  for (const item of values) {
    const row = document.createElement('div');
    row.className = `check-item ${item.pass ? 'pass' : 'fail'}`;
    const name = document.createElement('span');
    name.textContent = item.name + (item.error ? ` — ${item.error}` : '');
    const status = document.createElement('strong');
    status.textContent = item.pass ? 'ПРОЙДЕНО' : 'ОШИБКА';
    row.append(name, status);
    $('check-results').append(row);
  }
});
render();
