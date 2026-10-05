(function (root) {
  'use strict';

  const Lab3 = root.Lab3 || (root.Lab3 = {});

  function clampCoord(value, size) {
    if (value < 0) return 0;
    if (value >= size) return size - 1;
    return value;
  }

  function reflectCoord(value, size) {
    if (size <= 1) return 0;
    let v = value;
    while (v < 0 || v >= size) {
      if (v < 0) v = -v - 1;
      if (v >= size) v = 2 * size - v - 1;
    }
    return v;
  }

  function mapCoord(value, size, mode) {
    return mode === 'reflect' ? reflectCoord(value, size) : clampCoord(value, size);
  }

  function rgbaToGray(rgba, width, height) {
    const gray = new Uint8Array(width * height);
    for (let i = 0, p = 0; p < gray.length; i += 4, p += 1) {
      gray[p] = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    }
    return gray;
  }

  function grayToRgba(gray) {
    const rgba = new Uint8ClampedArray(gray.length * 4);
    for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
      const value = gray[i];
      rgba[p] = value;
      rgba[p + 1] = value;
      rgba[p + 2] = value;
      rgba[p + 3] = 255;
    }
    return rgba;
  }

  function histogram256(gray) {
    const histogram = new Uint32Array(256);
    for (let i = 0; i < gray.length; i += 1) histogram[gray[i]] += 1;
    return histogram;
  }

  function rgbaHistograms(rgba) {
    const red = new Uint32Array(256);
    const green = new Uint32Array(256);
    const blue = new Uint32Array(256);
    for (let i = 0; i < rgba.length; i += 4) {
      red[rgba[i]] += 1;
      green[rgba[i + 1]] += 1;
      blue[rgba[i + 2]] += 1;
    }
    return { red, green, blue };
  }

  function buildIntegralImages(gray, width, height) {
    const stride = width + 1;
    const size = stride * (height + 1);
    const sum = new Float64Array(size);
    const sqSum = new Float64Array(size);

    for (let y = 1; y <= height; y += 1) {
      let rowSum = 0;
      let rowSqSum = 0;
      const srcRow = (y - 1) * width;
      const currentRow = y * stride;
      const previousRow = (y - 1) * stride;
      for (let x = 1; x <= width; x += 1) {
        const value = gray[srcRow + x - 1];
        rowSum += value;
        rowSqSum += value * value;
        sum[currentRow + x] = sum[previousRow + x] + rowSum;
        sqSum[currentRow + x] = sqSum[previousRow + x] + rowSqSum;
      }
    }

    return { sum, sqSum, stride };
  }

  function rectangleSum(integral, stride, x0, y0, x1, y1) {
    const left = x0;
    const top = y0;
    const right = x1 + 1;
    const bottom = y1 + 1;
    return integral[bottom * stride + right]
      - integral[top * stride + right]
      - integral[bottom * stride + left]
      + integral[top * stride + left];
  }

  function localStats(integrals, width, height, x, y, radius) {
    const x0 = Math.max(0, x - radius);
    const y0 = Math.max(0, y - radius);
    const x1 = Math.min(width - 1, x + radius);
    const y1 = Math.min(height - 1, y + radius);
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    const sum = rectangleSum(integrals.sum, integrals.stride, x0, y0, x1, y1);
    const sqSum = rectangleSum(integrals.sqSum, integrals.stride, x0, y0, x1, y1);
    const mean = sum / count;
    const variance = Math.max(0, sqSum / count - mean * mean);
    return { mean, stdDev: Math.sqrt(variance) };
  }

  function percentileFromHistogram(histogram, total, percentile) {
    const p = Math.max(0, Math.min(1, percentile));
    const target = Math.floor(p * Math.max(0, total - 1));
    let accumulated = 0;
    for (let value = 0; value < 256; value += 1) {
      accumulated += histogram[value];
      if (accumulated > target) return value;
    }
    return 255;
  }

  function minMaxFromHistogram(histogram) {
    let min = 0;
    let max = 255;
    while (min < 255 && histogram[min] === 0) min += 1;
    while (max > 0 && histogram[max] === 0) max -= 1;
    return { min, max };
  }

  Lab3.clampCoord = clampCoord;
  Lab3.reflectCoord = reflectCoord;
  Lab3.mapCoord = mapCoord;
  Lab3.rgbaToGray = rgbaToGray;
  Lab3.grayToRgba = grayToRgba;
  Lab3.histogram256 = histogram256;
  Lab3.rgbaHistograms = rgbaHistograms;
  Lab3.buildIntegralImages = buildIntegralImages;
  Lab3.localStats = localStats;
  Lab3.percentileFromHistogram = percentileFromHistogram;
  Lab3.minMaxFromHistogram = minMaxFromHistogram;

  if (typeof module !== 'undefined' && module.exports) module.exports = Lab3;
})(typeof self !== 'undefined' ? self : globalThis);
