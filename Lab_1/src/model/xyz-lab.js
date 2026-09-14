(function (root) {
  const Lab = root.ColorLab = root.ColorLab || {};

  const EPSILON = 216 / 24389;
  const KAPPA = 24389 / 27;

  function f(t) {
    return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
  }

  function fInverse(t) {
    const cube = t * t * t;
    return cube > EPSILON ? cube : (116 * t - 16) / KAPPA;
  }

  function xyzToLab(xyz, illuminantName) {
    const white = Lab.Illuminants.whitePoint(illuminantName, 100);
    const fx = f(xyz[0] / white[0]);
    const fy = f(xyz[1] / white[1]);
    const fz = f(xyz[2] / white[2]);
    return [
      116 * fy - 16,
      500 * (fx - fy),
      200 * (fy - fz)
    ];
  }

  function labToXyz(lab, illuminantName) {
    const white = Lab.Illuminants.whitePoint(illuminantName, 100);
    const fy = (lab[0] + 16) / 116;
    const fx = fy + lab[1] / 500;
    const fz = fy - lab[2] / 200;
    return [
      white[0] * fInverse(fx),
      white[1] * fInverse(fy),
      white[2] * fInverse(fz)
    ];
  }

  Lab.XyzLab = {
    EPSILON,
    KAPPA,
    xyzToLab,
    labToXyz
  };
})(globalThis);
