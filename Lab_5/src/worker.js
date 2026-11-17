import { rect } from './geometry.js';
import { Quadtree } from './quadtree.js';
import { makeDataset, DATA_BOUNDS } from './dataset.js';
import { scanSegments, compareAlgorithms, fullBenchmark } from './analysis.js';

let data = null;
let tree = null;
let config = null;
self.onmessage = (event) => {
  const message = event.data;
  try {
    if (message.kind === 'init') {
      const start = performance.now();
      config = { count: message.count, depth: message.depth, density: message.density, seed: 2026 };
      data = makeDataset(config.count, config.density, config.seed);
      const generatedMs = performance.now() - start;
      tree = config.depth > 0 ? new Quadtree(data, DATA_BOUNDS, { maxDepth: config.depth }) : null;
      self.postMessage({ kind: 'ready', count: config.count, nodes: tree?.nodes ?? 0,
        generatedMs, buildMs: performance.now() - start - generatedMs });
    } else if (message.kind === 'query') {
      if (!data) return;
      const window = rect(...message.bounds);
      const start = performance.now();
      const result = scanSegments(data, window, message.algorithm, { tree, renderMargin: 10, motionTime: message.motionTime, motionAmplitude: message.motionAmplitude || 0 });
      const ms = performance.now() - start;
      self.postMessage({ kind: 'queryResult', id: message.id, ms, result }, [result.output.buffer]);
    } else if (message.kind === 'compare') {
      if (!data) return;
      const start = performance.now();
      const result = compareAlgorithms(data, rect(...message.bounds), {motionTime: message.motionTime, motionAmplitude: message.motionAmplitude || 0});
      self.postMessage({ kind: 'comparison', result, ms: performance.now() - start });
    } else if (message.kind === 'benchmark') {
      const result = fullBenchmark(message.options, (info) => self.postMessage({ kind: 'progress', info }));
      self.postMessage({ kind: 'benchmarkResult', result });
    }
  } catch (error) {
    self.postMessage({ kind: 'error', message: String(error?.message ?? error) });
  }
};
