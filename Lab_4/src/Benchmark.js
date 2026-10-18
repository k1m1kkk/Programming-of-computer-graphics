import { RasterEngine } from './RasterEngine.js';
import { VirtualGrid } from './VirtualGrid.js';

const LINE_METHODS = [
  ['step', RasterEngine.StepLine],
  ['dda', RasterEngine.DDALine],
  ['bresenham', RasterEngine.BresenhamLine],
  ['wu', RasterEngine.WuLine],
  ['castle', RasterEngine.CastlePittewayLine],
];

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function generateSunLines(count, lower, upper, seed) {
  const random = rng(seed);
  const segments = new Int16Array(count * 4);
  for (let i = 0; i < count; i++) {
    const octant = i % 8;
    const length = lower + Math.floor(random() * (upper - lower + 1));
    const secondary = 1 + Math.floor(random() * (length - 1));
    const majorX = (octant & 1) === 0;
    const signX = (octant & 2) === 0 ? 1 : -1;
    const signY = (octant & 4) === 0 ? 1 : -1;
    const dx = signX * (majorX ? length : secondary);
    const dy = signY * (majorX ? secondary : length);
    const x0 = 0;
    const y0 = 0;
    const offset = i * 4;
    segments[offset] = x0;
    segments[offset + 1] = y0;
    segments[offset + 2] = x0 + dx;
    segments[offset + 3] = y0 + dy;
  }
  return segments;
}

function circleSet(count, seed) {
  const random = rng(seed);
  const circles = new Int16Array(count * 3);
  for (let i = 0; i < count; i++) {
    const offset = i * 3;
    circles[offset] = Math.floor(random() * 21) - 10;
    circles[offset + 1] = Math.floor(random() * 21) - 10;
    circles[offset + 2] = 1 + Math.floor(random() * 120);
  }
  return circles;
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function timePure(draw, target, repeats = 3) {
  const measurements = [];
  for (let r = 0; r < repeats; r++) {
    target.Clear();
    const begin = performance.now();
    draw(target);
    const elapsed = performance.now() - begin;
    measurements.push(elapsed);
  }
  return {
    ms: median(measurements),
    measurements,
    pixels: target.touched,
    calls: target.calls,
    clipped: target.clipped,
  };
}

function renderLines(lines, length, fn, target) {
  for (let i = 0; i < length; i++) {
    const p = i * 4;
    fn(target, lines[p], lines[p + 1], lines[p + 2], lines[p + 3]);
  }
}

function renderCircles(circles, count, target) {
  for (let i = 0; i < count; i++) {
    const p = i * 3;
    RasterEngine.BresenhamCircle(target, circles[p], circles[p + 1], circles[p + 2]);
  }
}

export async function runBenchmark(onProgress = () => {}, { quick = false } = {}) {
  const target = new VirtualGrid(401, 401);
  const counts = quick ? [500, 1000, 2000] : [5000, 10000, 25000, 50000, 100000];
  const circleCounts = quick ? [250, 500, 1000] : [2500, 5000, 12500, 25000, 50000];
  const lengthVariants = quick ? [12, 48, 96] : [12, 24, 48, 96, 160];
  const repeats = quick ? 1 : 3;
  const allLines = generateSunLines(counts[counts.length - 1], 8, 160, 0x4a21bcb1);
  const allCircles = circleSet(circleCounts[circleCounts.length - 1], 0x5022aa61);
  const countResults = [];
  const lengthResults = [];
  const circleResults = [];
  const tasks = counts.length * LINE_METHODS.length + lengthVariants.length * LINE_METHODS.length + circleCounts.length;
  let done = 0;
  const update = (text) => onProgress({ percent: Math.round((++done / tasks) * 100), text });

  for (const count of counts) {
    const record = { count };
    for (const [id, fn] of LINE_METHODS) {
      const result = timePure((grid) => renderLines(allLines, count, fn, grid), target, repeats);
      record[id] = result.ms;
      if (count === counts[counts.length - 1]) record[id + '_raw'] = result;
      update(`${count.toLocaleString('ru-RU')} отрезков · ${id}`);
    }
    countResults.push(record);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  for (const length of lengthVariants) {
    const lines = generateSunLines(quick ? 1500 : 10000, length, length, 0x8fc401a3);
    const record = { length };
    for (const [id, fn] of LINE_METHODS) {
      const result = timePure((grid) => renderLines(lines, lines.length / 4, fn, grid), target, repeats);
      record[id] = result.ms;
      update(`Длина ${length} · ${id}`);
    }
    lengthResults.push(record);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  for (const count of circleCounts) {
    const result = timePure((grid) => renderCircles(allCircles, count, grid), target, repeats);
    circleResults.push({ count, circle: result.ms, ...(count === circleCounts[circleCounts.length - 1] ? { circle_raw: result } : {}) });
    update(`${count.toLocaleString('ru-RU')} окружностей`);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      clock: 'performance.now()',
      repetitions: repeats,
      statistic: repeats === 1 ? 'single' : 'median',
      seedLines: '0x4a21bcb1',
      seedCircles: '0x5022aa61',
      grid: '401x401',
      lineRange: '8..160',
      geometry: 'Sun: all rays originate at (0,0); octants cycle 0..7; directions, lengths and slopes are seeded random.',
      radiusRange: '1..120',
      methodology: 'Dataset and Clear() are outside the timer. SetPixel() and full raster generation are inside. No DOM or canvas rendering is timed.',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : `Node.js ${process.version}`,
    },
    countResults,
    lengthResults,
    circleResults,
  };
}
