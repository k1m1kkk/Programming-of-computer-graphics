(function (root) {
  const Lab = root.ColorLab = root.ColorLab || {};

  const MODEL_META = {
    rgb: {
      title: 'RGB',
      channels: [
        { key: 'R', min: 0, max: 255, step: 0.01 },
        { key: 'G', min: 0, max: 255, step: 0.01 },
        { key: 'B', min: 0, max: 255, step: 0.01 }
      ]
    },
    cmyk: {
      title: 'CMYK',
      channels: [
        { key: 'C', min: 0, max: 100, step: 0.01 },
        { key: 'M', min: 0, max: 100, step: 0.01 },
        { key: 'Y', min: 0, max: 100, step: 0.01 },
        { key: 'K', min: 0, max: 100, step: 0.01 }
      ]
    },
    lab: {
      title: 'LAB',
      channels: [
        { key: 'L*', min: 0, max: 100, step: 0.01 },
        { key: 'a*', min: -128, max: 127, step: 0.01 },
        { key: 'b*', min: -128, max: 127, step: 0.01 }
      ]
    }
  };

  function normalizeRgb(rgb) {
    return rgb.map((value) => Lab.MathUtil.clamp(Number(value), 0, 255));
  }

  function normalizeCmyk(cmyk) {
    return cmyk.map((value) => Lab.MathUtil.clamp(Number(value), 0, 100));
  }

  function normalizeLab(lab) {
    return [
      Lab.MathUtil.clamp(Number(lab[0]), 0, 100),
      Lab.MathUtil.clamp(Number(lab[1]), -128, 127),
      Lab.MathUtil.clamp(Number(lab[2]), -128, 127)
    ];
  }

  function noGamutMapping(rgb, strategy) {
    return {
      outOfGamut: false,
      original: rgb.slice(),
      rgb: rgb.slice(),
      strategy
    };
  }

  function buildFromActualRgb(rgb, settings, gamut) {
    const xyz = Lab.RgbXyz.rgbToXyz(rgb, settings.illuminant);
    const lab = Lab.XyzLab.xyzToLab(xyz, settings.illuminant);
    const cmyk = Lab.RgbCmyk.rgbToCmyk(
      rgb,
      settings.cmykAlgorithm,
      settings.ucrShadowThreshold
    );

    return {
      rgb: rgb.slice(),
      cmyk,
      lab,
      xyz,
      gamut: gamut || noGamutMapping(rgb, settings.gamutStrategy)
    };
  }

  function fromRgb(rgb, settings) {
    const normalized = normalizeRgb(rgb);
    return buildFromActualRgb(normalized, settings);
  }

  function fromCmyk(cmyk, settings) {
    const normalized = normalizeCmyk(cmyk);
    const rgb = Lab.RgbCmyk.cmykToRgb(normalized);
    const xyz = Lab.RgbXyz.rgbToXyz(rgb, settings.illuminant);

    return {
      rgb,
      cmyk: normalized,
      lab: Lab.XyzLab.xyzToLab(xyz, settings.illuminant),
      xyz,
      gamut: noGamutMapping(rgb, settings.gamutStrategy)
    };
  }

  function fromLab(lab, settings) {
    const requestedLab = normalizeLab(lab);
    const requestedXyz = Lab.XyzLab.labToXyz(requestedLab, settings.illuminant);
    const gamut = Lab.RgbXyz.xyzToRgb(
      requestedXyz,
      settings.illuminant,
      settings.gamutStrategy
    );

    const actual = buildFromActualRgb(gamut.rgb, settings, {
      ...gamut,
      requestedLab: requestedLab.slice(),
      requestedXyz: requestedXyz.slice()
    });

    return actual;
  }

  function convert(model, values, settings) {
    if (model === 'rgb') return fromRgb(values, settings);
    if (model === 'cmyk') return fromCmyk(values, settings);
    if (model === 'lab') return fromLab(values, settings);
    throw new Error(`Unsupported model: ${model}`);
  }

  function rgbToHex(rgb) {
    return '#' + rgb
      .map((value) => Math.round(Lab.MathUtil.clamp(value, 0, 255)).toString(16).padStart(2, '0'))
      .join('');
  }

  function hexToRgb(hex) {
    const value = String(hex).replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(value)) {
      throw new Error('Invalid HEX color');
    }
    return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  }

  function xyFromXyz(xyz) {
    const sum = xyz[0] + xyz[1] + xyz[2];
    if (Math.abs(sum) < 1e-12) return [0, 0];
    return [xyz[0] / sum, xyz[1] / sum];
  }

  Lab.ColorModel = {
    MODEL_META,
    normalizeRgb,
    normalizeCmyk,
    normalizeLab,
    buildFromActualRgb,
    fromRgb,
    fromCmyk,
    fromLab,
    convert,
    rgbToHex,
    hexToRgb,
    xyFromXyz
  };
})(globalThis);
