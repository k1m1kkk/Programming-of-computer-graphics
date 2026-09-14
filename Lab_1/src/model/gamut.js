(function (root) {
  const Lab = root.ColorLab = root.ColorLab || {};
  const M = Lab.MathUtil;

  function isOutOfRgbGamut(rgb) {
    return rgb.some((value) => value < 0 || value > 255 || !Number.isFinite(value));
  }

  function clipRgb(rgb) {
    return rgb.map((value) => M.clamp(Number.isFinite(value) ? value : 0, 0, 255));
  }

  function scaleRgb(rgb) {
    const finite = rgb.map((value) => Number.isFinite(value) ? value : 0);
    const low = Math.min(0, ...finite);
    const high = Math.max(255, ...finite);
    if (high - low < 1e-12) {
      return [0, 0, 0];
    }
    return finite.map((value) => (value - low) * 255 / (high - low));
  }

  function mapRgb(rgb, strategy) {
    const outOfGamut = isOutOfRgbGamut(rgb);
    if (!outOfGamut) {
      return { rgb: rgb.slice(), outOfGamut: false, original: rgb.slice(), strategy };
    }
    const mapped = strategy === 'scaling' ? scaleRgb(rgb) : clipRgb(rgb);
    return { rgb: mapped, outOfGamut: true, original: rgb.slice(), strategy };
  }

  Lab.Gamut = {
    isOutOfRgbGamut,
    clipRgb,
    scaleRgb,
    mapRgb
  };
})(globalThis);
