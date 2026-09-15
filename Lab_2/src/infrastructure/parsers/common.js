export function ascii(bytes, start = 0, length = bytes.length - start) {
  let result = ''
  const end = Math.min(bytes.length, start + length)
  for (let i = start; i < end; i += 1) result += String.fromCharCode(bytes[i])
  return result
}

export function viewOf(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

export function toDpiFromPixelsPerMeter(value) {
  if (!value || value <= 0) return null
  return value * 0.0254
}

export function formatDpiValue(value) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100) / 100
}

export function addCorrupt(result, reason) {
  if (!result.corruptReasons.includes(reason)) result.corruptReasons.push(reason)
}

export function addWarning(result, warning) {
  if (!result.warnings.includes(warning)) result.warnings.push(warning)
}

export function createBaseResult(format) {
  return {
    format,
    width: null,
    height: null,
    dpiX: null,
    dpiY: null,
    colorDepth: null,
    compression: 'Не указано',
    details: {},
    warnings: [],
    corruptReasons: []
  }
}

export function safeNumber(value) {
  return Number.isFinite(value) ? value : null
}
