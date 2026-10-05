'use strict';

importScripts('./core.js', './threshold.js', './rank-filters.js');

self.onmessage = function (event) {
  const message = event.data;
  try {
    let result;
    if (message.action === 'rankRows') {
      result = self.Lab3.rankFilterRows(new Uint8Array(message.gray), message.width, message.height, message.options);
    } else if (message.action === 'adaptiveMedianRows') {
      result = self.Lab3.adaptiveMedianFilterRows(new Uint8Array(message.gray), message.width, message.height, message.options);
    } else if (message.action === 'sauvolaBand') {
      result = self.Lab3.sauvolaBandRows(new Uint8Array(message.gray), message.width, message.height, message.options);
    } else if (message.action === 'rankRgbaRows') {
      result = self.Lab3.rankFilterRgbaRows(new Uint8ClampedArray(message.rgba), message.width, message.height, message.options);
    } else if (message.action === 'adaptiveMedianRgbaRows') {
      result = self.Lab3.adaptiveMedianRgbaRows(new Uint8ClampedArray(message.rgba), message.width, message.height, message.options);
    } else {
      throw new Error('Unknown worker action: ' + message.action);
    }
    self.postMessage({ id: message.id, ok: true, result: result.buffer }, [result.buffer]);
  } catch (error) {
    self.postMessage({ id: message.id, ok: false, error: String(error && error.stack ? error.stack : error) });
  }
};
