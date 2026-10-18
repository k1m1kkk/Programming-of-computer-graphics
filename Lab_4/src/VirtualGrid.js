import { IRasterTarget } from './IRasterTarget.js';

export class VirtualGrid extends IRasterTarget {
  constructor(width, height, minX = -Math.floor(width / 2), minY = -Math.floor(height / 2)) {
    super();
    if (![width, height, minX, minY].every(Number.isSafeInteger) || width < 1 || height < 1) {
      throw new RangeError('Invalid grid dimensions or origin');
    }
    this.width = width;
    this.height = height;
    this.minX = minX;
    this.minY = minY;
    this.rows = Array.from({ length: height }, () => new Float32Array(width));
    this.calls = 0;
    this.clipped = 0;
    this.touched = 0;
  }

  Clear() {
    for (const row of this.rows) row.fill(0);
    this.calls = 0;
    this.clipped = 0;
    this.touched = 0;
  }

  SetPixel(x, y, intensity = 1) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isFinite(intensity)) {
      throw new TypeError('Pixel coordinates must be integers; intensity must be finite');
    }
    this.calls++;
    const col = x - this.minX;
    const row = y - this.minY;
    if (col < 0 || col >= this.width || row < 0 || row >= this.height) {
      this.clipped++;
      return;
    }
    const alpha = Math.max(0, Math.min(1, intensity));
    if (alpha > this.rows[row][col]) {
      if (this.rows[row][col] === 0 && alpha > 0) this.touched++;
      this.rows[row][col] = alpha;
    }
  }

  GetPixel(x, y) {
    const col = x - this.minX;
    const row = y - this.minY;
    return col >= 0 && col < this.width && row >= 0 && row < this.height ? this.rows[row][col] : 0;
  }

  Points() {
    const result = [];
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        if (this.rows[row][col] > 0) {
          result.push({ x: col + this.minX, y: row + this.minY, intensity: this.rows[row][col] });
        }
      }
    }
    return result;
  }
}
