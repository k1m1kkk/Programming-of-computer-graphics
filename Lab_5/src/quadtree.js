import { EPS, boundsIntersect } from './geometry.js';

function node(xmin, ymin, xmax, ymax, depth) {
  return { xmin, ymin, xmax, ymax, depth, items: [], children: null };
}
export class Quadtree {
  constructor(data, bounds, { maxDepth = 8, capacity = 24 } = {}) {
    if (!(data instanceof Float32Array || data instanceof Float64Array) || data.length % 4 !== 0) {
      throw new Error('Quadtree expects a packed array of segments.');
    }
    if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 14) throw new Error('Invalid tree depth.');
    this.data = data;
    this.root = node(bounds.xmin, bounds.ymin, bounds.xmax, bounds.ymax, 0);
    this.maxDepth = maxDepth;
    this.capacity = capacity;
    this.nodes = 1;
    this.items = data.length / 4;
    for (let i = 0; i < data.length; i += 4) this.insert(this.root, i);
  }
  getBounds(i) {
    const d = this.data;
    return { xmin: Math.min(d[i], d[i + 2]), ymin: Math.min(d[i + 1], d[i + 3]),
      xmax: Math.max(d[i], d[i + 2]), ymax: Math.max(d[i + 1], d[i + 3]) };
  }
  childIndex(n, a) {
    const mx = (n.xmin + n.xmax) / 2;
    const my = (n.ymin + n.ymax) / 2;
    let h;
    let v;
    if (a.xmax <= mx - EPS) h = 0;
    else if (a.xmin >= mx + EPS) h = 1;
    else return -1;
    if (a.ymax <= my - EPS) v = 0;
    else if (a.ymin >= my + EPS) v = 1;
    else return -1;
    return v * 2 + h;
  }
  subdivide(n) {
    const mx = (n.xmin + n.xmax) / 2;
    const my = (n.ymin + n.ymax) / 2;
    const d = n.depth + 1;
    n.children = [node(n.xmin, n.ymin, mx, my, d), node(mx, n.ymin, n.xmax, my, d),
      node(n.xmin, my, mx, n.ymax, d), node(mx, my, n.xmax, n.ymax, d)];
    this.nodes += 4;
    const items = n.items;
    n.items = [];
    for (const index of items) this.insert(n, index);
  }
  insert(n, index) {
    if (n.children) {
      const which = this.childIndex(n, this.getBounds(index));
      if (which !== -1) { this.insert(n.children[which], index); return; }
    }
    n.items.push(index);
    if (!n.children && n.depth < this.maxDepth && n.items.length > this.capacity) this.subdivide(n);
  }
  query(r, visitor) {
    let nodesVisited = 0;
    let candidates = 0;
    const walk = (n) => {
      if (!boundsIntersect(n, r)) return;
      nodesVisited++;
      for (const i of n.items) { candidates++; visitor(i); }
      if (n.children) for (const child of n.children) walk(child);
    };
    walk(this.root);
    return { nodesVisited, candidates };
  }
}
