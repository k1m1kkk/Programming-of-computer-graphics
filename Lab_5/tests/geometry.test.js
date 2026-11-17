import test from 'node:test';
import assert from 'node:assert/strict';
import { EPS, aabbMask, clipCohen, clipLiang, equivalentSegments, newOps, parseSegments, rect, serializeSegments } from '../src/geometry.js';
import { Quadtree } from '../src/quadtree.js';
import { makeDataset, DATA_BOUNDS } from '../src/dataset.js';
import { scanSegments, compareAlgorithms } from '../src/analysis.js';

const r = rect(-5, -5, 5, 5);
const cases = [
  ['inside', [-2, -2, 2, 2], [-2, -2, 2, 2]],
  ['outside-left', [-9, -2, -8, 2], null],
  ['cross-horizontal', [-10, 0, 10, 0], [-5, 0, 5, 0]],
  ['cross-vertical', [0, -10, 0, 10], [0, -5, 0, 5]],
  ['diagonal-corners', [-10, -10, 10, 10], [-5, -5, 5, 5]],
  ['boundary-top', [-5, 5, 5, 5], [-5, 5, 5, 5]],
  ['boundary-right', [5, -5, 5, 5], [5, -5, 5, 5]],
  ['parallel-outside', [-7, 6, 7, 6], null],
  ['vertex-zero', [-5, -5, -5, -5], [-5, -5, -5, -5]],
  ['outside-zero', [-8, 0, -8, 0], null],
  ['inside-zero', [0, 0, 0, 0], [0, 0, 0, 0]],
  ['vertex-touch', [-10, 0, -5, 5], [-5, 5, -5, 5]],
  ['eps-on-border', [-5 - EPS / 2, 0, 5 + EPS / 2, 0], [-5 - EPS / 2, 0, 5 + EPS / 2, 0]]
];
for (const [name, args, expected] of cases) test(`segment ${name}`, () => {
  assert.ok(equivalentSegments(clipCohen(...args, r), expected));
  assert.ok(equivalentSegments(clipLiang(...args, r), expected));
});
test('operation counters record actual multiplications and divisions', () => {
  const co = newOps(), li = newOps();
  clipCohen(-9, 0, 9, 0, r, co); clipLiang(-9, 0, 9, 0, r, li);
  assert.ok(co.mul > 0 && co.div > 0 && li.div > 0);
});
test('aabb bitmask', () => {
  assert.equal(aabbMask(-6, 6, 6, 7, r), 8);
  assert.equal(aabbMask(-6, 0, 6, 0, r), 0);
});
test('input file roundtrip', () => {
  const original = [[-10, 0, 10, 0], [0.5, 1.3, 2.5, 4]];
  const parsed = parseSegments(serializeSegments(original, r));
  assert.deepEqual(parsed.segments, original);
  assert.deepEqual(parsed.window, r);
});
test('bad input rejected', () => {
  assert.throws(() => parseSegments('2\n0 0 1 1\n-5 -5 5 5'));
  assert.throws(() => parseSegments('0\n5 0 -5 9'));
});
test('quadtree results equal full scan', () => {
  const data = makeDataset(12000, 1, 1234);
  const tree = new Quadtree(data, DATA_BOUNDS, { maxDepth: 7 });
  for (let i = 0; i < 12; i++) {
    const x = (i - 6) * 35;
    const window = rect(x - 15, -15, x + 15, 15);
    const direct = scanSegments(data, window, 'liang');
    const indexed = scanSegments(data, window, 'liang', { tree });
    assert.equal(indexed.visible, direct.visible);
    const canonical = (v) => {
      const rows = [];
      for (let j = 0; j < v.length; j += 4) rows.push(Array.from(v.slice(j, j + 4)).join(','));
      return rows.sort();
    };
    assert.deepEqual(canonical(indexed.output), canonical(direct.output));
  }
});
test('structural and parametric algorithms agree on randomized 12000 lines', () => {
  const data = makeDataset(12000, 1, 1234);
  const comparison = compareAlgorithms(data, rect(-25, -30, 30, 25));
  assert.equal(comparison.mismatch, 0);
});
test('long spanning segments are not dropped by quadtree', () => {
  const data = new Float32Array(4000 * 4);
  for (let i = 0; i < 4000; i++) {
    const theta = (i / 4000) * Math.PI * 2;
    const k = 4 * i;
    data[k] = Math.cos(theta) * 450;
    data[k + 1] = Math.sin(theta) * 450;
    data[k + 2] = -Math.cos(theta) * 450;
    data[k + 3] = -Math.sin(theta) * 450;
  }
  const tree = new Quadtree(data, DATA_BOUNDS, { maxDepth: 8 });
  for (const w of [rect(-3,-3,3,3), rect(-400,-300,-300,-200), rect(-1,-200,1,200)]) {
    assert.equal(scanSegments(data, w, 'liang', { tree }).visible, scanSegments(data, w, 'liang').visible);
  }
});
