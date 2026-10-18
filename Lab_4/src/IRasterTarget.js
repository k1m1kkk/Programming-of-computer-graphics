export class IRasterTarget {
  SetPixel(_x, _y, _intensity) {
    throw new Error('SetPixel must be implemented by the raster target');
  }
}
