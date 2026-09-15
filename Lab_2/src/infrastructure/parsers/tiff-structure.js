import { ascii, viewOf } from './common.js'

const TYPE_SIZES = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8
}

function readScalar(view, offset, type, little) {
  switch (type) {
    case 1: case 2: case 7: return view.getUint8(offset)
    case 3: return view.getUint16(offset, little)
    case 4: return view.getUint32(offset, little)
    case 6: return view.getInt8(offset)
    case 8: return view.getInt16(offset, little)
    case 9: return view.getInt32(offset, little)
    case 11: return view.getFloat32(offset, little)
    case 12: return view.getFloat64(offset, little)
    default: return null
  }
}

async function readTypedValues(reader, baseOffset, limitOffset, valueOffset, type, count, little, inlineBytes) {
  const size = TYPE_SIZES[type]
  if (!size || count > 1_000_000) return { values: [], invalid: true }

  const total = size * count
  let bytes
  if (total <= 4 && inlineBytes) {
    bytes = inlineBytes.subarray(0, total)
  } else {
    const absolute = baseOffset + valueOffset
    if (!Number.isSafeInteger(absolute) || !Number.isSafeInteger(total) || absolute < baseOffset || absolute + total > limitOffset || absolute + total > reader.size) {
      return { values: [], invalid: true }
    }
    bytes = await reader.read(absolute, total)
  }

  const view = viewOf(bytes)
  const values = []
  const maxValues = Math.min(count, 4096)

  if (type === 5 || type === 10) {
    for (let i = 0; i < maxValues; i += 1) {
      const p = i * 8
      const num = type === 5 ? view.getUint32(p, little) : view.getInt32(p, little)
      const den = type === 5 ? view.getUint32(p + 4, little) : view.getInt32(p + 4, little)
      values.push(den === 0 ? null : num / den)
    }
  } else {
    for (let i = 0; i < maxValues; i += 1) values.push(readScalar(view, i * size, type, little))
  }

  return { values, invalid: false, truncated: count > maxValues }
}

async function parseHeader(reader, baseOffset, limitOffset) {
  if (baseOffset + 8 > limitOffset || baseOffset + 8 > reader.size) {
    return { validHeader: false, errors: ['Неполный TIFF-заголовок'] }
  }

  const header = await reader.read(baseOffset, 8)
  const order = ascii(header, 0, 2)
  const little = order === 'II'
  if (!little && order !== 'MM') return { validHeader: false, errors: ['Неверный порядок байтов TIFF'] }

  const view = viewOf(header)
  const magic = view.getUint16(2, little)
  if (magic !== 42) return { validHeader: false, errors: [`Неверное magic-число TIFF: ${magic}`], magic, little }

  const firstIfdOffset = view.getUint32(4, little)
  return { validHeader: true, errors: [], little, magic, firstIfdOffset }
}

async function parseIfdAt(reader, { baseOffset, limitOffset, little }, relativeOffset) {
  const errors = []
  const ifdAbsolute = baseOffset + relativeOffset

  if (!relativeOffset || relativeOffset < 8 || ifdAbsolute + 2 > limitOffset || ifdAbsolute + 2 > reader.size) {
    return {
      relativeOffset,
      entryCount: 0,
      tags: new Map(),
      nextIfdOffset: 0,
      errors: ['Смещение IFD выходит за размер файла'],
      fatal: true
    }
  }

  const countBytes = await reader.read(ifdAbsolute, 2)
  const entryCount = viewOf(countBytes).getUint16(0, little)
  if (entryCount > 4096) errors.push(`Слишком большое число IFD-записей: ${entryCount}`)

  const fullTableBytes = entryCount * 12
  const nextOffsetPosition = ifdAbsolute + 2 + fullTableBytes
  if (!Number.isSafeInteger(nextOffsetPosition) || nextOffsetPosition + 4 > limitOffset || nextOffsetPosition + 4 > reader.size) {
    errors.push('Таблица IFD выходит за размер файла')
    return { relativeOffset, entryCount, tags: new Map(), nextIfdOffset: 0, errors, fatal: true }
  }

  const safeCount = Math.min(entryCount, 4096)
  const table = safeCount ? await reader.read(ifdAbsolute + 2, safeCount * 12) : new Uint8Array(0)
  const tableView = viewOf(table)
  const tags = new Map()

  for (let i = 0; i < safeCount; i += 1) {
    const entryOffset = i * 12
    const tag = tableView.getUint16(entryOffset, little)
    const type = tableView.getUint16(entryOffset + 2, little)
    const count = tableView.getUint32(entryOffset + 4, little)
    const valueOffset = tableView.getUint32(entryOffset + 8, little)
    const inlineBytes = table.subarray(entryOffset + 8, entryOffset + 12)
    const parsed = await readTypedValues(reader, baseOffset, limitOffset, valueOffset, type, count, little, inlineBytes)

    if (parsed.invalid) {
      errors.push(`Некорректное значение TIFF-тега ${tag}: неизвестный тип или данные выходят за файл`)
      tags.set(tag, { tag, type, count, values: [], invalid: true })
    } else {
      tags.set(tag, { tag, type, count, values: parsed.values, truncated: parsed.truncated })
    }
  }

  const nextBytes = await reader.read(nextOffsetPosition, 4)
  let nextIfdOffset = viewOf(nextBytes).getUint32(0, little)
  if (nextIfdOffset) {
    const nextAbsolute = baseOffset + nextIfdOffset
    if (nextIfdOffset < 8 || nextAbsolute + 2 > limitOffset || nextAbsolute + 2 > reader.size) {
      errors.push('Смещение следующего IFD выходит за размер файла')
      nextIfdOffset = 0
    }
  }

  return { relativeOffset, entryCount, tags, nextIfdOffset, errors, fatal: false }
}

export async function parseClassicTiffIfd(reader, { baseOffset = 0, limitOffset = reader.size } = {}) {
  const header = await parseHeader(reader, baseOffset, limitOffset)
  if (!header.validHeader) return header

  const { little, firstIfdOffset } = header
  if (firstIfdOffset < 8 || baseOffset + firstIfdOffset + 2 > limitOffset || baseOffset + firstIfdOffset + 2 > reader.size) {
    return {
      validHeader: true,
      errors: ['Смещение первого IFD выходит за размер файла'],
      little,
      firstIfdOffset,
      entryCount: 0,
      tags: new Map(),
      nextIfdOffset: 0
    }
  }

  const ifd = await parseIfdAt(reader, { baseOffset, limitOffset, little }, firstIfdOffset)
  return {
    validHeader: true,
    errors: [...header.errors, ...ifd.errors],
    little,
    firstIfdOffset,
    entryCount: ifd.entryCount,
    tags: ifd.tags,
    nextIfdOffset: ifd.nextIfdOffset,
    ifdOffset: ifd.relativeOffset
  }
}

export async function parseClassicTiffIfdChain(reader, { baseOffset = 0, limitOffset = reader.size, maxIfds = 32 } = {}) {
  const header = await parseHeader(reader, baseOffset, limitOffset)
  if (!header.validHeader) return { ...header, ifds: [] }

  const errors = [...header.errors]
  const ifds = []
  const seen = new Set()
  let currentOffset = header.firstIfdOffset
  let truncatedChain = false

  while (currentOffset) {
    if (ifds.length >= maxIfds) {
      truncatedChain = true
      break
    }
    if (seen.has(currentOffset)) {
      errors.push(`Обнаружен цикл в цепочке TIFF IFD на смещении ${currentOffset}`)
      break
    }
    seen.add(currentOffset)

    const parsed = await parseIfdAt(reader, { baseOffset, limitOffset, little: header.little }, currentOffset)
    ifds.push(parsed)
    errors.push(...parsed.errors)
    if (parsed.fatal) break
    currentOffset = parsed.nextIfdOffset
  }

  return {
    validHeader: true,
    errors,
    little: header.little,
    firstIfdOffset: header.firstIfdOffset,
    ifds,
    truncatedChain,
    nextUnparsedIfdOffset: truncatedChain ? currentOffset : 0
  }
}

export function firstTagValue(parsed, tag, fallback = null) {
  const entry = parsed.tags?.get(tag)
  return entry?.values?.length ? entry.values[0] : fallback
}

export function tagValues(parsed, tag) {
  return parsed.tags?.get(tag)?.values ?? []
}
