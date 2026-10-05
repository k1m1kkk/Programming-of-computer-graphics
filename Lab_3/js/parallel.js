(function (root) {
  'use strict';

  const Lab3 = root.Lab3 || (root.Lab3 = {});
  let nextWorkerId = 1;

  function splitRows(height, workerCount) {
    const count = Math.max(1, Math.min(height, workerCount | 0));
    const chunks = [];
    for (let i = 0; i < count; i += 1) {
      const yStart = Math.floor((i * height) / count);
      const yEnd = Math.floor(((i + 1) * height) / count);
      if (yEnd > yStart) chunks.push({ yStart, yEnd });
    }
    return chunks;
  }

  function suggestedWorkerCount() {
    const cores = Math.max(2, root.navigator && root.navigator.hardwareConcurrency ? root.navigator.hardwareConcurrency : 4);
    return Math.max(2, Math.min(8, cores));
  }

  function canUseWorkers() {
    return typeof Worker !== 'undefined' && typeof location !== 'undefined' && location.protocol !== 'file:';
  }

  function runWorker(action, payload) {
    return new Promise(function (resolve, reject) {
      const worker = new Worker('js/worker.js');
      const id = nextWorkerId++;
      worker.onmessage = function (event) {
        if (!event.data || event.data.id !== id) return;
        worker.terminate();
        if (event.data.ok) resolve(event.data.result);
        else reject(new Error(event.data.error || 'Worker failed'));
      };
      worker.onerror = function (error) {
        worker.terminate();
        reject(error);
      };
      worker.postMessage(Object.assign({ id, action }, payload));
    });
  }

  async function parallelGrayRows(action, gray, width, height, options, workerCount, progress) {
    const chunks = splitRows(height, workerCount);
    let completed = 0;
    const tasks = chunks.map(async function (chunk) {
      const buffer = await runWorker(action, {
        gray: gray.buffer.slice(0),
        width,
        height,
        options: Object.assign({}, options, chunk)
      });
      completed += 1;
      if (progress) progress(completed / chunks.length);
      return { chunk, data: new Uint8Array(buffer) };
    });
    const parts = await Promise.all(tasks);
    const output = new Uint8Array(width * height);
    for (const part of parts) output.set(part.data, part.chunk.yStart * width);
    return output;
  }

  async function parallelRgbaRows(action, rgba, width, height, options, workerCount, progress) {
    const chunks = splitRows(height, workerCount);
    let completed = 0;
    const tasks = chunks.map(async function (chunk) {
      const buffer = await runWorker(action, {
        rgba: rgba.buffer.slice(0),
        width,
        height,
        options: Object.assign({}, options, chunk)
      });
      completed += 1;
      if (progress) progress(completed / chunks.length);
      return { chunk, data: new Uint8ClampedArray(buffer) };
    });
    const parts = await Promise.all(tasks);
    const output = new Uint8ClampedArray(width * height * 4);
    for (const part of parts) output.set(part.data, part.chunk.yStart * width * 4);
    return output;
  }

  function parallelRankFilter(gray, width, height, options, workerCount, progress) {
    return parallelGrayRows('rankRows', gray, width, height, options, workerCount, progress);
  }

  function parallelAdaptiveMedian(gray, width, height, options, workerCount, progress) {
    return parallelGrayRows('adaptiveMedianRows', gray, width, height, options, workerCount, progress);
  }

  function parallelSauvola(gray, width, height, options, workerCount, progress) {
    return parallelGrayRows('sauvolaBand', gray, width, height, options, workerCount, progress);
  }

  function parallelRankFilterRgba(rgba, width, height, options, workerCount, progress) {
    return parallelRgbaRows('rankRgbaRows', rgba, width, height, options, workerCount, progress);
  }

  function parallelAdaptiveMedianRgba(rgba, width, height, options, workerCount, progress) {
    return parallelRgbaRows('adaptiveMedianRgbaRows', rgba, width, height, options, workerCount, progress);
  }

  Lab3.splitRows = splitRows;
  Lab3.suggestedWorkerCount = suggestedWorkerCount;
  Lab3.canUseWorkers = canUseWorkers;
  Lab3.parallelRankFilter = parallelRankFilter;
  Lab3.parallelAdaptiveMedian = parallelAdaptiveMedian;
  Lab3.parallelSauvola = parallelSauvola;
  Lab3.parallelRankFilterRgba = parallelRankFilterRgba;
  Lab3.parallelAdaptiveMedianRgba = parallelAdaptiveMedianRgba;
})(typeof self !== 'undefined' ? self : globalThis);
