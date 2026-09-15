import { addCorrupt, addWarning, createBaseResult, formatDpiValue } from './common.js'
import { firstTagValue, parseClassicTiffIfdChain, tagValues } from './tiff-structure.js'

const COMPRESSION = {
  1: 'Без сжатия',
  2: 'CCITT RLE',
  3: 'CCITT Group 3 Fax',
  4: 'CCITT Group 4 Fax',
  5: 'LZW',
  6: 'Old JPEG',
  7: 'JPEG',
  8: 'Adobe Deflate',
  32773: 'PackBits',
  32946: 'Deflate',
  34712: 'JPEG 2000'
}

const PHOTOMETRIC = {
  0: 'WhiteIsZero',
  1: 'BlackIsZero',
  2: 'RGB',
  3: 'Palette color',
  4: 'Transparency mask',
  5: 'CMYK',
  6: 'YCbCr',
  8: 'CIELab'
}

function describeDepth(bits, samplesPerPixel) {
  if (!bits.length) return null
  if (bits.length === 1) return bits[0] * Math.max(1, samplesPerPixel || 1)
  return bits.reduce((sum, value) => sum + (Number(value) || 0), 0)
}

async function validateDataBlocks(parsed, reader, result, ifdNumber) {
  const pairs = [
    [273, 279, 'strip'],
    [324, 325, 'tile']
  ]

  for (const [offsetTag, countTag, name] of pairs) {
    const offsets = tagValues(parsed, offsetTag)
    const counts = tagValues(parsed, countTag)
    if (!offsets.length || !counts.length) continue

    const n = Math.min(offsets.length, counts.length, 4096)
    for (let i = 0; i < n; i += 1) {
      const start = Number(offsets[i])
      const count = Number(counts[i])
      const end = start + count
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || start < 0 || count < 0 || end > reader.size) {
        addCorrupt(result, `TIFF IFD ${ifdNumber}: ${name} #${i + 1} выходит за размер файла`)
        return
      }
    }

    if (offsets.length !== counts.length) addWarning(result, `TIFF IFD ${ifdNumber}: количество ${name} offsets и byte counts различается`)
  }
}

export async function parseTiff(reader) {
  const result = createBaseResult('TIFF')
  if (reader.size < 8) {
    addCorrupt(result, 'Файл слишком мал для TIFF')
    return result
  }

  const prefix = await reader.read(0, 4)
  const littleOrder = prefix[0] === 0x49 && prefix[1] === 0x49
  const bigOrder = prefix[0] === 0x4d && prefix[1] === 0x4d
  const magicLittle = littleOrder ? prefix[2] | (prefix[3] << 8) : null
  const magicBig = bigOrder ? (prefix[2] << 8) | prefix[3] : null
  const magic = magicLittle ?? magicBig

  if (!littleOrder && !bigOrder) {
    addCorrupt(result, 'Неверный порядок байтов TIFF')
    return result
  }

  if (magic === 43) {
    result.details['Порядок байтов'] = littleOrder ? 'Little-endian (II)' : 'Big-endian (MM)'
    result.details['Вариант TIFF'] = 'BigTIFF (magic 43)'
    addWarning(result, 'Файл распознан как BigTIFF. Лабораторный парсер реализует классический TIFF 6.0 с 32-битными смещениями')
    return result
  }

  const chain = await parseClassicTiffIfdChain(reader, { maxIfds: 32 })
  if (!chain.validHeader) {
    for (const error of chain.errors ?? ['Некорректный TIFF']) addCorrupt(result, error)
    return result
  }

  for (const error of chain.errors) addCorrupt(result, error)
  if (!chain.ifds.length) {
    addCorrupt(result, 'TIFF не содержит доступного IFD')
    return result
  }

  if (chain.truncatedChain) {
    addWarning(result, `Цепочка TIFF содержит более 32 IFD; дальнейший обход остановлен на смещении ${chain.nextUnparsedIfdOffset}`)
  }

  const parsed = chain.ifds[0]
  result.width = firstTagValue(parsed, 256)
  result.height = firstTagValue(parsed, 257)
  const rawBits = tagValues(parsed, 258)
  const bits = rawBits.length ? rawBits : [1]
  const compressionCode = firstTagValue(parsed, 259, 1)
  const photometric = firstTagValue(parsed, 262)
  const samplesPerPixel = firstTagValue(parsed, 277, bits.length || 1)
  const xResolution = firstTagValue(parsed, 282)
  const yResolution = firstTagValue(parsed, 283)
  const resolutionUnit = firstTagValue(parsed, 296, 2)
  const colorMap = parsed.tags?.get(320)

  result.colorDepth = describeDepth(bits, samplesPerPixel)
  result.compression = COMPRESSION[compressionCode] ?? `Неизвестный код (${compressionCode})`
  result.details['Порядок байтов'] = chain.little ? 'Little-endian (II)' : 'Big-endian (MM)'
  result.details['IFD в цепочке'] = chain.ifds.length
  result.details['IFD0: записей'] = parsed.entryCount
  result.details['IFD offsets'] = chain.ifds.map(ifd => ifd.relativeOffset).join(' → ')
  result.details['BitsPerSample'] = rawBits.length ? bits.join(', ') : '1 (значение по умолчанию TIFF)'
  result.details['SamplesPerPixel'] = samplesPerPixel
  result.details['PhotometricInterpretation'] = PHOTOMETRIC[photometric] ?? (photometric == null ? 'Не задан' : `Код ${photometric}`)
  result.details['Следующий IFD после IFD0'] = parsed.nextIfdOffset ? `смещение ${parsed.nextIfdOffset}` : 'Нет'

  if (resolutionUnit === 2) {
    result.dpiX = formatDpiValue(xResolution)
    result.dpiY = formatDpiValue(yResolution)
  } else if (resolutionUnit === 3) {
    result.dpiX = formatDpiValue(xResolution == null ? null : xResolution * 2.54)
    result.dpiY = formatDpiValue(yResolution == null ? null : yResolution * 2.54)
  } else if (xResolution || yResolution) {
    addWarning(result, 'TIFF содержит X/YResolution, но ResolutionUnit не задан')
  }

  if (colorMap?.count) result.details['Палитра'] = `${Math.floor(colorMap.count / 3)} цветов`
  if (!result.width || !result.height) addCorrupt(result, 'В первом TIFF IFD отсутствуют корректные ImageWidth/ImageLength')

  const pageDimensions = []
  for (let i = 0; i < chain.ifds.length; i += 1) {
    const ifd = chain.ifds[i]
    await validateDataBlocks(ifd, reader, result, i)
    const width = firstTagValue(ifd, 256)
    const height = firstTagValue(ifd, 257)
    if (width && height) pageDimensions.push(`${i}: ${width}×${height}`)
  }
  if (pageDimensions.length > 1) result.details['Размеры IFD-страниц'] = pageDimensions.join('; ')

  return result
}
