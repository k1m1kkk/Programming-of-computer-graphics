import { RangeReader } from './range-reader.js'
import { detectFormat, extensionToFormat } from './signature.js'
import { parseBmp } from './parsers/bmp.js'
import { parseGif } from './parsers/gif.js'
import { parseJpeg } from './parsers/jpeg.js'
import { parsePcx } from './parsers/pcx.js'
import { parsePng } from './parsers/png.js'
import { parseTiff } from './parsers/tiff.js'

const PARSERS = {
  BMP: parseBmp,
  GIF: parseGif,
  JPEG: parseJpeg,
  PCX: parsePcx,
  PNG: parsePng,
  TIFF: parseTiff
}

export async function parseImageFile(file) {
  const reader = new RangeReader(file)
  const expectedFormat = extensionToFormat(file.name)
  const actualFormat = await detectFormat(reader)

  if (!actualFormat) {
    const result = {
      format: expectedFormat ?? 'UNKNOWN',
      width: null,
      height: null,
      dpiX: null,
      dpiY: null,
      colorDepth: null,
      compression: 'Не определено',
      details: {},
      warnings: [],
      corruptReasons: ['Сигнатура файла не соответствует ни одному поддерживаемому графическому формату']
    }
    result.bytesRead = reader.bytesRead
    result.status = 'corrupt'
    result.expectedFormat = expectedFormat
    result.actualFormat = null
    reader.clear()
    return result
  }

  const parser = PARSERS[actualFormat]
  const result = await parser(reader)
  result.actualFormat = actualFormat
  result.expectedFormat = expectedFormat

  if (expectedFormat && expectedFormat !== actualFormat) {
    result.warnings.push(`Расширение указывает на ${expectedFormat}, но сигнатура файла соответствует ${actualFormat}`)
  }
  if (!expectedFormat) result.warnings.push('Расширение файла не относится к списку лабораторной, формат определен по сигнатуре')

  result.bytesRead = reader.bytesRead
  result.status = result.corruptReasons.length ? 'corrupt' : result.warnings.length ? 'warning' : 'ok'
  reader.clear()
  return result
}
