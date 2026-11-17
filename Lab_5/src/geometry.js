export const EPS = 1e-7;
export const OUT_LEFT = 1;
export const OUT_RIGHT = 2;
export const OUT_BOTTOM = 4;
export const OUT_TOP = 8;

export function near(a, b, tolerance = EPS) { return Math.abs(a - b) <= tolerance; }
export function point(x, y) { return { x, y }; }
export function rect(xmin, ymin, xmax, ymax) {
  if (![xmin, ymin, xmax, ymax].every(Number.isFinite) || xmin >= xmax - EPS || ymin >= ymax - EPS) {
    throw new Error('Для окна необходимы конечные координаты xmin < xmax и ymin < ymax.');
  }
  return { xmin, ymin, xmax, ymax };
}
export function outcode(x, y, r) {
  let code = 0;
  if (x < r.xmin - EPS) code |= OUT_LEFT;
  if (x > r.xmax + EPS) code |= OUT_RIGHT;
  if (y < r.ymin - EPS) code |= OUT_BOTTOM;
  if (y > r.ymax + EPS) code |= OUT_TOP;
  return code;
}
export function inRect(x, y, r) { return outcode(x, y, r) === 0; }
export function aabbMask(x1, y1, x2, y2, r) {
  let mask = 0;
  if (Math.max(x1, x2) < r.xmin - EPS) mask |= OUT_LEFT;
  if (Math.min(x1, x2) > r.xmax + EPS) mask |= OUT_RIGHT;
  if (Math.max(y1, y2) < r.ymin - EPS) mask |= OUT_BOTTOM;
  if (Math.min(y1, y2) > r.ymax + EPS) mask |= OUT_TOP;
  return mask;
}
export function boundsIntersect(a, b) {
  return !(a.xmax < b.xmin - EPS || a.xmin > b.xmax + EPS ||
    a.ymax < b.ymin - EPS || a.ymin > b.ymax + EPS);
}
function mult(a, b, stats) { if (stats) stats.mul++; return a * b; }
function divide(a, b, stats) { if (stats) stats.div++; return a / b; }
export function newOps() { return { mul: 0, div: 0 }; }
function interpolate(x1, y1, dx, dy, t, stats) {
  return [x1 + mult(dx, t, stats), y1 + mult(dy, t, stats)];
}
function machineTolerance(...values) {
  return Number.EPSILON * Math.max(1, ...values.map(Math.abs)) * 4;
}

// The epsilon-expanded closed window is shared by both independent algorithms.
// Consequently, tolerance never moves the intersection behind an endpoint.
export function clipCohen(x1, y1, x2, y2, r, stats = null) {
  let c1 = outcode(x1, y1, r), c2 = outcode(x2, y2, r);
  const left = r.xmin - EPS, right = r.xmax + EPS;
  const bottom = r.ymin - EPS, top = r.ymax + EPS;
  for (let iteration = 0; iteration < 9; iteration++) {
    if ((c1 | c2) === 0) return [x1, y1, x2, y2];
    if ((c1 & c2) !== 0) return null;
    const outside = c1 !== 0 ? c1 : c2;
    let x, y;
    if (outside & (OUT_TOP | OUT_BOTTOM)) {
      const border = (outside & OUT_TOP) ? top : bottom;
      const dy = y2 - y1;
      if (Math.abs(dy) <= machineTolerance(y1, y2) && (c1 & c2)) return null;
      const t = divide(border - y1, dy, stats);
      x = x1 + mult(x2 - x1, t, stats);
      y = border;
    } else {
      const border = (outside & OUT_RIGHT) ? right : left;
      const dx = x2 - x1;
      if (Math.abs(dx) <= machineTolerance(x1, x2) && (c1 & c2)) return null;
      const t = divide(border - x1, dx, stats);
      x = border;
      y = y1 + mult(y2 - y1, t, stats);
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (outside === c1) {
      x1 = x; y1 = y; c1 = outcode(x1, y1, r);
    } else {
      x2 = x; y2 = y; c2 = outcode(x2, y2, r);
    }
  }
  return null;
}

export function clipLiang(x1, y1, x2, y2, r, stats = null) {
  const dx = x2 - x1, dy = y2 - y1;
  if (Math.abs(dx) <= machineTolerance(x1, x2) && Math.abs(dy) <= machineTolerance(y1, y2)) {
    return inRect(x1, y1, r) ? [x1, y1, x1, y1] : null;
  }
  const ps = [-dx, dx, -dy, dy];
  const qs = [x1 - (r.xmin - EPS), (r.xmax + EPS) - x1,
    y1 - (r.ymin - EPS), (r.ymax + EPS) - y1];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    const p = ps[i], q = qs[i];
    const tolerance = machineTolerance(p, q) * 0.25;
    if (Math.abs(p) <= tolerance) {
      if (q < -tolerance) return null;
      continue;
    }
    const t = divide(q, p, stats);
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1 + machineTolerance(t0, t1)) return null;
  }
  if (t0 > t1) t0 = t1 = (t0 + t1) / 2;
  const a = t0 <= 0 ? [x1, y1] : interpolate(x1, y1, dx, dy, t0, stats);
  const b = t1 >= 1 ? [x2, y2] : interpolate(x1, y1, dx, dy, t1, stats);
  return [a[0], a[1], b[0], b[1]];
}

function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
function signedDoubleArea(vertices) {
  let total = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total;
}
export function convexOrientation(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 3 || vertices.length > 220) {
    throw new Error('Выпуклый отсекатель должен содержать от 3 до 220 вершин.');
  }
  for (const v of vertices) if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) {
    throw new Error('Координаты вершин должны быть конечными числами.');
  }
  const twiceArea = signedDoubleArea(vertices);
  if (Math.abs(twiceArea) <= EPS * EPS) throw new Error('Площадь выпуклого отсекателя равна нулю.');
  const orientation = twiceArea > 0 ? 1 : -1;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const length = Math.hypot(ex, ey);
    if (length <= EPS) throw new Error('У отсекателя есть совпадающие вершины или слишком короткое ребро.');
    for (let j = 0; j < vertices.length; j++) {
      const v = vertices[j];
      const signed = orientation * cross(ex, ey, v.x - a.x, v.y - a.y);
      if (signed < -EPS * length) throw new Error('Для варианта 10 отсекатель должен быть выпуклым и без самопересечений.');
    }
  }
  return orientation;
}

// Cyrus-Beck: intersect the parameter interval with each convex half-plane.
export function clipCyrusBeck(x1, y1, x2, y2, vertices, stats = null, orientation = undefined) {
  const sign = orientation ?? convexOrientation(vertices);
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const edgeLength = Math.hypot(ex, ey);
    const q = sign * (mult(ex, y1 - a.y, stats) - mult(ey, x1 - a.x, stats)) + EPS * edgeLength;
    const p = sign * (mult(ex, dy, stats) - mult(ey, dx, stats));
    const tolerance = machineTolerance(q, p) * 0.25;
    if (Math.abs(p) <= tolerance) {
      if (q < -tolerance) return null;
      continue;
    }
    const t = divide(-q, p, stats);
    if (p > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1 + machineTolerance(t0, t1)) return null;
  }
  if (t0 > t1) t0 = t1 = (t0 + t1) / 2;
  const a = t0 <= 0 ? [x1, y1] : interpolate(x1, y1, dx, dy, t0, stats);
  const b = t1 >= 1 ? [x2, y2] : interpolate(x1, y1, dx, dy, t1, stats);
  return [a[0], a[1], b[0], b[1]];
}

export function equivalentSegments(a, b, eps = 2e-6) {
  if (a === null || b === null) return a === b;
  return a.length === 4 && b.length === 4 && a.every((n, i) => Math.abs(n - b[i]) <= eps);
}
export function parseSegments(text) {
  const rows = text.split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim()).filter(Boolean);
  if (!rows.length) throw new Error('Входной файл пуст.');
  const n = Number(rows[0]);
  if (!Number.isSafeInteger(n) || n < 0 || n > 2000000) throw new Error('В первой строке ожидается целое число отрезков n от 0 до 2000000.');
  if (rows.length !== n + 2) throw new Error(`Ожидается ${n + 2} непустых строк, получено ${rows.length}.`);
  const parse = (row, expected) => {
    const values = row.replace(/,/g, '.').split(/\s+/).map(Number);
    if (values.length !== expected || !values.every(Number.isFinite)) throw new Error(`Неверные координаты: «${row}».`);
    return values;
  };
  const segments = [];
  for (let i = 1; i <= n; i++) segments.push(parse(rows[i], 4));
  const [xmin, ymin, xmax, ymax] = parse(rows[n + 1], 4);
  return { segments, window: rect(xmin, ymin, xmax, ymax) };
}
export function serializeSegments(segments, r) {
  const fmt = (n) => String(Number(Number(n).toPrecision(15)));
  return `${segments.length}\n${segments.map((s) => s.map(fmt).join(' ')).join('\n')}\n${[r.xmin, r.ymin, r.xmax, r.ymax].map(fmt).join(' ')}\n`;
}
