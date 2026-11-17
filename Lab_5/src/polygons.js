import { EPS, near } from './geometry.js';

export function polygonArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}
function same(a, b) { return Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS; }
function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
function onSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const wx = p.x - a.x, wy = p.y - a.y;
  const scale = Math.max(1, Math.hypot(vx, vy));
  return Math.abs(cross(vx, vy, wx, wy)) <= EPS * scale &&
    p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}
export function insideEvenOdd(p, rings, boundaryIsInside = true) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if (onSegment(p, a, b)) return boundaryIsInside;
      if ((a.y > p.y + EPS) !== (b.y > p.y + EPS)) {
        const x = (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x;
        if (x > p.x + EPS) inside = !inside;
      }
    }
  }
  return inside;
}
export function parseRings(text) {
  const rings = text.trim().split(/\n\s*\n|\s*\|\s*/).map((chunk) => {
    const rows = chunk.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const pts = rows.map((line) => {
      const nums = line.replace(/,/g, '.').split(/\s+/).map(Number);
      if (nums.length !== 2 || !nums.every(Number.isFinite)) throw new Error(`Неверная вершина «${line}». Ожидается X Y.`);
      return { x: nums[0], y: nums[1] };
    });
    if (pts.length > 1 && same(pts[0], pts.at(-1))) pts.pop();
    return pts.filter((p, i) => i === 0 || !same(p, pts[i - 1]));
  });
  if (!rings.length || rings.some((ring) => ring.length < 3)) throw new Error('Каждый контур должен иметь минимум 3 вершины. Отделяйте контуры пустой строкой.');
  if (rings.reduce((sum, ring) => sum + ring.length, 0) > 220) throw new Error('Максимум 220 вершин для интерактивного режима.');
  return rings;
}
export function rectangleRing(r) {
  return [{ x: r.xmin, y: r.ymin }, { x: r.xmax, y: r.ymin },
    { x: r.xmax, y: r.ymax }, { x: r.xmin, y: r.ymax }];
}
function addCut(edge, t) {
  if (Number.isFinite(t) && t >= -EPS && t <= 1 + EPS) edge.cuts.push(Math.max(0, Math.min(1, t)));
}
function position(edge, t) {
  return { x: edge.a.x + (edge.b.x - edge.a.x) * t,
    y: edge.a.y + (edge.b.y - edge.a.y) * t };
}
function projection(p, edge) {
  const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y;
  const denom = dx * dx + dy * dy;
  if (denom <= EPS * EPS) return 0;
  return ((p.x - edge.a.x) * dx + (p.y - edge.a.y) * dy) / denom;
}
function splitIntersections(a, b) {
  const rx = a.b.x - a.a.x, ry = a.b.y - a.a.y;
  const sx = b.b.x - b.a.x, sy = b.b.y - b.a.y;
  const dx = b.a.x - a.a.x, dy = b.a.y - a.a.y;
  const denom = cross(rx, ry, sx, sy);
  const scale = Math.max(1, Math.hypot(rx, ry), Math.hypot(sx, sy));
  if (Math.abs(denom) > EPS * scale) {
    const t = cross(dx, dy, sx, sy) / denom;
    const u = cross(dx, dy, rx, ry) / denom;
    if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
      addCut(a, t); addCut(b, u);
    }
    return;
  }
  if (Math.abs(cross(rx, ry, dx, dy)) > EPS * scale) return;
  if (onSegment(b.a, a.a, a.b)) { addCut(a, projection(b.a, a)); addCut(b, 0); }
  if (onSegment(b.b, a.a, a.b)) { addCut(a, projection(b.b, a)); addCut(b, 1); }
  if (onSegment(a.a, b.a, b.b)) { addCut(b, projection(a.a, b)); addCut(a, 0); }
  if (onSegment(a.b, b.a, b.b)) { addCut(b, projection(a.b, b)); addCut(a, 1); }
}
function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (length2 <= EPS * EPS) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function sampleOffset(mid, edge, edges, length) {
  let gap = Infinity;
  for (const other of edges) {
    if (other === edge || same(other.a, edge.a) || same(other.a, edge.b) ||
        same(other.b, edge.a) || same(other.b, edge.b)) continue;
    const distance = pointToSegmentDistance(mid, other.a, other.b);
    if (distance > EPS * 2) gap = Math.min(gap, distance);
  }
  return Math.min(Math.max(EPS * 2.1, Math.min(1e-5, length * 0.1)), gap * 0.35);
}
function makeEdges(rings, kind) {
  const edges = [];
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (!same(a, b)) edges.push({ a, b, kind, cuts: [0, 1] });
  }
  return edges;
}

/** Edge-graph polygon intersection; supports concavity, multiple contours, even-odd holes and self-crossings. */
function clipPolygonGraph(rings, clipRing) {
  const edges = [...makeEdges(rings, 'subject'), ...makeEdges([clipRing], 'clip')];
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const a = edges[i], b = edges[j];
    if (Math.max(a.a.x, a.b.x) < Math.min(b.a.x, b.b.x) - EPS ||
        Math.max(b.a.x, b.b.x) < Math.min(a.a.x, a.b.x) - EPS ||
        Math.max(a.a.y, a.b.y) < Math.min(b.a.y, b.b.y) - EPS ||
        Math.max(b.a.y, b.b.y) < Math.min(a.a.y, a.b.y) - EPS) continue;
    splitIntersections(a, b);
  }
  const nodes = new Map();
  const links = new Map();
  const snapped = (p) => {
    const key = `${Math.round(p.x / EPS)}:${Math.round(p.y / EPS)}`;
    if (!nodes.has(key)) nodes.set(key, { key, x: p.x, y: p.y, outgoing: [] });
    return nodes.get(key);
  };
  for (const edge of edges) {
    const totalLength = Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y);
    const paramTolerance = EPS / Math.max(totalLength, EPS);
    edge.cuts.sort((a, b) => a - b);
    const cuts = edge.cuts.filter((t, i) => i === 0 || t - edge.cuts[i - 1] > paramTolerance);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = position(edge, cuts[i]), b = position(edge, cuts[i + 1]);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < EPS * 2) continue;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const offset = sampleOffset({ x: mx, y: my }, edge, edges, len);
      const nx = -(b.y - a.y) / len * offset;
      const ny = (b.x - a.x) / len * offset;
      const inside = (x, y) => insideEvenOdd({ x, y }, rings, false) && insideEvenOdd({ x, y }, [clipRing], false);
      const left = inside(mx + nx, my + ny);
      const right = inside(mx - nx, my - ny);
      if (left === right) continue;
      const start = snapped(left ? a : b);
      const end = snapped(left ? b : a);
      if (start === end) continue;
      const key = `${start.key}>${end.key}`;
      if (links.has(key)) continue;
      const link = { start, end, used: false, angle: Math.atan2(end.y - start.y, end.x - start.x) };
      links.set(key, link);
      start.outgoing.push(link);
    }
  }
  const ringsOut = [];
  const maxSteps = links.size + 1;
  const TAU = 2 * Math.PI;
  for (const link of links.values()) {
    if (link.used) continue;
    let current = link;
    const loop = [];
    let closed = false;
    for (let step = 0; step < maxSteps; step++) {
      if (current.used) break;
      current.used = true;
      loop.push({ x: current.start.x, y: current.start.y });
      const vertex = current.end;
      if (vertex === link.start) { closed = true; break; }
      const backwards = Math.atan2(current.start.y - vertex.y, current.start.x - vertex.x);
      let next = null, best = Infinity;
      for (const option of vertex.outgoing) {
        if (option.used) continue;
        let clockwise = ((backwards - option.angle) % TAU + TAU) % TAU;
        if (clockwise < EPS) clockwise = TAU;
        if (clockwise < best) { best = clockwise; next = option; }
      }
      if (!next) break;
      current = next;
    }
    if (closed && loop.length >= 3 && Math.abs(polygonArea(loop)) > EPS * EPS) ringsOut.push(loop);
  }
  return ringsOut;
}

function properIntersection(a, b, c, d) {
  const rx = b.x - a.x, ry = b.y - a.y;
  const sx = d.x - c.x, sy = d.y - c.y;
  const denominator = cross(rx, ry, sx, sy);
  const scale = Math.max(1, Math.hypot(rx, ry), Math.hypot(sx, sy));
  if (Math.abs(denominator) <= EPS * scale) {
    if (Math.abs(cross(rx, ry, c.x - a.x, c.y - a.y)) <= EPS * scale &&
        (onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d))) return 'overlap';
    return null;
  }
  const t = cross(c.x - a.x, c.y - a.y, sx, sy) / denominator;
  const u = cross(c.x - a.x, c.y - a.y, rx, ry) / denominator;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) return 'touch';
  return { t, u, x: a.x + rx * t, y: a.y + ry * t };
}
function isSimpleRing(ring) {
  if (ring.length < 3 || Math.abs(polygonArea(ring)) <= EPS * EPS) return false;
  for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) {
    if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
    if (properIntersection(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) return false;
  }
  return true;
}

export function clipWeilerAthertonSimple(subject, windowRing) {
  if (!isSimpleRing(subject) || !isSimpleRing(windowRing)) return null;
  const s = polygonArea(subject) > 0 ? [...subject] : [...subject].reverse();
  const c = polygonArea(windowRing) > 0 ? [...windowRing] : [...windowRing].reverse();
  const sEvents = Array.from({ length: s.length }, () => []);
  const cEvents = Array.from({ length: c.length }, () => []);
  const events = [];
  for (let i = 0; i < s.length; i++) for (let j = 0; j < c.length; j++) {
    const hit = properIntersection(s[i], s[(i + 1) % s.length], c[j], c[(j + 1) % c.length]);
    if (hit === 'overlap' || hit === 'touch') return null;
    if (!hit) continue;
    const sourceNode = { x: hit.x, y: hit.y, isIntersection: true, mate: null, next: null, entry: false, visited: false };
    const clipNode = { x: hit.x, y: hit.y, isIntersection: true, mate: sourceNode, next: null };
    sourceNode.mate = clipNode;
    const event = { t: hit.t, u: hit.u, sourceNode, clipNode };
    sEvents[i].push(event);
    cEvents[j].push(event);
    events.push(event);
  }
  if (!events.length) return null;
  const sourceNodes = s.map((p) => ({ ...p, isIntersection: false, next: null }));
  const clipNodes = c.map((p) => ({ ...p, isIntersection: false, next: null }));
  for (let i = 0; i < s.length; i++) {
    const list = sEvents[i].sort((a, b) => a.t - b.t);
    let previous = sourceNodes[i];
    for (const event of list) { previous.next = event.sourceNode; previous = event.sourceNode; }
    previous.next = sourceNodes[(i + 1) % s.length];
  }
  for (let i = 0; i < c.length; i++) {
    const list = cEvents[i].sort((a, b) => a.u - b.u);
    let previous = clipNodes[i];
    for (const event of list) { previous.next = event.clipNode; previous = event.clipNode; }
    previous.next = clipNodes[(i + 1) % c.length];
  }
  for (const event of events) {
    const n = event.sourceNode;
    const pair = sEvents.findIndex((list) => list.includes(event));
    const a = s[pair], b = s[(pair + 1) % s.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const step = Math.min(0.0001, length * Math.min(event.t, 1 - event.t) * 0.1);
    const sx = (b.x - a.x) / length * step;
    const sy = (b.y - a.y) / length * step;
    const wasInside = insideEvenOdd({ x: n.x - sx, y: n.y - sy }, [c], false);
    const nowInside = insideEvenOdd({ x: n.x + sx, y: n.y + sy }, [c], false);
    if (wasInside === nowInside) return null;
    n.entry = !wasInside && nowInside;
  }
  const result = [];
  const limit = s.length + c.length + events.length * 4 + 5;
  for (const entryEvent of events.filter((event) => event.sourceNode.entry)) {
    const start = entryEvent.sourceNode;
    if (start.visited) continue;
    let node = start;
    let side = 'subject';
    const ring = [];
    let closed = false;
    for (let i = 0; i < limit; i++) {
      if (node === start && ring.length) { closed = true; break; }
      ring.push({ x: node.x, y: node.y });
      if (node.isIntersection) {
        if (side === 'subject') {
          if (node.entry) node.visited = true;
          else { node = node.mate; side = 'clip'; }
        } else if (node.mate.entry) { node = node.mate; side = 'subject'; node.visited = true; }
      }
      if (node === start && ring.length > 1) { closed = true; break; }
      node = node.next;
    }
    if (!closed || ring.length < 3) return null;
    if (ring.length > 1 && same(ring[0], ring.at(-1))) ring.pop();
    if (ring.length >= 3 && Math.abs(polygonArea(ring)) > EPS * EPS) result.push(ring);
  }
  return result.length ? result : null;
}

export function clipPolygon(rings, clipRing) {
  if (rings.length === 1) {
    const straightforward = clipWeilerAthertonSimple(rings[0], clipRing);
    if (straightforward !== null) return straightforward;
  }
  return clipPolygonGraph(rings, clipRing);
}
