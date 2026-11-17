import { aabbMask, clipCohen, clipLiang, equivalentSegments, newOps } from './geometry.js';
import { Quadtree } from './quadtree.js';
import { DATA_BOUNDS, makeDataset } from './dataset.js';

export function scanSegments(data, r, algorithm = 'liang', { tree = null, maxVisible = Infinity, renderMargin = 0, motionTime = null, motionAmplitude = 0 } = {}) {
  const fn = algorithm === 'cohen' ? clipCohen : clipLiang;
  let scanned = 0, prefiltered = 0, visible = 0, stored = 0, differences = 0;
  const arithmetic = newOps();
  const output = [];
  const padding = renderMargin + (motionTime === null ? 0 : motionAmplitude);
  const searchRect = padding > 0 ? { xmin: r.xmin - padding, ymin: r.ymin - padding,
    xmax: r.xmax + padding, ymax: r.ymax + padding } : r;
  const scan = (i) => {
    scanned++;
    let x1 = data[i], y1 = data[i + 1], x2 = data[i + 2], y2 = data[i + 3];
    if (aabbMask(x1, y1, x2, y2, searchRect)) { prefiltered++; return; }
    if (motionTime !== null && motionAmplitude > 0) {
      const phase = (i / 4) * 0.0713;
      const sx = motionAmplitude * Math.sin(motionTime * 0.00047 + phase);
      const sy = motionAmplitude * Math.cos(motionTime * 0.00061 + phase * 1.33);
      x1 += sx; x2 += sx; y1 += sy; y2 += sy;
    }
    if (renderMargin > 0 && stored < maxVisible) { output.push(x1, y1, x2, y2); stored++; }
    if (aabbMask(x1, y1, x2, y2, r)) return;
    const clipped = fn(x1, y1, x2, y2, r, arithmetic);
    if (clipped) {
      visible++;
      if (renderMargin <= 0 && stored < maxVisible) { output.push(...clipped); stored++; }
    }
  };
  let query = { nodesVisited: 0, candidates: data.length / 4 };
  if (tree) query = tree.query(searchRect, scan);
  else for (let i = 0; i < data.length; i += 4) scan(i);
  return { output: renderMargin > 0 ? Float32Array.from(output) : Float64Array.from(output), scanned, prefiltered, visible, stored,
    arithmetic, treeNodesVisited: query.nodesVisited, candidates: query.candidates, differences };
}
export function compareAlgorithms(data, r, {motionTime = null, motionAmplitude = 0} = {}) {
  const cohen = newOps(), liang = newOps();
  let visible = 0, mismatch = 0, fastRejected = 0;
  for (let i = 0; i < data.length; i += 4) {
    let x1 = data[i], y1 = data[i + 1], x2 = data[i + 2], y2 = data[i + 3];
    if (motionTime !== null && motionAmplitude > 0) {
      const phase = (i / 4) * 0.0713;
      const sx = motionAmplitude * Math.sin(motionTime * 0.00047 + phase);
      const sy = motionAmplitude * Math.cos(motionTime * 0.00061 + phase * 1.33);
      x1 += sx; x2 += sx; y1 += sy; y2 += sy;
    }
    if (aabbMask(x1, y1, x2, y2, r)) { fastRejected++; continue; }
    const a = clipCohen(x1, y1, x2, y2, r, cohen);
    const b = clipLiang(x1, y1, x2, y2, r, liang);
    if (a) visible++;
    if (!equivalentSegments(a, b)) mismatch++;
  }
  return { cohen, liang, visible, mismatch, fastRejected };
}
export function fullBenchmark({ count = 500000, depths = [0, 4, 6, 8], densities = [0.6, 1, 3], samples = 16, seed = 2026 } = {}, notify = () => {}) {
  const results = [];
  const start = performance.now();
  const scenarios = densities.length * depths.length;
  let done = 0;
  for (const density of densities) {
    const data = makeDataset(count, density, seed);
    for (const depth of depths) {
      const buildStart = performance.now();
      const tree = depth ? new Quadtree(data, DATA_BOUNDS, { maxDepth: depth }) : null;
      const buildMs = performance.now() - buildStart;
      const timings = [];
      const visibleCounts = [];
      let tested = 0;
      for (let i = 0; i < samples; i++) {
        const x = -280 + (560 * i) / Math.max(1, samples - 1);
        const y = 90 * Math.sin(i * 1.37);
        const r = { xmin: x - 24, ymin: y - 18, xmax: x + 24, ymax: y + 18 };
        const t = performance.now();
        const result = scanSegments(data, r, 'cohen', { tree, maxVisible: 0 });
        timings.push(performance.now() - t);
        visibleCounts.push(result.visible);
        tested += result.scanned;
      }
      timings.sort((a, b) => a - b);
      results.push({ count, density, depth, buildMs, medianMs: timings[Math.floor(timings.length / 2)],
        p95Ms: timings[Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)],
        meanCandidates: tested / samples, meanVisible: visibleCounts.reduce((a, b) => a + b, 0) / samples,
        nodes: tree?.nodes ?? 0, samples });
      done++;
      notify({ done, total: scenarios, density, depth });
    }
  }
  return { meta: { count, depths, densities, samples, seed, elapsedMs: performance.now() - start,
    algorithm: 'cohen', numericFormat: 'Float64Array', timestamp: new Date().toISOString(), platform: typeof navigator !== 'undefined' ? navigator.userAgent : `Node ${process.version}` }, results };
}
