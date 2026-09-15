import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseImageFile } from '../src/infrastructure/parse-file.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.join(here, 'fixtures')

async function fixture(name, fileName = name) {
  const bytes = await fs.readFile(path.join(fixtures, name))
  return new File([bytes], fileName)
}

async function parseFixture(name, fileName = name) {
  return parseImageFile(await fixture(name, fileName))
}

function copyBytes(buffer) {
  return Uint8Array.from(buffer)
}

const expected = [
  ['test.jpg', 'JPEG', 8, 6],
  ['test.png', 'PNG', 8, 6],
  ['test.gif', 'GIF', 8, 6],
  ['test.tiff', 'TIFF', 8, 6],
  ['test.bmp', 'BMP', 8, 6],
  ['test.pcx', 'PCX', 8, 6]
]

for (const [name, format, width, height] of expected) {
  const result = await parseFixture(name)
  assert.equal(result.status, 'ok', `${name} should be valid: ${result.corruptReasons.join('; ')}`)
  assert.equal(result.actualFormat, format)
  assert.equal(result.width, width)
  assert.equal(result.height, height)
  assert.ok(result.bytesRead > 0)
}

{
  const result = await parseFixture('multi.tiff')
  assert.equal(result.status, 'ok')
  assert.equal(result.details['IFD в цепочке'], 2)
  assert.match(result.details['Размеры IFD-страниц'], /0: 8×6; 1: 4×3/)
}

{
  const bytes = copyBytes(await fs.readFile(path.join(fixtures, 'test.jpg')))
  const truncated = bytes.subarray(0, bytes.length - 2)
  const result = await parseImageFile(new File([truncated], 'broken.jpg'))
  assert.equal(result.status, 'corrupt')
  assert.ok(result.corruptReasons.some(message => message.includes('EOI')))
}

{
  const bytes = copyBytes(await fs.readFile(path.join(fixtures, 'test.png')))
  const truncated = bytes.subarray(0, bytes.length - 12)
  const result = await parseImageFile(new File([truncated], 'broken.png'))
  assert.equal(result.status, 'corrupt')
  assert.ok(result.corruptReasons.some(message => message.includes('IEND')))
}

{
  const bytes = copyBytes(await fs.readFile(path.join(fixtures, 'test.png')))
  bytes[29] ^= 0x01
  const result = await parseImageFile(new File([bytes], 'bad-crc.png'))
  assert.equal(result.status, 'corrupt')
  assert.ok(result.corruptReasons.some(message => message.includes('CRC чанка IHDR')))
}

{
  const bytes = copyBytes(await fs.readFile(path.join(fixtures, 'test.gif')))
  const truncated = bytes.subarray(0, bytes.length - 1)
  const result = await parseImageFile(new File([truncated], 'broken.gif'))
  assert.equal(result.status, 'corrupt')
  assert.ok(result.corruptReasons.some(message => message.includes('Trailer')))
}

{
  const bytes = copyBytes(await fs.readFile(path.join(fixtures, 'test.bmp')))
  const declared = bytes.length + 500
  bytes[2] = declared & 0xff
  bytes[3] = (declared >>> 8) & 0xff
  bytes[4] = (declared >>> 16) & 0xff
  bytes[5] = (declared >>> 24) & 0xff
  const result = await parseImageFile(new File([bytes], 'broken.bmp'))
  assert.equal(result.status, 'corrupt')
  assert.ok(result.corruptReasons.some(message => message.includes('bfSize')))
}

{
  const bytes = copyBytes(await fs.readFile(path.join(fixtures, 'test.pcx')))
  const truncated = bytes.subarray(0, 130)
  const result = await parseImageFile(new File([truncated], 'broken.pcx'))
  assert.equal(result.status, 'corrupt')
  assert.ok(result.corruptReasons.some(message => message.includes('RLE')))
}

{
  const result = await parseImageFile(new File([new TextEncoder().encode('not an image')], 'fake.jpg'))
  assert.equal(result.status, 'corrupt')
  assert.equal(result.actualFormat, null)
}

{
  const result = await parseFixture('test.png', 'renamed.jpg')
  assert.equal(result.status, 'warning')
  assert.equal(result.actualFormat, 'PNG')
  assert.equal(result.expectedFormat, 'JPEG')
  assert.ok(result.warnings.some(message => message.includes('Расширение указывает')))
}

{
  const bytes = copyBytes(await fs.readFile(path.join(fixtures, 'test.tiff')))
  const firstIfd = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)
  const entryCount = bytes[firstIfd] | (bytes[firstIfd + 1] << 8)
  const nextOffsetPosition = firstIfd + 2 + entryCount * 12
  bytes[nextOffsetPosition] = firstIfd & 0xff
  bytes[nextOffsetPosition + 1] = (firstIfd >>> 8) & 0xff
  bytes[nextOffsetPosition + 2] = (firstIfd >>> 16) & 0xff
  bytes[nextOffsetPosition + 3] = (firstIfd >>> 24) & 0xff
  const result = await parseImageFile(new File([bytes], 'cycle.tiff'))
  assert.equal(result.status, 'corrupt')
  assert.ok(result.corruptReasons.some(message => message.includes('цикл')))
}

{
  const bytes = Uint8Array.from([
    0x49, 0x49, 0x2b, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x10, 0x00, 0x00, 0x00
  ])
  const result = await parseImageFile(new File([bytes], 'sample.tiff'))
  assert.equal(result.status, 'warning')
  assert.equal(result.actualFormat, 'TIFF')
  assert.ok(result.warnings.some(message => message.includes('BigTIFF')))
}

console.log('All parser tests passed')
