(function (root) {
  'use strict';

  const Lab3 = root.Lab3 || (root.Lab3 = {});

  function otsuThreshold(gray) {
    const histogram = Lab3.histogram256(gray);
    const total = gray.length;
    let weightedSum = 0;
    for (let i = 0; i < 256; i += 1) weightedSum += i * histogram[i];

    let backgroundWeight = 0;
    let backgroundSum = 0;
    let bestThreshold = 0;
    let bestVariance = -1;

    for (let threshold = 0; threshold < 256; threshold += 1) {
      backgroundWeight += histogram[threshold];
      if (backgroundWeight === 0) continue;
      const foregroundWeight = total - backgroundWeight;
      if (foregroundWeight === 0) break;

      backgroundSum += threshold * histogram[threshold];
      const backgroundMean = backgroundSum / backgroundWeight;
      const foregroundMean = (weightedSum - backgroundSum) / foregroundWeight;
      const difference = backgroundMean - foregroundMean;
      const variance = backgroundWeight * foregroundWeight * difference * difference;

      if (variance > bestVariance) {
        bestVariance = variance;
        bestThreshold = threshold;
      }
    }

    return bestThreshold;
  }

  function iterativeIntermeansThreshold(gray, tolerance, maxIterations) {
    const tol = tolerance == null ? 0.5 : Number(tolerance);
    const maxIter = maxIterations == null ? 100 : Math.max(1, maxIterations | 0);
    let min = 255;
    let max = 0;

    for (let i = 0; i < gray.length; i += 1) {
      const value = gray[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }

    let threshold = (min + max) / 2;
    let iterations = 0;

    for (; iterations < maxIter; iterations += 1) {
      let lowSum = 0;
      let lowCount = 0;
      let highSum = 0;
      let highCount = 0;

      for (let i = 0; i < gray.length; i += 1) {
        const value = gray[i];
        if (value <= threshold) {
          lowSum += value;
          lowCount += 1;
        } else {
          highSum += value;
          highCount += 1;
        }
      }

      if (lowCount === 0 || highCount === 0) break;
      const next = 0.5 * (lowSum / lowCount + highSum / highCount);
      if (Math.abs(next - threshold) < tol) {
        threshold = next;
        iterations += 1;
        break;
      }
      threshold = next;
    }

    return { threshold: Math.round(threshold), iterations };
  }

  function applyGlobalThreshold(gray, threshold, invert) {
    const output = new Uint8Array(gray.length);
    const inverse = !!invert;
    for (let i = 0; i < gray.length; i += 1) {
      const white = gray[i] > threshold;
      output[i] = white !== inverse ? 255 : 0;
    }
    return output;
  }

  function sauvolaRows(gray, width, height, integrals, options) {
    const opts = options || {};
    const radius = Math.max(1, opts.radius == null ? 15 : opts.radius | 0);
    const k = opts.k == null ? 0.34 : Number(opts.k);
    const dynamicRange = opts.dynamicRange == null ? 128 : Math.max(1, Number(opts.dynamicRange));
    const invert = !!opts.invert;
    const yStart = Math.max(0, opts.yStart == null ? 0 : opts.yStart | 0);
    const yEnd = Math.min(height, opts.yEnd == null ? height : opts.yEnd | 0);
    const output = new Uint8Array((yEnd - yStart) * width);

    for (let y = yStart; y < yEnd; y += 1) {
      const dstRow = (y - yStart) * width;
      const srcRow = y * width;
      for (let x = 0; x < width; x += 1) {
        const stats = Lab3.localStats(integrals, width, height, x, y, radius);
        const threshold = stats.mean * (1 + k * (stats.stdDev / dynamicRange - 1));
        const white = gray[srcRow + x] > threshold;
        output[dstRow + x] = white !== invert ? 255 : 0;
      }
    }

    return output;
  }

  function sauvolaBandRows(gray, width, height, options) {
    const opts = options || {};
    const radius = Math.max(1, opts.radius == null ? 15 : opts.radius | 0);
    const yStart = Math.max(0, opts.yStart == null ? 0 : opts.yStart | 0);
    const yEnd = Math.min(height, opts.yEnd == null ? height : opts.yEnd | 0);
    const bandStart = Math.max(0, yStart - radius);
    const bandEnd = Math.min(height, yEnd + radius);
    const bandHeight = bandEnd - bandStart;
    const band = new Uint8Array(width * bandHeight);

    for (let y = bandStart; y < bandEnd; y += 1) {
      const sourceOffset = y * width;
      const targetOffset = (y - bandStart) * width;
      band.set(gray.subarray(sourceOffset, sourceOffset + width), targetOffset);
    }

    const integrals = Lab3.buildIntegralImages(band, width, bandHeight);
    const localOptions = Object.assign({}, opts, { yStart: yStart - bandStart, yEnd: yEnd - bandStart });
    return sauvolaRows(band, width, bandHeight, integrals, localOptions);
  }

  function sauvolaThreshold(gray, width, height, options) {
    const integrals = Lab3.buildIntegralImages(gray, width, height);
    return sauvolaRows(gray, width, height, integrals, Object.assign({}, options, { yStart: 0, yEnd: height }));
  }

  Lab3.otsuThreshold = otsuThreshold;
  Lab3.iterativeIntermeansThreshold = iterativeIntermeansThreshold;
  Lab3.applyGlobalThreshold = applyGlobalThreshold;
  Lab3.sauvolaRows = sauvolaRows;
  Lab3.sauvolaBandRows = sauvolaBandRows;
  Lab3.sauvolaThreshold = sauvolaThreshold;

  if (typeof module !== 'undefined' && module.exports) module.exports = Lab3;
})(typeof self !== 'undefined' ? self : globalThis);
