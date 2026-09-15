import { addCorrupt, addWarning, createBaseResult, formatDpiValue, toDpiFromPixelsPerMeter, viewOf } from './common.js'

const COMPRESSION = {
  0: 'BI_RGB (без сжатия)',
  1: 'BI_RLE8',
  2: 'BI_RLE4',
  3: 'BI_BITFIELDS',
  4: 'BI_JPEG',
  5: 'BI_PNG',
  6: 'BI_ALPHABITFIELDS',
  11: 'BI_CMYK',
  12: 'BI_CMYKRLE8',
  13: 'BI_CMYKRLE4'
}

function expectedUncompressedBytes(width, height, bpp) {
  if (!width || !height || !bpp) return null
  const rowBits = width * bpp
  const rowBytes = Math.floor((rowBits + 31) / 32) * 4
  const total = rowBytes * height
  return Number.isSafeInteger(total) ? total : null
}

export async function parseBmp(reader) {
  const result = createBaseResult('BMP')
  if (reader.size < 26) {
    addCorrupt(result, 'Файл слишком мал для заголовка BMP')
    return result
  }

  const first = await reader.read(0, Math.min(reader.size, 138))
  const view = viewOf(first)
  if (first[0] !== 0x42 || first[1] !== 0x4d) {
    addCorrupt(result, 'Неверная сигнатура BMP')
    return result
  }

  const declaredFileSize = view.getUint32(2, true)
  const reserved1 = view.getUint16(6, true)
  const reserved2 = view.getUint16(8, true)
  const pixelOffset = view.getUint32(10, true)
  const dibSize = view.getUint32(14, true)

  result.details['DIB-заголовок'] = `${dibSize} байт`
  result.details['Смещение пикселей'] = `${pixelOffset} байт`
  result.details['Размер из BITMAPFILEHEADER'] = declaredFileSize ? `${declaredFileSize} байт` : '0 (не задан)'

  if (reserved1 !== 0 || reserved2 !== 0) addWarning(result, 'Reserved-поля BITMAPFILEHEADER обычно должны быть равны 0')
  if (declaredFileSize && reader.size < declaredFileSize) addCorrupt(result, 'Фактический размер меньше bfSize из BITMAPFILEHEADER')
  if (declaredFileSize && pixelOffset > declaredFileSize) addCorrupt(result, 'bfOffBits выходит за объявленный bfSize')
  if (pixelOffset > reader.size) addCorrupt(result, 'Смещение пиксельных данных выходит за размер файла')
  if (dibSize < 12 || 14 + dibSize > reader.size) {
    addCorrupt(result, 'DIB-заголовок выходит за размер файла')
    return result
  }

  if (dibSize === 12) {
    result.width = view.getUint16(18, true)
    result.height = view.getUint16(20, true)
    const planes = view.getUint16(22, true)
    const bpp = view.getUint16(24, true)
    result.colorDepth = bpp
    result.compression = 'Без сжатия (OS/2 CORE)'
    result.details['Плоскости'] = planes
    result.details['Палитра'] = bpp <= 8 ? `${2 ** bpp} цветов, записи RGB по 3 байта` : 'Не используется'

    if (!result.width || !result.height) addCorrupt(result, 'Нулевая ширина или высота BMP')
    if (planes !== 1) addCorrupt(result, `Некорректное число плоскостей: ${planes}`)

    const paletteBytes = bpp <= 8 ? (2 ** bpp) * 3 : 0
    const minimumPixelOffset = 14 + dibSize + paletteBytes
    if (pixelOffset < minimumPixelOffset) addCorrupt(result, 'Палитра BMP не помещается до начала пиксельных данных')

    const expectedBytes = expectedUncompressedBytes(result.width, result.height, bpp)
    if (expectedBytes != null && pixelOffset + expectedBytes > reader.size) addCorrupt(result, 'BMP короче минимального размера несжатого растра')
    return result
  }

  if (dibSize < 40) {
    addCorrupt(result, `Неподдерживаемый или поврежденный DIB-заголовок (${dibSize} байт)`)
    return result
  }

  if (reader.size < 54) {
    addCorrupt(result, 'Неполный BITMAPINFOHEADER')
    return result
  }

  const needed = 14 + Math.min(dibSize, 124)
  const header = first.length >= needed ? first : await reader.read(0, needed)
  const dv = viewOf(header)
  const width = dv.getInt32(18, true)
  const signedHeight = dv.getInt32(22, true)
  const planes = dv.getUint16(26, true)
  const bpp = dv.getUint16(28, true)
  const compressionCode = dv.getUint32(30, true)
  const imageSize = dv.getUint32(34, true)
  const xPpm = dv.getInt32(38, true)
  const yPpm = dv.getInt32(42, true)
  const colorsUsed = dv.getUint32(46, true)

  result.width = width > 0 ? width : Math.abs(width)
  result.height = Math.abs(signedHeight)
  result.colorDepth = bpp
  result.compression = COMPRESSION[compressionCode] ?? `Неизвестный код (${compressionCode})`
  result.dpiX = formatDpiValue(toDpiFromPixelsPerMeter(xPpm))
  result.dpiY = formatDpiValue(toDpiFromPixelsPerMeter(yPpm))
  result.details['Плоскости'] = planes
  result.details['Ориентация'] = signedHeight < 0 ? 'Сверху вниз (top-down)' : 'Снизу вверх (bottom-up)'
  result.details['Размер пиксельных данных'] = imageSize ? `${imageSize} байт` : '0 (допустимо для несжатых BMP)'

  if (width <= 0 || signedHeight === 0) addCorrupt(result, 'Некорректная ширина или высота BMP')
  if (planes !== 1) addCorrupt(result, `Некорректное число плоскостей: ${planes}`)
  if (![1, 2, 4, 8, 16, 24, 32].includes(bpp) && ![4, 5].includes(compressionCode)) addWarning(result, `Необычная глубина цвета BMP: ${bpp} бит/пиксель`)
  if (pixelOffset < 14 + dibSize) addCorrupt(result, 'bfOffBits указывает внутрь заголовка BMP')
  if (xPpm < 0 || yPpm < 0) addWarning(result, 'BMP содержит отрицательное значение pixels-per-meter')

  if (compressionCode === 1 && bpp !== 8) addCorrupt(result, 'BI_RLE8 допустим только для 8-битного BMP')
  if (compressionCode === 2 && bpp !== 4) addCorrupt(result, 'BI_RLE4 допустим только для 4-битного BMP')
  if ((compressionCode === 3 || compressionCode === 6) && ![16, 32].includes(bpp)) addCorrupt(result, 'BI_BITFIELDS/BI_ALPHABITFIELDS ожидает 16 или 32 бит/пиксель')
  if (dibSize === 40 && (compressionCode === 3 || compressionCode === 6)) {
    const maskBytes = compressionCode === 6 ? 16 : 12
    if (pixelOffset < 14 + dibSize + maskBytes) addCorrupt(result, 'Bitfield-маски BMP не помещаются до начала пиксельных данных')
  }
  if (signedHeight < 0 && [1, 2, 12, 13].includes(compressionCode)) addCorrupt(result, 'RLE-сжатый BMP не может иметь top-down ориентацию')

  if (imageSize && pixelOffset + imageSize > reader.size) addCorrupt(result, 'Пиксельные данные по biSizeImage выходят за размер файла')

  if ([0, 3, 6].includes(compressionCode)) {
    const expectedBytes = expectedUncompressedBytes(result.width, result.height, bpp)
    if (expectedBytes != null) {
      result.details['Минимальный размер несжатого растра'] = `${expectedBytes} байт`
      if (pixelOffset + expectedBytes > reader.size) addCorrupt(result, 'BMP короче минимального размера несжатого растра')
    }
  }

  let paletteColors = 0
  if (bpp <= 8) paletteColors = colorsUsed || 2 ** bpp
  if (paletteColors > 2 ** Math.min(bpp, 8)) addCorrupt(result, 'biClrUsed превышает число цветов, доступное для заданной глубины')

  if (paletteColors) {
    result.details['Палитра'] = `${paletteColors} цветов, записи BGR0 по 4 байта`
    const paletteStart = 14 + dibSize
    const paletteEnd = paletteStart + paletteColors * 4
    if (paletteEnd > reader.size || pixelOffset < paletteEnd) addCorrupt(result, 'Палитра BMP не помещается до начала пиксельных данных')
  } else {
    result.details['Палитра'] = 'Не используется'
  }

  return result
}
