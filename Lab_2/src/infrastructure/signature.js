import { ascii } from './parsers/common.js'

export async function detectFormat(reader) {
  if (reader.size < 1) return null
  const size = Math.min(reader.size, 16)
  const bytes = await reader.read(0, size)

  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'PNG'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'JPEG'
  if (bytes.length >= 6) {
    const sig = ascii(bytes, 0, 6)
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'GIF'
  }
  if (bytes.length >= 4 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'BMP'
  if (bytes.length >= 4 && ((bytes[0] === 0x49 && bytes[1] === 0x49 && (bytes[2] === 0x2a || bytes[2] === 0x2b) && bytes[3] === 0x00) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && (bytes[3] === 0x2a || bytes[3] === 0x2b)))) return 'TIFF'
  if (bytes.length >= 4 && bytes[0] === 0x0a && bytes[1] <= 5 && (bytes[2] === 0 || bytes[2] === 1) && [1, 2, 4, 8].includes(bytes[3])) return 'PCX'
  return null
}

export function extensionToFormat(name) {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'jpg' || ext === 'jpeg') return 'JPEG'
  if (ext === 'gif') return 'GIF'
  if (ext === 'tif' || ext === 'tiff') return 'TIFF'
  if (ext === 'bmp') return 'BMP'
  if (ext === 'png') return 'PNG'
  if (ext === 'pcx') return 'PCX'
  return null
}
