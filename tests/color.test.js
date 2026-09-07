const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/model/math.js');
require('../src/model/illuminants.js');
require('../src/model/gamut.js');
require('../src/model/rgb-xyz.js');
require('../src/model/xyz-lab.js');
require('../src/model/rgb-cmyk.js');
require('../src/model/color-model.js');

const Lab = globalThis.ColorLab;

const DEFAULT_SETTINGS = {
  illuminant: 'D65',
  cmykAlgorithm: 'gcr',
  gamutStrategy: 'clipping',
  ucrShadowThreshold: 0.5
};

function close(actual, expected, tolerance, message) {
  assert.ok(Number.isFinite(actual), `${message}: non-finite value ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);
}

function closeVector(actual, expected, tolerance, message) {
  assert.equal(actual.length, expected.length, `${message}: vector length`);
  actual.forEach((value, index) => close(value, expected[index], tolerance, `${message}[${index}]`));
}

function assertRgbRange(rgb, message) {
  rgb.forEach((value, index) => {
    assert.ok(value >= -1e-10 && value <= 255 + 1e-10, `${message}[${index}] = ${value}`);
  });
}

test('D65 reference white matches the laboratory formula sheet', () => {
  const white = Lab.Illuminants.whitePoint('D65', 100);
  closeVector(white, [95.047, 100, 108.883], 1e-10, 'D65 white');
});

test('RGB(255, 0, 0) -> LAB under D65 matches the laboratory formula sheet', () => {
  const xyz = Lab.RgbXyz.rgbToXyz([255, 0, 0], 'D65');
  const lab = Lab.XyzLab.xyzToLab(xyz, 'D65');
  closeVector(lab, [53.2406, 80.0923, 67.2028], 0.03, 'red LAB');
});

test('RGB(255, 0, 0) -> CMYK for GCR and UCR', () => {
  const gcr = Lab.RgbCmyk.rgbToCmyk([255, 0, 0], 'gcr', 0.5);
  const ucr = Lab.RgbCmyk.rgbToCmyk([255, 0, 0], 'ucr', 0.5);
  closeVector(gcr, [0, 100, 100, 0], 1e-9, 'red GCR');
  closeVector(ucr, [0, 100, 100, 0], 1e-9, 'red UCR');
});

test('D65 matrix is calculated dynamically and agrees with supplied D65 coefficients within source rounding', () => {
  const matrix = Lab.Illuminants.calculateRgbXyzMatrices('D65').rgbToXyz;
  const supplied = [
    [0.412453, 0.357580, 0.180423],
    [0.212671, 0.715160, 0.072169],
    [0.019334, 0.119193, 0.950227]
  ];
  for (let row = 0; row < 3; row += 1) {
    closeVector(matrix[row], supplied[row], 0.0001, `D65 matrix row ${row}`);
  }
});

test('D65, D50 and E matrices are recalculated for their own white points', () => {
  const names = ['D65', 'D50', 'E'];
  const matrices = names.map((name) => Lab.Illuminants.calculateRgbXyzMatrices(name));
  assert.notDeepEqual(matrices[0].rgbToXyz, matrices[1].rgbToXyz);
  assert.notDeepEqual(matrices[1].rgbToXyz, matrices[2].rgbToXyz);

  names.forEach((name, index) => {
    const xyzWhite = Lab.MathUtil.multiplyMatrixVector(matrices[index].rgbToXyz, [1, 1, 1]);
    const expectedWhite = Lab.Illuminants.whitePoint(name, 1);
    closeVector(xyzWhite, expectedWhite, 1e-10, `${name} matrix white`);

    const labWhite = Lab.XyzLab.xyzToLab(expectedWhite.map((value) => value * 100), name);
    closeVector(labWhite, [100, 0, 0], 1e-9, `${name} LAB white`);
  });
});

test('RGB -> XYZ -> RGB round-trip works for D65, D50 and E', () => {
  ['D65', 'D50', 'E'].forEach((name) => {
    const rgb = [42.25, 137.5, 219.75];
    const xyz = Lab.RgbXyz.rgbToXyz(rgb, name);
    const raw = Lab.RgbXyz.xyzToRgbRaw(xyz, name);
    closeVector(raw, rgb, 1e-7, `${name} RGB round trip`);
  });
});

test('XYZ -> LAB -> XYZ round-trip works for D65, D50 and E', () => {
  ['D65', 'D50', 'E'].forEach((name) => {
    const white = Lab.Illuminants.whitePoint(name, 100);
    const xyz = [white[0] * 0.34, white[1] * 0.52, white[2] * 0.21];
    const lab = Lab.XyzLab.xyzToLab(xyz, name);
    const restored = Lab.XyzLab.labToXyz(lab, name);
    closeVector(restored, xyz, 1e-8, `${name} LAB round trip`);
  });
});

test('GCR and UCR are different algorithms and both preserve RGB through CMYK -> RGB', () => {
  const rgb = [35, 52, 61];
  const gcr = Lab.RgbCmyk.rgbToCmyk(rgb, 'gcr', 0.5);
  const ucr = Lab.RgbCmyk.rgbToCmyk(rgb, 'ucr', 0.5);
  assert.ok(gcr[3] > ucr[3], 'GCR must replace more gray component than UCR for this shadow color');
  closeVector(Lab.RgbCmyk.cmykToRgb(gcr), rgb, 1e-8, 'GCR round trip');
  closeVector(Lab.RgbCmyk.cmykToRgb(ucr), rgb, 1e-8, 'UCR round trip');
});

test('UCR introduces K only in deep shadows after the selected threshold', () => {
  const lightGray = Lab.RgbCmyk.rgbToCmyk([180, 180, 180], 'ucr', 0.5);
  const darkGray = Lab.RgbCmyk.rgbToCmyk([60, 60, 60], 'ucr', 0.5);
  close(lightGray[3], 0, 1e-10, 'light gray K');
  assert.ok(darkGray[3] > 0, 'dark gray must receive black ink');
});

test('Clipping and Scaling implement different gamut-mapping strategies', () => {
  const source = [-20, 120, 300];
  const clipped = Lab.Gamut.mapRgb(source, 'clipping');
  const scaled = Lab.Gamut.mapRgb(source, 'scaling');
  closeVector(clipped.rgb, [0, 120, 255], 1e-12, 'clipped');
  closeVector(scaled.rgb, [0, 111.5625, 255], 1e-10, 'scaled');
  assert.equal(clipped.outOfGamut, true);
  assert.equal(scaled.outOfGamut, true);
});

test('LAB out-of-gamut color is synchronized after Clipping', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    illuminant: 'E',
    gamutStrategy: 'clipping'
  };
  const requestedLab = [67.2, 26.15, 74.63];
  const state = Lab.ColorModel.fromLab(requestedLab, settings);

  assert.equal(state.gamut.outOfGamut, true);
  assertRgbRange(state.rgb, 'clipped RGB range');
  assert.ok(Math.abs(state.lab[2] - requestedLab[2]) > 1, 'mapped LAB must no longer show the impossible requested b* value');

  const xyzFromActualRgb = Lab.RgbXyz.rgbToXyz(state.rgb, 'E');
  const labFromActualRgb = Lab.XyzLab.xyzToLab(xyzFromActualRgb, 'E');
  const cmykFromActualRgb = Lab.RgbCmyk.rgbToCmyk(state.rgb, 'gcr', 0.5);

  closeVector(state.xyz, xyzFromActualRgb, 1e-9, 'clipped XYZ synchronization');
  closeVector(state.lab, labFromActualRgb, 1e-9, 'clipped LAB synchronization');
  closeVector(state.cmyk, cmykFromActualRgb, 1e-9, 'clipped CMYK synchronization');
});

test('LAB out-of-gamut color is synchronized after Scaling', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    illuminant: 'E',
    gamutStrategy: 'scaling'
  };
  const state = Lab.ColorModel.fromLab([67.2, 26.15, 74.63], settings);

  assert.equal(state.gamut.outOfGamut, true);
  assertRgbRange(state.rgb, 'scaled RGB range');

  const xyzFromActualRgb = Lab.RgbXyz.rgbToXyz(state.rgb, 'E');
  const labFromActualRgb = Lab.XyzLab.xyzToLab(xyzFromActualRgb, 'E');
  const cmykFromActualRgb = Lab.RgbCmyk.rgbToCmyk(state.rgb, 'gcr', 0.5);

  closeVector(state.xyz, xyzFromActualRgb, 1e-9, 'scaled XYZ synchronization');
  closeVector(state.lab, labFromActualRgb, 1e-9, 'scaled LAB synchronization');
  closeVector(state.cmyk, cmykFromActualRgb, 1e-9, 'scaled CMYK synchronization');
});

test('In-gamut LAB remains unchanged apart from floating-point error', () => {
  ['D65', 'D50', 'E'].forEach((illuminant) => {
    const settings = { ...DEFAULT_SETTINGS, illuminant };
    const sourceRgb = [80, 130, 200];
    const sourceLab = Lab.XyzLab.xyzToLab(Lab.RgbXyz.rgbToXyz(sourceRgb, illuminant), illuminant);
    const state = Lab.ColorModel.fromLab(sourceLab, settings);
    assert.equal(state.gamut.outOfGamut, false);
    closeVector(state.rgb, sourceRgb, 1e-7, `${illuminant} in-gamut RGB`);
    closeVector(state.lab, sourceLab, 1e-8, `${illuminant} in-gamut LAB`);
  });
});

test('CMYK source, RGB source and LAB source all return internally consistent representations', () => {
  const settings = { ...DEFAULT_SETTINGS, cmykAlgorithm: 'ucr' };
  const states = [
    Lab.ColorModel.fromRgb([21.5, 91.25, 174.75], settings),
    Lab.ColorModel.fromCmyk([30, 70, 10, 15], settings),
    Lab.ColorModel.fromLab([52, 18, -35], settings)
  ];

  states.forEach((state, index) => {
    const xyz = Lab.RgbXyz.rgbToXyz(state.rgb, settings.illuminant);
    const lab = Lab.XyzLab.xyzToLab(xyz, settings.illuminant);
    closeVector(state.xyz, xyz, 1e-8, `state ${index} XYZ`);
    closeVector(state.lab, lab, 1e-8, `state ${index} LAB`);
  });
});

test('Matrix multiplied by its inverse gives identity for every illuminant', () => {
  ['D65', 'D50', 'E'].forEach((name) => {
    const { rgbToXyz, xyzToRgb } = Lab.Illuminants.calculateRgbXyzMatrices(name);
    const identity = Lab.MathUtil.multiplyMatrices(rgbToXyz, xyzToRgb);
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        close(identity[row][col], row === col ? 1 : 0, 1e-10, `${name} identity ${row}:${col}`);
      }
    }
  });
});
