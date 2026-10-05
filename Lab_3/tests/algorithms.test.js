'use strict';

const assert = require('assert');
require('../js/core.js');
require('../js/threshold.js');
require('../js/rank-filters.js');
const L = global.Lab3;

function equalArrays(a, b) {
  assert.strictEqual(a.length, b.length);
  for (let i = 0; i < a.length; i += 1) assert.strictEqual(a[i], b[i], 'Mismatch at index ' + i);
}

(function testGrayConversion() {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
  const gray = L.rgbaToGray(rgba, 2, 1);
  assert.strictEqual(gray.length, 2);
  assert.strictEqual(gray[0], 76);
  assert.strictEqual(gray[1], 150);
})();

(function testEdgeModes() {
  assert.strictEqual(L.mapCoord(-1, 4, 'clamp'), 0);
  assert.strictEqual(L.mapCoord(4, 4, 'clamp'), 3);
  assert.strictEqual(L.mapCoord(-1, 4, 'reflect'), 0);
  assert.strictEqual(L.mapCoord(4, 4, 'reflect'), 3);
  assert.strictEqual(L.mapCoord(-2, 4, 'reflect'), 1);
  assert.strictEqual(L.mapCoord(5, 4, 'reflect'), 2);
})();

(function testIntegralStats() {
  const gray = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const integral = L.buildIntegralImages(gray, 3, 3);
  const stats = L.localStats(integral, 3, 3, 1, 1, 1);
  assert.ok(Math.abs(stats.mean - 5) < 1e-9);
})();

(function testOtsu() {
  const gray = new Uint8Array(200);
  gray.fill(30, 0, 100);
  gray.fill(220, 100);
  const threshold = L.otsuThreshold(gray);
  assert.ok(threshold >= 30 && threshold < 220);
  const output = L.applyGlobalThreshold(gray, threshold, false);
  assert.strictEqual(output[0], 0);
  assert.strictEqual(output[199], 255);
})();

(function testIntermeans() {
  const gray = new Uint8Array([10, 10, 20, 20, 200, 200, 210, 210]);
  const result = L.iterativeIntermeansThreshold(gray);
  assert.ok(result.threshold > 20 && result.threshold < 200);
  assert.ok(result.iterations >= 1);
})();

(function testSauvolaBandEqualsFull() {
  const width = 11;
  const height = 9;
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) gray[y * width + x] = (x * 17 + y * 11) % 256;
  }
  const options = { radius: 2, k: 0.34, dynamicRange: 128 };
  const full = L.sauvolaThreshold(gray, width, height, options);
  const a = L.sauvolaBandRows(gray, width, height, Object.assign({}, options, { yStart: 0, yEnd: 4 }));
  const b = L.sauvolaBandRows(gray, width, height, Object.assign({}, options, { yStart: 4, yEnd: 9 }));
  const combined = new Uint8Array(width * height);
  combined.set(a, 0);
  combined.set(b, 4 * width);
  equalArrays(full, combined);
})();

(function testMedianRemovesImpulse() {
  const width = 5;
  const height = 5;
  const gray = new Uint8Array(width * height);
  gray.fill(100);
  gray[12] = 255;
  const filtered = L.rankFilter(gray, width, height, { radius: 1, percentile: 0.5, edgeMode: 'clamp' });
  assert.strictEqual(filtered[12], 100);
})();

(function testMinMaxFilters() {
  const width = 3;
  const height = 3;
  const gray = new Uint8Array([9,8,7,6,5,4,3,2,1]);
  const min = L.rankFilter(gray, width, height, { radius: 1, percentile: 0, edgeMode: 'clamp' });
  const max = L.rankFilter(gray, width, height, { radius: 1, percentile: 1, edgeMode: 'clamp' });
  assert.strictEqual(min[4], 1);
  assert.strictEqual(max[4], 9);
})();

(function testAdaptiveMedian() {
  const width = 7;
  const height = 7;
  const gray = new Uint8Array(width * height);
  gray.fill(120);
  gray[24] = 0;
  gray[25] = 255;
  const filtered = L.adaptiveMedianFilter(gray, width, height, { maxRadius: 3, edgeMode: 'reflect' });
  assert.strictEqual(filtered[24], 120);
  assert.strictEqual(filtered[25], 120);
})();

(function testColorMedianPreservesChannelsAndAlpha() {
  const width = 3;
  const height = 3;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    rgba[i] = 40;
    rgba[i + 1] = 100;
    rgba[i + 2] = 180;
    rgba[i + 3] = 200;
  }
  const center = 4 * 4;
  rgba[center] = 255;
  rgba[center + 1] = 0;
  rgba[center + 2] = 255;
  const filtered = L.rankFilterRgba(rgba, width, height, { radius: 1, percentile: 0.5, edgeMode: 'clamp' });
  assert.strictEqual(filtered[center], 40);
  assert.strictEqual(filtered[center + 1], 100);
  assert.strictEqual(filtered[center + 2], 180);
  assert.strictEqual(filtered[center + 3], 200);
})();

(function testColorHistogramCounts() {
  const rgba = new Uint8ClampedArray([
    10, 20, 30, 255,
    10, 25, 35, 255,
    12, 20, 35, 255
  ]);
  const hist = L.rgbaHistograms(rgba);
  assert.strictEqual(hist.red[10], 2);
  assert.strictEqual(hist.green[20], 2);
  assert.strictEqual(hist.blue[35], 2);
})();

console.log('11/11 algorithm tests passed');
