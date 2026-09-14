(function (root) {
  const Lab = root.ColorLab = root.ColorLab || {};
  const M = Lab.MathUtil;

  function decodeSrgbChannel(encoded) {
    const x = encoded / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  }

  function encodeSrgbChannel(linear) {
    const encoded = linear <= 0.0031308
      ? 12.92 * linear
      : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    return encoded * 255;
  }

  function rgbToXyz(rgb, illuminantName) {
    const matrices = Lab.Illuminants.calculateRgbXyzMatrices(illuminantName);
    const linearRgb = rgb.map(decodeSrgbChannel);
    return M.multiplyMatrixVector(matrices.rgbToXyz, linearRgb).map((value) => value * 100);
  }

  function xyzToRgbRaw(xyz, illuminantName) {
    const matrices = Lab.Illuminants.calculateRgbXyzMatrices(illuminantName);
    const normalizedXyz = xyz.map((value) => value / 100);
    const linearRgb = M.multiplyMatrixVector(matrices.xyzToRgb, normalizedXyz);
    return linearRgb.map(encodeSrgbChannel);
  }

  function xyzToRgb(xyz, illuminantName, gamutStrategy) {
    const raw = xyzToRgbRaw(xyz, illuminantName);
    return Lab.Gamut.mapRgb(raw, gamutStrategy || 'clipping');
  }

  Lab.RgbXyz = {
    decodeSrgbChannel,
    encodeSrgbChannel,
    rgbToXyz,
    xyzToRgbRaw,
    xyzToRgb
  };
})(globalThis);
