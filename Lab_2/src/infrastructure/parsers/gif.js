import { addCorrupt, addWarning, ascii, createBaseResult, viewOf } from './common.js'

async function skipExtensionSubBlocks(reader, offset, result, context, maxPayloadBytes = 131072) {
  let payloadBytes = 0
  let blocks = 0

  while (offset < reader.size && blocks < 4096 && payloadBytes <= maxPayloadBytes) {
    const size = (await reader.read(offset, 1))[0]
    offset += 1
    if (size === 0) return { offset, ended: true, limited: false }
    if (offset + size > reader.size) {
      addCorrupt(result, `${context}: подблок выходит за размер файла`)
      return { offset: reader.size, ended: false, limited: false }
    }
    payloadBytes += size
    offset += size
    blocks += 1
  }

  if (payloadBytes > maxPayloadBytes || blocks >= 4096) return { offset, ended: false, limited: true }
  addCorrupt(result, `${context}: отсутствует завершающий подблок нулевой длины`)
  return { offset, ended: false, limited: false }
}

export async function parseGif(reader) {
  const result = createBaseResult('GIF')
  if (reader.size < 14) {
    addCorrupt(result, 'Файл слишком мал для корректного GIF')
    return result
  }

  const header = await reader.read(0, 13)
  const signature = ascii(header, 0, 6)
  if (signature !== 'GIF87a' && signature !== 'GIF89a') {
    addCorrupt(result, 'Неверная сигнатура GIF')
    return result
  }

  const view = viewOf(header)
  result.width = view.getUint16(6, true)
  result.height = view.getUint16(8, true)
  const packed = header[10]
  const gctFlag = (packed & 0x80) !== 0
  const colorResolution = ((packed >> 4) & 0x07) + 1
  const sortFlag = (packed & 0x08) !== 0
  const gctBits = (packed & 0x07) + 1
  const gctColors = gctFlag ? 2 ** gctBits : 0

  result.colorDepth = gctFlag ? gctBits : colorResolution
  result.compression = 'LZW'
  result.details['Версия'] = signature
  result.details['Color resolution'] = `${colorResolution} бит на основной цвет`
  result.details['Глобальная палитра'] = gctFlag ? `${gctColors} цветов` : 'Нет'
  result.details['Сортировка глобальной палитры'] = sortFlag ? 'Задана' : 'Нет'
  result.details['Физическое разрешение'] = 'Стандарт GIF не содержит отдельного поля DPI'

  if (!result.width || !result.height) addCorrupt(result, 'GIF содержит нулевую ширину или высоту')

  let offset = 13 + gctColors * 3
  if (offset > reader.size) {
    addCorrupt(result, 'Глобальная палитра GIF выходит за размер файла')
    return result
  }

  let transparent = false
  let foundFirstFrame = false
  let metadataScanLimited = false
  let steps = 0

  while (offset < reader.size && steps < 4096 && !foundFirstFrame) {
    const introducer = (await reader.read(offset, 1))[0]

    if (introducer === 0x2c) {
      if (offset + 10 > reader.size) {
        addCorrupt(result, 'Неполный Image Descriptor GIF')
        break
      }

      const descriptor = await reader.read(offset, 10)
      const dv = viewOf(descriptor)
      const left = dv.getUint16(1, true)
      const top = dv.getUint16(3, true)
      const width = dv.getUint16(5, true)
      const height = dv.getUint16(7, true)
      const imagePacked = descriptor[9]
      const localFlag = (imagePacked & 0x80) !== 0
      const interlaced = (imagePacked & 0x40) !== 0
      const localBits = (imagePacked & 0x07) + 1
      const localColors = localFlag ? 2 ** localBits : 0

      if (!width || !height) addCorrupt(result, 'Первый GIF-кадр содержит нулевой размер')
      if (left + width > result.width || top + height > result.height) addWarning(result, 'Первый GIF-кадр выходит за Logical Screen')
      if (!gctFlag && !localFlag) addCorrupt(result, 'Первый GIF-кадр не имеет доступной цветовой таблицы')

      offset += 10
      if (localFlag) {
        const localBytes = localColors * 3
        if (offset + localBytes > reader.size) {
          addCorrupt(result, 'Локальная палитра первого GIF-кадра выходит за размер файла')
          break
        }
        offset += localBytes
        result.details['Локальная палитра первого кадра'] = `${localColors} цветов`
      }

      if (offset >= reader.size) {
        addCorrupt(result, 'У первого GIF-кадра отсутствует LZW Minimum Code Size')
        break
      }

      const lzwMinimumCodeSize = (await reader.read(offset, 1))[0]
      offset += 1
      if (lzwMinimumCodeSize < 2 || lzwMinimumCodeSize > 8) addCorrupt(result, `Недопустимый LZW Minimum Code Size ${lzwMinimumCodeSize}`)

      if (offset >= reader.size) {
        addCorrupt(result, 'У первого GIF-кадра отсутствуют image data sub-blocks')
        break
      }
      const firstDataBlockSize = (await reader.read(offset, 1))[0]
      if (firstDataBlockSize === 0) addCorrupt(result, 'Первый GIF-кадр содержит пустой поток LZW-данных')
      if (offset + 1 + firstDataBlockSize > reader.size) addCorrupt(result, 'Первый image data sub-block GIF выходит за размер файла')

      result.colorDepth = localFlag ? localBits : gctFlag ? gctBits : colorResolution
      result.details['Первый кадр'] = `${width} × ${height} px, позиция ${left},${top}`
      result.details['Первый кадр чересстрочный'] = interlaced ? 'Да' : 'Нет'
      result.details['LZW Minimum Code Size'] = `${lzwMinimumCodeSize} бит`
      foundFirstFrame = true
    } else if (introducer === 0x21) {
      if (offset + 2 > reader.size) {
        addCorrupt(result, 'Неполный extension-блок GIF')
        break
      }

      const label = (await reader.read(offset + 1, 1))[0]
      if (label === 0xf9) {
        if (offset + 3 > reader.size) {
          addCorrupt(result, 'Неполный Graphic Control Extension GIF')
          break
        }
        const blockSize = (await reader.read(offset + 2, 1))[0]
        if (blockSize === 4 && offset + 8 <= reader.size) {
          const gce = await reader.read(offset, 8)
          if (gce[7] !== 0) addCorrupt(result, 'Graphic Control Extension не завершен нулевым байтом')
          if ((gce[3] & 0x01) !== 0) transparent = true
          offset += 8
        } else {
          addCorrupt(result, `Graphic Control Extension имеет неверный размер ${blockSize}`)
          const skipped = await skipExtensionSubBlocks(reader, offset + 2, result, 'Graphic Control Extension GIF')
          offset = skipped.offset
          if (skipped.limited) {
            addWarning(result, 'Длинная GIF extension-цепочка не просканирована полностью ради быстродействия')
            metadataScanLimited = true
            break
          }
        }
      } else {
        const skipped = await skipExtensionSubBlocks(reader, offset + 2, result, `GIF extension 0x${label.toString(16).padStart(2, '0')}`)
        offset = skipped.offset
        if (skipped.limited) {
          addWarning(result, 'Длинная GIF extension-цепочка не просканирована полностью ради быстродействия')
          metadataScanLimited = true
          break
        }
      }
    } else if (introducer === 0x3b) {
      addCorrupt(result, 'GIF завершился до первого Image Descriptor')
      break
    } else {
      addCorrupt(result, `Неожиданный блок GIF 0x${introducer.toString(16).padStart(2, '0')}`)
      break
    }

    steps += 1
  }

  if (steps >= 4096) {
    addWarning(result, 'Обход GIF остановлен после 4096 блоков ради быстродействия')
    metadataScanLimited = true
  }
  if (!foundFirstFrame && !metadataScanLimited) addCorrupt(result, 'GIF не содержит корректного первого Image Descriptor')

  const last = (await reader.read(reader.size - 1, 1))[0]
  if (last !== 0x3b) addCorrupt(result, 'В конце GIF отсутствует Trailer 0x3B')

  result.details['Прозрачность'] = transparent ? 'Есть (Graphic Control Extension)' : 'Не обнаружена до первого кадра'
  result.details['Потоковое чтение'] = 'После метаданных первого кадра LZW-поток целиком не читается'
  return result
}
