(function (root) {
  const Lab = root.ColorLab = root.ColorLab || {};
  const M = Lab.MathUtil;

  const PRIMARIES = {
    red: { x: 0.64, y: 0.33 },
    green: { x: 0.30, y: 0.60 },
    blue: { x: 0.15, y: 0.06 }
  };

  function xyzToXy(xyz) {
    const sum = xyz[0] + xyz[1] + xyz[2];
    if (sum <= 0) {
      throw new Error('White point must have a positive XYZ sum');
    }
    return { x: xyz[0] / sum, y: xyz[1] / sum };
  }

  const d65FromMethodicalWhite = xyzToXy([95.047, 100, 108.883]);

  const ILLUMINANTS = {
    D65: {
      name: 'D65',
      label: 'D65 — средний дневной свет',
      x: d65FromMethodicalWhite.x,
      y: d65FromMethodicalWhite.y
    },
    D50: {
      name: 'D50',
      label: 'D50 — теплый дневной свет',
      x: 0.34567,
      y: 0.35850
    },
    E: {
      name: 'E',
      label: 'E — равноэнергетический источник',
      x: 1 / 3,
      y: 1 / 3
    }
  };

  function xyToXyz(x, y, Y) {
    if (y <= 0) {
      throw new Error('Chromaticity y must be positive');
    }
    return [x * Y / y, Y, (1 - x - y) * Y / y];
  }

  function whitePoint(illuminantName, scale) {
    const illuminant = ILLUMINANTS[illuminantName];
    if (!illuminant) {
      throw new Error(`Unknown illuminant: ${illuminantName}`);
    }
    return xyToXyz(illuminant.x, illuminant.y, scale == null ? 100 : scale);
  }

  function primaryMatrix() {
    const r = xyToXyz(PRIMARIES.red.x, PRIMARIES.red.y, 1);
    const g = xyToXyz(PRIMARIES.green.x, PRIMARIES.green.y, 1);
    const b = xyToXyz(PRIMARIES.blue.x, PRIMARIES.blue.y, 1);
    return [
      [r[0], g[0], b[0]],
      [r[1], g[1], b[1]],
      [r[2], g[2], b[2]]
    ];
  }

  function calculateRgbXyzMatrices(illuminantName) {
    const primaries = primaryMatrix();
    const white = whitePoint(illuminantName, 1);
    const scale = M.multiplyMatrixVector(M.inverse3(primaries), white);
    const rgbToXyz = M.multiplyMatrices(primaries, M.diagonal(scale));
    const xyzToRgb = M.inverse3(rgbToXyz);

    return {
      rgbToXyz,
      xyzToRgb,
      white: whitePoint(illuminantName, 100)
    };
  }

  Lab.Illuminants = {
    PRIMARIES,
    ILLUMINANTS,
    xyzToXy,
    xyToXyz,
    whitePoint,
    primaryMatrix,
    calculateRgbXyzMatrices
  };
})(globalThis);
