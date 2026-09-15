import { addCorrupt, addWarning, createBaseResult, viewOf } from './common.js'

async function validateRleData(reader, start, end, expectedDecodedBytes, result) {
  const maxEncodedBytesToScan = 2 * 1024 * 1024
  let position = start
  let decoded = 0
  let scanned = 0
  let pendingRun = null

  while (position < end && decoded < expectedDecodedBytes && scanned < maxEncodedBytesToScan) {
    const length = Math.min(65536, end - position, maxEncodedBytesToScan - scanned)
    const bytes = await reader.read(position, length)
    position += length
    scanned += length
    let i = 0

    if (pendingRun != null) {
      if (!bytes.length) break
      decoded += pendingRun
      pendingRun = null
      i = 1
    }

    while (i < bytes.length && decoded < expectedDecodedBytes) {
      const value = bytes[i]
      i += 1
      if ((value & 0xc0) === 0xc0) {
        const run = value & 0x3f
        if (run === 0) {
          addCorrupt(result, 'PCX RLE содержит маркер серии нулевой длины')
          return
        }
        if (i >= bytes.length) {
          pendingRun = run
          break
        }
        i += 1
        decoded += run
      } else {
        decoded += 1
      }
    }
  }

  if (position >= end && pendingRun != null) addCorrupt(result, 'PCX RLE обрывается после маркера серии')
  if (position >= end && decoded < expectedDecodedBytes) {
    addCorrupt(result, `PCX RLE содержит недостаточно растровых данных: декодируется ${decoded} из ${expectedDecodedBytes} байт`)
  } else if (decoded >= expectedDecodedBytes) {
    result.details['Проверка RLE'] = `Поток достаточен для ${expectedDecodedBytes} байт растра`
  } else {
    result.details['Проверка RLE'] = `Проверены первые ${scanned} байт сжатого потока; полный проход ограничен ради быстродействия`
  }
}

export async function parsePcx(reader) {
  const result = createBaseResult('PCX')
  if (reader.size < 128) {
    addCorrupt(result, 'Файл слишком мал для 128-байтового заголовка PCX')
    return result
  }

  const header = await reader.read(0, 128)
  const view = viewOf(header)
  const manufacturer = header[0]
  const version = header[1]
  const encoding = header[2]
  const bitsPerPlane = header[3]
  const xMin = view.getUint16(4, true)
  const yMin = view.getUint16(6, true)
  const xMax = view.getUint16(8, true)
  const yMax = view.getUint16(10, true)
  const hDpi = view.getUint16(12, true)
  const vDpi = view.getUint16(14, true)
  const planes = header[65]
  const bytesPerLine = view.getUint16(66, true)
  const paletteInfo = view.getUint16(68, true)

  if (manufacturer !== 0x0a) addCorrupt(result, 'Неверный Manufacturer PCX (ожидается 0x0A)')
  if (xMax < xMin || yMax < yMin) addCorrupt(result, 'Некорректные координаты границ PCX')

  result.width = xMax >= xMin ? xMax - xMin + 1 : null
  result.height = yMax >= yMin ? yMax - yMin + 1 : null
  result.dpiX = hDpi || null
  result.dpiY = vDpi || null
  result.colorDepth = bitsPerPlane * planes
  result.compression = encoding === 1 ? 'PCX RLE' : encoding === 0 ? 'Без сжатия' : `Неизвестный encoding (${encoding})`
  result.details['Версия PCX'] = version
  result.details['Бит на плоскость'] = bitsPerPlane
  result.details['Цветовых плоскостей'] = planes
  result.details['BytesPerLine'] = bytesPerLine
  result.details['PaletteInfo'] = paletteInfo === 1 ? 'Цветное / монохромное' : paletteInfo === 2 ? 'Grayscale' : `Код ${paletteInfo}`

  if (![0, 2, 3, 4, 5].includes(version)) addWarning(result, `Необычная версия PCX: ${version}`)
  if (![0, 1].includes(encoding)) addCorrupt(result, `Недопустимый PCX encoding: ${encoding}`)
  if (![1, 2, 4, 8].includes(bitsPerPlane)) addCorrupt(result, `Недопустимое BitsPerPixel на плоскость: ${bitsPerPlane}`)
  if (!planes) addCorrupt(result, 'PCX содержит 0 цветовых плоскостей')
  if (!result.width || !result.height) addCorrupt(result, 'PCX содержит некорректные размеры')
  if (!bytesPerLine) addCorrupt(result, 'PCX содержит BytesPerLine = 0')
  if (bytesPerLine % 2 !== 0) addWarning(result, 'BytesPerLine PCX обычно должен быть четным')

  if (result.width && bitsPerPlane && bytesPerLine) {
    const minBytesPerLine = Math.ceil((result.width * bitsPerPlane) / 8)
    if (bytesPerLine < minBytesPerLine) addCorrupt(result, 'BytesPerLine меньше минимально необходимого значения')
  }

  let rasterEnd = reader.size
  if (bitsPerPlane === 8 && planes === 1) {
    if (reader.size >= 769) {
      const markerOffset = reader.size - 769
      const marker = (await reader.read(markerOffset, 1))[0]
      if (marker === 0x0c) {
        result.details['Палитра'] = '256 цветов в конце файла'
        rasterEnd = markerOffset
      } else {
        addWarning(result, 'Для 8-bit PCX не найден маркер 256-цветной палитры 0x0C в конце файла')
      }
    } else {
      addWarning(result, 'Файл слишком мал для стандартной 256-цветной палитры 8-bit PCX')
    }
  } else if (result.colorDepth <= 4) {
    result.details['Палитра'] = `${2 ** result.colorDepth} цветов из 16-цветной палитры заголовка`
  } else {
    result.details['Палитра'] = 'Планарное truecolor / не требуется'
  }

  if (result.height && bytesPerLine && planes) {
    const expectedDecodedBytes = bytesPerLine * planes * result.height
    const availableRasterBytes = Math.max(0, rasterEnd - 128)
    result.details['Ожидаемый растр'] = `${expectedDecodedBytes} декодированных байт`

    if (encoding === 0 && availableRasterBytes < expectedDecodedBytes) {
      addCorrupt(result, `PCX содержит ${availableRasterBytes} байт растра вместо минимум ${expectedDecodedBytes}`)
    }

    if (encoding === 1) {
      const fullRuns = Math.floor(expectedDecodedBytes / 63)
      const remainder = expectedDecodedBytes % 63
      const absoluteMinimumEncoded = fullRuns * 2 + (remainder === 0 ? 0 : remainder === 1 ? 1 : 2)
      if (availableRasterBytes < absoluteMinimumEncoded) {
        addCorrupt(result, 'PCX RLE физически слишком короток для заявленных размеров изображения')
      } else if (availableRasterBytes > 0) {
        await validateRleData(reader, 128, rasterEnd, expectedDecodedBytes, result)
      }
    }
  }

  return result
}
