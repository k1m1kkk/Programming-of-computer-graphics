import { addCorrupt, ascii, createBaseResult, formatDpiValue, toDpiFromPixelsPerMeter, viewOf } from './common.js'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const COLOR_TYPES = {
  0: 'Grayscale',
  2: 'Truecolor RGB',
  3: 'Indexed-color',
  4: 'Grayscale + alpha',
  6: 'Truecolor RGBA'
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

async function validateChunkCrc(reader, offset, length, type, result) {
  if (!['IHDR', 'PLTE', 'pHYs', 'IEND'].includes(type) || length > 4096) return
  const payload = await reader.read(offset + 4, 4 + length)
  const storedBytes = await reader.read(offset + 8 + length, 4)
  const stored = viewOf(storedBytes).getUint32(0, false)
  const calculated = crc32(payload)
  if (stored !== calculated) addCorrupt(result, `CRC чанка ${type} не совпадает`)
}

function validChunkType(type) {
  return /^[A-Za-z]{4}$/.test(type) && type.charCodeAt(2) >= 65 && type.charCodeAt(2) <= 90
}

export async function parsePng(reader) {
  const result = createBaseResult('PNG')
  if (reader.size < 45) {
    addCorrupt(result, 'Файл слишком мал для корректного PNG с IHDR и IEND')
    return result
  }

  const head = await reader.read(0, 33)
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (head[i] !== PNG_SIGNATURE[i]) {
      addCorrupt(result, 'Неверная сигнатура PNG')
      return result
    }
  }

  const view = viewOf(head)
  const ihdrLength = view.getUint32(8, false)
  const ihdrType = ascii(head, 12, 4)
  if (ihdrType !== 'IHDR' || ihdrLength !== 13) {
    addCorrupt(result, 'Первый чанк PNG должен быть IHDR длиной 13 байт')
    return result
  }
  await validateChunkCrc(reader, 8, 13, 'IHDR', result)

  result.width = view.getUint32(16, false)
  result.height = view.getUint32(20, false)
  const bitDepth = head[24]
  const colorType = head[25]
  const compressionMethod = head[26]
  const filterMethod = head[27]
  const interlaceMethod = head[28]
  const channels = CHANNELS[colorType]

  result.colorDepth = channels ? bitDepth * channels : bitDepth
  result.compression = compressionMethod === 0 ? 'Deflate (метод 0)' : `Неизвестный метод ${compressionMethod}`
  result.details['Тип цвета'] = COLOR_TYPES[colorType] ?? `Неизвестный (${colorType})`
  result.details['Глубина компонента'] = `${bitDepth} бит`
  result.details['Фильтрация'] = filterMethod === 0 ? 'Adaptive filtering, метод 0' : `Неизвестный метод ${filterMethod}`
  result.details['Чересстрочность'] = interlaceMethod === 0 ? 'Нет' : interlaceMethod === 1 ? 'Adam7' : `Неизвестная (${interlaceMethod})`
  result.details['CRC служебных чанков'] = 'Проверяются IHDR, PLTE, pHYs и IEND'

  if (!result.width || !result.height) addCorrupt(result, 'PNG содержит нулевую ширину или высоту')
  if (![0, 2, 3, 4, 6].includes(colorType)) addCorrupt(result, `Недопустимый color type PNG: ${colorType}`)
  if (compressionMethod !== 0) addCorrupt(result, `Недопустимый compression method PNG: ${compressionMethod}`)
  if (filterMethod !== 0) addCorrupt(result, `Недопустимый filter method PNG: ${filterMethod}`)
  if (![0, 1].includes(interlaceMethod)) addCorrupt(result, `Недопустимый interlace method PNG: ${interlaceMethod}`)

  const allowedDepths = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16]
  }
  if (allowedDepths[colorType] && !allowedDepths[colorType].includes(bitDepth)) addCorrupt(result, 'Недопустимая комбинация bit depth / color type PNG')

  let offset = 33
  let hasPlte = false
  let paletteColors = null
  let foundIdat = false
  let scannedChunks = 1

  while (offset + 12 <= reader.size && scannedChunks < 10000) {
    const chunkHead = await reader.read(offset, 8)
    const chunkView = viewOf(chunkHead)
    const length = chunkView.getUint32(0, false)
    const type = ascii(chunkHead, 4, 4)
    const fullLength = 12 + length

    if (!validChunkType(type)) addCorrupt(result, `Некорректное имя PNG-чанка: ${JSON.stringify(type)}`)
    if (!Number.isSafeInteger(fullLength) || offset + fullLength > reader.size) {
      addCorrupt(result, `Чанк ${type || '?'} выходит за размер файла`)
      break
    }
    scannedChunks += 1

    if (type === 'IHDR') addCorrupt(result, 'IHDR встречается повторно')

    if (type === 'PLTE') {
      hasPlte = true
      paletteColors = Math.floor(length / 3)
      if (length % 3 !== 0 || paletteColors < 1 || paletteColors > 256) addCorrupt(result, 'Некорректная длина палитры PLTE')
      if (colorType === 3 && paletteColors > 2 ** bitDepth) addCorrupt(result, 'PLTE содержит больше цветов, чем допускает bit depth indexed PNG')
      if (colorType === 0 || colorType === 4) addCorrupt(result, 'PLTE недопустим для grayscale PNG')
      await validateChunkCrc(reader, offset, length, type, result)
    } else if (type === 'pHYs') {
      if (length !== 9) {
        addCorrupt(result, 'Чанк pHYs должен иметь длину 9 байт')
      } else {
        const data = await reader.read(offset + 8, 9)
        const dv = viewOf(data)
        const xPpm = dv.getUint32(0, false)
        const yPpm = dv.getUint32(4, false)
        const unit = data[8]
        result.details['pHYs'] = unit === 1 ? `${xPpm} × ${yPpm} пикс/м` : `${xPpm} × ${yPpm}, единица не задана`
        if (unit === 1) {
          result.dpiX = formatDpiValue(toDpiFromPixelsPerMeter(xPpm))
          result.dpiY = formatDpiValue(toDpiFromPixelsPerMeter(yPpm))
        } else if (unit !== 0) {
          addCorrupt(result, `Недопустимый unit specifier pHYs: ${unit}`)
        }
      }
      await validateChunkCrc(reader, offset, length, type, result)
    } else if (type === 'IDAT') {
      foundIdat = true
      break
    } else if (type === 'IEND') {
      addCorrupt(result, 'IEND встретился до IDAT')
      break
    }

    offset += fullLength
  }

  if (scannedChunks >= 10000) addCorrupt(result, 'Слишком большое количество PNG-чанков до IDAT')
  if (colorType === 3 && !hasPlte) addCorrupt(result, 'Indexed PNG не содержит обязательный PLTE до IDAT')
  if (hasPlte) result.details['Палитра'] = `${paletteColors} цветов`
  if (!foundIdat) addCorrupt(result, 'Не найден чанк IDAT')

  const tailOffset = reader.size - 12
  const tail = await reader.read(tailOffset, 12)
  const iendLength = viewOf(tail).getUint32(0, false)
  const iendType = ascii(tail, 4, 4)
  if (iendLength !== 0 || iendType !== 'IEND') {
    addCorrupt(result, 'В конце PNG отсутствует чанк IEND')
  } else {
    await validateChunkCrc(reader, tailOffset, 0, 'IEND', result)
  }

  result.details['PNG-чанков до IDAT'] = scannedChunks
  return result
}
