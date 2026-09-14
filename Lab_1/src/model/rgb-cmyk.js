(function (root) {
  const Lab = root.ColorLab = root.ColorLab || {};
  const M = Lab.MathUtil;

  function cmykToRgb(cmyk) {
    const c = M.clamp(cmyk[0] / 100, 0, 1);
    const m = M.clamp(cmyk[1] / 100, 0, 1);
    const y = M.clamp(cmyk[2] / 100, 0, 1);
    const k = M.clamp(cmyk[3] / 100, 0, 1);
    return [
      255 * (1 - c) * (1 - k),
      255 * (1 - m) * (1 - k),
      255 * (1 - y) * (1 - k)
    ];
  }

  function blackForGcr(c, m, y) {
    return Math.min(c, m, y);
  }

  function blackForUcr(c, m, y, shadowThreshold) {
    const neutral = Math.min(c, m, y);
    const threshold = M.clamp(shadowThreshold == null ? 0.5 : shadowThreshold, 0, 0.95);
    if (neutral <= threshold) {
      return 0;
    }
    return M.clamp((neutral - threshold) / (1 - threshold), 0, neutral);
  }

  function separateCmy(c, m, y, k) {
    if (k >= 1 - 1e-12) {
      return [0, 0, 0, 1];
    }
    return [
      (c - k) / (1 - k),
      (m - k) / (1 - k),
      (y - k) / (1 - k),
      k
    ];
  }

  function rgbToCmyk(rgb, algorithm, ucrShadowThreshold) {
    const r = M.clamp(rgb[0] / 255, 0, 1);
    const g = M.clamp(rgb[1] / 255, 0, 1);
    const b = M.clamp(rgb[2] / 255, 0, 1);
    const c0 = 1 - r;
    const m0 = 1 - g;
    const y0 = 1 - b;
    const k = algorithm === 'ucr'
      ? blackForUcr(c0, m0, y0, ucrShadowThreshold)
      : blackForGcr(c0, m0, y0);
    return separateCmy(c0, m0, y0, k).map((value) => value * 100);
  }

  Lab.RgbCmyk = {
    cmykToRgb,
    rgbToCmyk,
    blackForGcr,
    blackForUcr,
    separateCmy
  };
})(globalThis);
