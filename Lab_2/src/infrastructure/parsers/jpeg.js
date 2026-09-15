import { addCorrupt, addWarning, ascii, createBaseResult, formatDpiValue, viewOf } from './common.js'
import { firstTagValue, parseClassicTiffIfd } from './tiff-structure.js'

const SOF_NAMES = {
  0xc0: 'Baseline DCT, Huffman',
  0xc1: 'Extended sequential DCT, Huffman',
  0xc2: 'Progressive DCT, Huffman',
  0xc3: 'Lossless, Huffman',
  0xc5: 'Differential sequential DCT, Huffman',
  0xc6: 'Differential progressive DCT, Huffman',
  0xc7: 'Differential lossless, Huffman',
  0xc9: 'Extended sequential DCT, arithmetic',
  0xca: 'Progressive DCT, arithmetic',
  0xcb: 'Lossless, arithmetic',
  0xcd: 'Differential sequential DCT, arithmetic',
  0xce: 'Differential progressive DCT, arithmetic',
  0xcf: 'Differential lossless, arithmetic'
}

const SOF_MARKERS = new Set(Object.keys(SOF_NAMES).map(value => Number(value)))

async function readMarker(reader, offset) {
  if (offset + 2 > reader.size) return null
  const probe = await reader.read(offset, Math.min(32, reader.size - offset))
  let i = 0
  while (i < probe.length && probe[i] !== 0xff) i += 1
  if (i === probe.length) return { invalid: true, nextOffset: offset + probe.length, skipped: probe.length }
  const skipped = i
  while (i < probe.length && probe[i] === 0xff) i += 1
  if (i === probe.length) return { invalid: true, nextOffset: offset + i, skipped }
  return { marker: probe[i], markerOffset: offset + i - 1, afterMarker: offset + i + 1, skipped }
}

async function parseExifResolution(reader, dataOffset, dataLength) {
  if (dataLength < 14) return null
  const prefix = await reader.read(dataOffset, 6)
  if (ascii(prefix, 0, 6) !== 'Exif\0\0') return null
  const tiffBase = dataOffset + 6
  const parsed = await parseClassicTiffIfd(reader, { baseOffset: tiffBase, limitOffset: dataOffset + dataLength })
  if (!parsed.validHeader || parsed.errors?.length) return null
  const x = firstTagValue(parsed, 282)
  const y = firstTagValue(parsed, 283)
  const unit = firstTagValue(parsed, 296, 2)
  if (unit === 2) return { x, y }
  if (unit === 3) return { x: x == null ? null : x * 2.54, y: y == null ? null : y * 2.54 }
  return null
}

function parseDqtTables(bytes) {
  let offset = 0
  const tables = []
  let invalid = false

  while (offset < bytes.length) {
    const info = bytes[offset]
    const precisionCode = info >> 4
    const id = info & 0x0f
    const tableBytes = precisionCode === 0 ? 64 : precisionCode === 1 ? 128 : 0
    if (!tableBytes || id > 3 || offset + 1 + tableBytes > bytes.length) {
      invalid = true
      break
    }
    tables.push({ id, precision: precisionCode === 0 ? 8 : 16 })
    offset += 1 + tableBytes
  }

  return { tables, invalid: invalid || offset !== bytes.length }
}

export async function parseJpeg(reader) {
  const result = createBaseResult('JPEG')
  if (reader.size < 4) {
    addCorrupt(result, 'Файл слишком мал для JPEG')
    return result
  }

  const start = await reader.read(0, 2)
  if (start[0] !== 0xff || start[1] !== 0xd8) {
    addCorrupt(result, 'Отсутствует маркер SOI (FF D8)')
    return result
  }

  let offset = 2
  let foundSof = false
  let foundSos = false
  let jfifResolution = null
  let exifResolution = null
  const quantizationTables = []
  let markerCount = 0

  while (offset + 2 <= reader.size && markerCount < 4096) {
    const info = await readMarker(reader, offset)
    if (!info) break

    if (info.invalid) {
      addCorrupt(result, 'Между JPEG-сегментами обнаружены данные без маркера 0xFF')
      offset = info.nextOffset
      continue
    }

    if (info.skipped > 0) addCorrupt(result, `Перед JPEG-маркером обнаружено ${info.skipped} лишних байт`)

    const marker = info.marker
    offset = info.afterMarker
    markerCount += 1

    if (marker === 0xd9) break
    if (marker === 0xda) {
      foundSos = true
      if (offset + 2 > reader.size) {
        addCorrupt(result, 'Обрывается длина JPEG-сегмента SOS')
        break
      }
      const lenBytes = await reader.read(offset, 2)
      const length = viewOf(lenBytes).getUint16(0, false)
      if (length < 6 || offset + length > reader.size) addCorrupt(result, 'Некорректный сегмент SOS')
      break
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8) continue

    if (offset + 2 > reader.size) {
      addCorrupt(result, 'Обрывается длина JPEG-сегмента')
      break
    }

    const lenBytes = await reader.read(offset, 2)
    const length = viewOf(lenBytes).getUint16(0, false)
    if (length < 2) {
      addCorrupt(result, `Некорректная длина JPEG-сегмента FF${marker.toString(16).toUpperCase()}`)
      break
    }

    const dataOffset = offset + 2
    const dataLength = length - 2
    if (dataOffset + dataLength > reader.size) {
      addCorrupt(result, `JPEG-сегмент FF${marker.toString(16).toUpperCase()} выходит за размер файла`)
      break
    }

    if (marker === 0xe0 && dataLength >= 14) {
      const app0 = await reader.read(dataOffset, Math.min(dataLength, 16))
      if (ascii(app0, 0, 5) === 'JFIF\0') {
        const unit = app0[7]
        const xDensity = (app0[8] << 8) | app0[9]
        const yDensity = (app0[10] << 8) | app0[11]
        if (unit === 1) jfifResolution = { x: xDensity, y: yDensity, source: 'JFIF (dpi)' }
        else if (unit === 2) jfifResolution = { x: xDensity * 2.54, y: yDensity * 2.54, source: 'JFIF (dpcm → dpi)' }
        else if (unit !== 0) addWarning(result, `Неизвестная единица плотности JFIF: ${unit}`)
      }
    } else if (marker === 0xe1 && !exifResolution) {
      exifResolution = await parseExifResolution(reader, dataOffset, dataLength)
    } else if (marker === 0xdb) {
      const data = await reader.read(dataOffset, dataLength)
      const parsed = parseDqtTables(data)
      quantizationTables.push(...parsed.tables)
      if (parsed.invalid) addCorrupt(result, 'Некорректная структура сегмента DQT')
    } else if (SOF_MARKERS.has(marker)) {
      if (dataLength < 6) {
        addCorrupt(result, 'Слишком короткий SOF-сегмент JPEG')
      } else {
        const firstSix = await reader.read(dataOffset, 6)
        const precision = firstSix[0]
        const height = (firstSix[1] << 8) | firstSix[2]
        const width = (firstSix[3] << 8) | firstSix[4]
        const components = firstSix[5]
        const expectedLength = 6 + components * 3

        if (!components) addCorrupt(result, 'SOF содержит 0 компонентов')
        if (dataLength !== expectedLength) addCorrupt(result, `Длина SOF не соответствует числу компонентов: ${dataLength} вместо ${expectedLength}`)
        if (!precision) addCorrupt(result, 'SOF содержит нулевую точность компонента')

        result.width = width
        result.height = height
        result.colorDepth = precision * components
        result.compression = SOF_NAMES[marker]
        result.details['SOF-маркер'] = `FF${marker.toString(16).toUpperCase()} — ${SOF_NAMES[marker]}`
        result.details['Точность компонента'] = `${precision} бит`
        result.details['Компоненты'] = components

        if (dataLength >= expectedLength && expectedLength <= 1024) {
          const sof = await reader.read(dataOffset, expectedLength)
          const sampling = []
          for (let i = 0; i < components; i += 1) {
            const base = 6 + i * 3
            const id = sof[base]
            const hv = sof[base + 1]
            const h = hv >> 4
            const v = hv & 0x0f
            const table = sof[base + 2]
            if (!h || !v || h > 4 || v > 4) addCorrupt(result, `Некорректный sampling factor компонента ${id}: ${h}×${v}`)
            if (table > 3) addCorrupt(result, `Компонент ${id} ссылается на недопустимую DQT-таблицу ${table}`)
            sampling.push(`C${id}: ${h}×${v}, Q${table}`)
          }
          result.details['Sampling factors'] = sampling.join(', ')
        }

        if (foundSof) addWarning(result, 'В JPEG обнаружено несколько SOF-маркеров')
        foundSof = true
      }
    }

    offset = dataOffset + dataLength
  }

  if (markerCount >= 4096) addCorrupt(result, 'Слишком большое количество JPEG-маркеров до SOS')

  const resolution = jfifResolution ?? (exifResolution ? { ...exifResolution, source: 'EXIF TIFF-теги' } : null)
  if (resolution) {
    result.dpiX = formatDpiValue(resolution.x)
    result.dpiY = formatDpiValue(resolution.y)
    result.details['Источник DPI'] = resolution.source
  }

  result.details['Таблицы квантования DQT'] = quantizationTables.length
    ? quantizationTables.map(table => `№${table.id}, ${table.precision} бит`).join('; ')
    : 'Не найдены до SOS'
  result.details['JPEG-маркеров просмотрено'] = markerCount

  if (!foundSof) addCorrupt(result, 'Не найден SOF-маркер с геометрией изображения')
  if (!foundSos) addCorrupt(result, 'Не найден SOS-маркер с началом сжатых данных')
  if (!result.width || !result.height) addCorrupt(result, 'JPEG не содержит корректные размеры изображения')

  const tailLength = Math.min(reader.size, 131072)
  const tailStart = reader.size - tailLength
  const tail = await reader.read(tailStart, tailLength)
  let eoiIndex = -1
  for (let i = tail.length - 2; i >= 0; i -= 1) {
    if (tail[i] === 0xff && tail[i + 1] === 0xd9) {
      eoiIndex = i
      break
    }
  }

  if (eoiIndex < 0) {
    addCorrupt(result, 'В JPEG отсутствует маркер EOI (FF D9)')
  } else {
    const absoluteEoiEnd = tailStart + eoiIndex + 2
    if (absoluteEoiEnd < reader.size) addWarning(result, `После EOI обнаружено ${reader.size - absoluteEoiEnd} лишних байт`)
  }

  return result
}
