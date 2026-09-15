export class RangeReader {
  constructor(blob, { chunkSize = 65536, maxCachedChunks = 6 } = {}) {
    this.blob = blob
    this.chunkSize = chunkSize
    this.maxCachedChunks = maxCachedChunks
    this.cache = new Map()
    this.bytesRead = 0
  }

  get size() {
    return this.blob.size
  }

  async read(offset, length) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
      throw new RangeError('Invalid read range')
    }
    if (length === 0) return new Uint8Array(0)
    if (offset + length > this.size) throw new RangeError('Read exceeds file size')

    if (length > this.chunkSize) {
      const buffer = await this.blob.slice(offset, offset + length).arrayBuffer()
      this.bytesRead += length
      return new Uint8Array(buffer)
    }

    const firstChunk = Math.floor(offset / this.chunkSize)
    const lastChunk = Math.floor((offset + length - 1) / this.chunkSize)

    if (firstChunk === lastChunk) {
      const chunk = await this.#getChunk(firstChunk)
      const start = offset - firstChunk * this.chunkSize
      return chunk.subarray(start, start + length)
    }

    const result = new Uint8Array(length)
    let written = 0
    let currentOffset = offset
    while (written < length) {
      const chunkIndex = Math.floor(currentOffset / this.chunkSize)
      const chunk = await this.#getChunk(chunkIndex)
      const chunkStart = currentOffset - chunkIndex * this.chunkSize
      const available = Math.min(chunk.length - chunkStart, length - written)
      result.set(chunk.subarray(chunkStart, chunkStart + available), written)
      written += available
      currentOffset += available
    }
    return result
  }

  async #getChunk(index) {
    if (this.cache.has(index)) {
      const value = this.cache.get(index)
      this.cache.delete(index)
      this.cache.set(index, value)
      return value
    }

    const start = index * this.chunkSize
    const end = Math.min(this.size, start + this.chunkSize)
    const buffer = await this.blob.slice(start, end).arrayBuffer()
    const value = new Uint8Array(buffer)
    this.bytesRead += value.length
    this.cache.set(index, value)

    while (this.cache.size > this.maxCachedChunks) {
      const oldestKey = this.cache.keys().next().value
      this.cache.delete(oldestKey)
    }
    return value
  }

  clear() {
    this.cache.clear()
  }
}
