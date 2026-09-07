(function (root) {
  const Lab = root.ColorLab = root.ColorLab || {};

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function multiplyMatrixVector(matrix, vector) {
    return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
  }

  function multiplyMatrices(a, b) {
    return a.map((row) => b[0].map((_, column) => row.reduce((sum, value, index) => sum + value * b[index][column], 0)));
  }

  function determinant3(matrix) {
    const [a, b, c] = matrix[0];
    const [d, e, f] = matrix[1];
    const [g, h, i] = matrix[2];
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  }

  function inverse3(matrix) {
    const det = determinant3(matrix);
    if (Math.abs(det) < 1e-14) {
      throw new Error('Matrix is singular');
    }

    const [a, b, c] = matrix[0];
    const [d, e, f] = matrix[1];
    const [g, h, i] = matrix[2];

    return [
      [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
      [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
      [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]
    ];
  }

  function diagonal(values) {
    return values.map((value, row) => values.map((_, column) => row === column ? value : 0));
  }

  function almostEqual(a, b, epsilon) {
    return Math.abs(a - b) <= epsilon;
  }

  Lab.MathUtil = {
    clamp,
    multiplyMatrixVector,
    multiplyMatrices,
    determinant3,
    inverse3,
    diagonal,
    almostEqual
  };
})(globalThis);
