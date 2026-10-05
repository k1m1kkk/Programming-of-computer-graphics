(function (root) {
  'use strict';

  const Lab3 = root.Lab3 || (root.Lab3 = {});

  function fillHistogram(gray, width, height, x, y, radius, edgeMode, histogram) {
    histogram.fill(0);
    for (let yy = y - radius; yy <= y + radius; yy += 1) {
      const sy = Lab3.mapCoord(yy, height, edgeMode);
      for (let xx = x - radius; xx <= x + radius; xx += 1) {
        const sx = Lab3.mapCoord(xx, width, edgeMode);
        histogram[gray[sy * width + sx]] += 1;
      }
    }
  }

  function slideHistogram(gray, width, height, previousX, y, radius, edgeMode, histogram) {
    const removeX = Lab3.mapCoord(previousX - radius, width, edgeMode);
    const addX = Lab3.mapCoord(previousX + radius + 1, width, edgeMode);
    for (let yy = y - radius; yy <= y + radius; yy += 1) {
      const sy = Lab3.mapCoord(yy, height, edgeMode);
      histogram[gray[sy * width + removeX]] -= 1;
      histogram[gray[sy * width + addX]] += 1;
    }
  }

  function rankFilterRows(gray, width, height, options) {
    const opts = options || {};
    const radius = Math.max(1, opts.radius == null ? 1 : opts.radius | 0);
    const percentile = Math.max(0, Math.min(1, opts.percentile == null ? 0.5 : Number(opts.percentile)));
    const edgeMode = opts.edgeMode === 'reflect' ? 'reflect' : 'clamp';
    const yStart = Math.max(0, opts.yStart == null ? 0 : opts.yStart | 0);
    const yEnd = Math.min(height, opts.yEnd == null ? height : opts.yEnd | 0);
    const output = new Uint8Array((yEnd - yStart) * width);
    const histogram = new Uint32Array(256);
    const windowSize = (2 * radius + 1) * (2 * radius + 1);

    for (let y = yStart; y < yEnd; y += 1) {
      const dstRow = (y - yStart) * width;
      fillHistogram(gray, width, height, 0, y, radius, edgeMode, histogram);
      output[dstRow] = Lab3.percentileFromHistogram(histogram, windowSize, percentile);

      for (let x = 1; x < width; x += 1) {
        slideHistogram(gray, width, height, x - 1, y, radius, edgeMode, histogram);
        output[dstRow + x] = Lab3.percentileFromHistogram(histogram, windowSize, percentile);
      }
    }

    return output;
  }

  function rankFilter(gray, width, height, options) {
    return rankFilterRows(gray, width, height, Object.assign({}, options, { yStart: 0, yEnd: height }));
  }

  function adaptiveMedianFilterRows(gray, width, height, options) {
    const opts = options || {};
    const maxRadius = Math.max(1, opts.maxRadius == null ? 3 : opts.maxRadius | 0);
    const edgeMode = opts.edgeMode === 'reflect' ? 'reflect' : 'clamp';
    const yStart = Math.max(0, opts.yStart == null ? 0 : opts.yStart | 0);
    const yEnd = Math.min(height, opts.yEnd == null ? height : opts.yEnd | 0);
    const output = new Uint8Array((yEnd - yStart) * width);
    const histogram = new Uint32Array(256);

    for (let y = yStart; y < yEnd; y += 1) {
      const dstRow = (y - yStart) * width;
      for (let x = 0; x < width; x += 1) {
        const original = gray[y * width + x];
        let result = original;

        for (let radius = 1; radius <= maxRadius; radius += 1) {
          fillHistogram(gray, width, height, x, y, radius, edgeMode, histogram);
          const total = (2 * radius + 1) * (2 * radius + 1);
          const median = Lab3.percentileFromHistogram(histogram, total, 0.5);
          const limits = Lab3.minMaxFromHistogram(histogram);
          const medianIsSignal = median > limits.min && median < limits.max;

          if (medianIsSignal) {
            result = original > limits.min && original < limits.max ? original : median;
            break;
          }

          result = median;
        }

        output[dstRow + x] = result;
      }
    }

    return output;
  }

  function adaptiveMedianFilter(gray, width, height, options) {
    return adaptiveMedianFilterRows(gray, width, height, Object.assign({}, options, { yStart: 0, yEnd: height }));
  }

  function createRgbHistograms() {
    return [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  }

  function clearRgbHistograms(histograms) {
    histograms[0].fill(0);
    histograms[1].fill(0);
    histograms[2].fill(0);
  }

  function fillRgbHistograms(rgba, width, height, x, y, radius, edgeMode, histograms) {
    clearRgbHistograms(histograms);
    for (let yy = y - radius; yy <= y + radius; yy += 1) {
      const sy = Lab3.mapCoord(yy, height, edgeMode);
      for (let xx = x - radius; xx <= x + radius; xx += 1) {
        const sx = Lab3.mapCoord(xx, width, edgeMode);
        const index = (sy * width + sx) * 4;
        histograms[0][rgba[index]] += 1;
        histograms[1][rgba[index + 1]] += 1;
        histograms[2][rgba[index + 2]] += 1;
      }
    }
  }

  function slideRgbHistograms(rgba, width, height, previousX, y, radius, edgeMode, histograms) {
    const removeX = Lab3.mapCoord(previousX - radius, width, edgeMode);
    const addX = Lab3.mapCoord(previousX + radius + 1, width, edgeMode);
    for (let yy = y - radius; yy <= y + radius; yy += 1) {
      const sy = Lab3.mapCoord(yy, height, edgeMode);
      const removeIndex = (sy * width + removeX) * 4;
      const addIndex = (sy * width + addX) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        histograms[channel][rgba[removeIndex + channel]] -= 1;
        histograms[channel][rgba[addIndex + channel]] += 1;
      }
    }
  }

  function rankFilterRgbaRows(rgba, width, height, options) {
    const opts = options || {};
    const radius = Math.max(1, opts.radius == null ? 1 : opts.radius | 0);
    const percentile = Math.max(0, Math.min(1, opts.percentile == null ? 0.5 : Number(opts.percentile)));
    const edgeMode = opts.edgeMode === 'reflect' ? 'reflect' : 'clamp';
    const yStart = Math.max(0, opts.yStart == null ? 0 : opts.yStart | 0);
    const yEnd = Math.min(height, opts.yEnd == null ? height : opts.yEnd | 0);
    const output = new Uint8ClampedArray((yEnd - yStart) * width * 4);
    const histograms = createRgbHistograms();
    const windowSize = (2 * radius + 1) * (2 * radius + 1);

    for (let y = yStart; y < yEnd; y += 1) {
      const dstRow = (y - yStart) * width * 4;
      fillRgbHistograms(rgba, width, height, 0, y, radius, edgeMode, histograms);

      for (let x = 0; x < width; x += 1) {
        if (x > 0) slideRgbHistograms(rgba, width, height, x - 1, y, radius, edgeMode, histograms);
        const dst = dstRow + x * 4;
        output[dst] = Lab3.percentileFromHistogram(histograms[0], windowSize, percentile);
        output[dst + 1] = Lab3.percentileFromHistogram(histograms[1], windowSize, percentile);
        output[dst + 2] = Lab3.percentileFromHistogram(histograms[2], windowSize, percentile);
        output[dst + 3] = rgba[(y * width + x) * 4 + 3];
      }
    }

    return output;
  }

  function rankFilterRgba(rgba, width, height, options) {
    return rankFilterRgbaRows(rgba, width, height, Object.assign({}, options, { yStart: 0, yEnd: height }));
  }

  function adaptiveMedianRgbaRows(rgba, width, height, options) {
    const opts = options || {};
    const maxRadius = Math.max(1, opts.maxRadius == null ? 3 : opts.maxRadius | 0);
    const edgeMode = opts.edgeMode === 'reflect' ? 'reflect' : 'clamp';
    const yStart = Math.max(0, opts.yStart == null ? 0 : opts.yStart | 0);
    const yEnd = Math.min(height, opts.yEnd == null ? height : opts.yEnd | 0);
    const output = new Uint8ClampedArray((yEnd - yStart) * width * 4);
    const histograms = createRgbHistograms();

    for (let y = yStart; y < yEnd; y += 1) {
      const dstRow = (y - yStart) * width * 4;
      for (let x = 0; x < width; x += 1) {
        const sourceIndex = (y * width + x) * 4;
        const result = [rgba[sourceIndex], rgba[sourceIndex + 1], rgba[sourceIndex + 2]];
        const resolved = [false, false, false];

        for (let radius = 1; radius <= maxRadius; radius += 1) {
          fillRgbHistograms(rgba, width, height, x, y, radius, edgeMode, histograms);
          const total = (2 * radius + 1) * (2 * radius + 1);

          for (let channel = 0; channel < 3; channel += 1) {
            if (resolved[channel]) continue;
            const median = Lab3.percentileFromHistogram(histograms[channel], total, 0.5);
            const limits = Lab3.minMaxFromHistogram(histograms[channel]);
            if (median > limits.min && median < limits.max) {
              const original = rgba[sourceIndex + channel];
              result[channel] = original > limits.min && original < limits.max ? original : median;
              resolved[channel] = true;
            } else {
              result[channel] = median;
            }
          }

          if (resolved[0] && resolved[1] && resolved[2]) break;
        }

        const dst = dstRow + x * 4;
        output[dst] = result[0];
        output[dst + 1] = result[1];
        output[dst + 2] = result[2];
        output[dst + 3] = rgba[sourceIndex + 3];
      }
    }

    return output;
  }

  function adaptiveMedianRgba(rgba, width, height, options) {
    return adaptiveMedianRgbaRows(rgba, width, height, Object.assign({}, options, { yStart: 0, yEnd: height }));
  }

  Lab3.rankFilterRows = rankFilterRows;
  Lab3.rankFilter = rankFilter;
  Lab3.adaptiveMedianFilterRows = adaptiveMedianFilterRows;
  Lab3.adaptiveMedianFilter = adaptiveMedianFilter;
  Lab3.rankFilterRgbaRows = rankFilterRgbaRows;
  Lab3.rankFilterRgba = rankFilterRgba;
  Lab3.adaptiveMedianRgbaRows = adaptiveMedianRgbaRows;
  Lab3.adaptiveMedianRgba = adaptiveMedianRgba;

  if (typeof module !== 'undefined' && module.exports) module.exports = Lab3;
})(typeof self !== 'undefined' ? self : globalThis);
