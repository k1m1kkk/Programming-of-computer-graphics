const roundPositive = (value) => Math.floor(value + 0.5);

function ensureLine(x0, y0, x1, y1) {
  if (![x0, y0, x1, y1].every(Number.isSafeInteger)) {
    throw new TypeError('Line endpoints must be safe integers');
  }
}

function ensureCircle(cx, cy, radius) {
  if (![cx, cy, radius].every(Number.isSafeInteger) || radius < 0) {
    throw new RangeError('Circle arguments must be safe integers and radius >= 0');
  }
}

function emit(target, x, y, intensity = 1) {
  target.SetPixel(x, y, intensity);
}

function prepare(x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return { ax, ay, sx: Math.sign(dx), sy: Math.sign(dy), steep: ay > ax, major: Math.max(ax, ay), minor: Math.min(ax, ay) };
}

function mapped(x0, y0, info, majorOffset, minorOffset) {
  return info.steep
    ? [x0 + info.sx * minorOffset, y0 + info.sy * majorOffset]
    : [x0 + info.sx * majorOffset, y0 + info.sy * minorOffset];
}

function symmetric8(target, cx, cy, x, y) {
  emit(target, cx + x, cy + y);
  emit(target, cx - x, cy + y);
  emit(target, cx + x, cy - y);
  emit(target, cx - x, cy - y);
  emit(target, cx + y, cy + x);
  emit(target, cx - y, cy + x);
  emit(target, cx + y, cy - x);
  emit(target, cx - y, cy - x);
}

const arcCheck = {
  full: () => true,
  top: (_x, y) => y >= 0,
  bottom: (_x, y) => y <= 0,
  left: (x) => x <= 0,
  right: (x) => x >= 0,
  q1: (x, y) => x >= 0 && y >= 0,
  q2: (x, y) => x <= 0 && y >= 0,
  q3: (x, y) => x <= 0 && y <= 0,
  q4: (x, y) => x >= 0 && y <= 0,
};

export class RasterEngine {
  static StepLine(target, x0, y0, x1, y1) {
    ensureLine(x0, y0, x1, y1);
    const info = prepare(x0, y0, x1, y1);
    if (info.major === 0) return emit(target, x0, y0);
    const slope = info.minor / info.major;
    for (let step = 0; step <= info.major; step++) {
      const [x, y] = mapped(x0, y0, info, step, roundPositive(slope * step + 1e-10));
      emit(target, x, y);
    }
  }

  static DDALine(target, x0, y0, x1, y1) {
    ensureLine(x0, y0, x1, y1);
    const info = prepare(x0, y0, x1, y1);
    if (info.major === 0) return emit(target, x0, y0);
    const xIncrement = (x1 - x0) / info.major;
    const yIncrement = (y1 - y0) / info.major;
    let x = x0;
    let y = y0;
    for (let step = 0; step <= info.major; step++) {
      if (step === info.major) {
        emit(target, x1, y1);
      } else {
        const ox = Math.abs(x - x0);
        const oy = Math.abs(y - y0);
        emit(target, x0 + Math.sign(x1 - x0) * roundPositive(ox + 1e-10), y0 + Math.sign(y1 - y0) * roundPositive(oy + 1e-10));
      }
      x += xIncrement;
      y += yIncrement;
    }
  }

  static BresenhamLine(target, x0, y0, x1, y1) {
    ensureLine(x0, y0, x1, y1);
    const info = prepare(x0, y0, x1, y1);
    let x = x0;
    let y = y0;
    let decision = 2 * info.minor - info.major;
    for (let step = 0; step <= info.major; step++) {
      emit(target, x, y);
      if (info.steep) y += info.sy;
      else x += info.sx;
      if (decision >= 0) {
        if (info.steep) x += info.sx;
        else y += info.sy;
        decision += 2 * (info.minor - info.major);
      } else {
        decision += 2 * info.minor;
      }
    }
  }

  static WuLine(target, x0, y0, x1, y1) {
    ensureLine(x0, y0, x1, y1);
    const info = prepare(x0, y0, x1, y1);
    if (info.major === 0) return emit(target, x0, y0, 1);
    const gradient = info.minor / info.major;
    for (let step = 0; step <= info.major; step++) {
      const exactMinor = gradient * step;
      const floorMinor = Math.floor(exactMinor);
      const fractional = exactMinor - floorMinor;
      const [x0p, y0p] = mapped(x0, y0, info, step, floorMinor);
      emit(target, x0p, y0p, 1 - fractional);
      if (fractional > 1e-12) {
        const [x1p, y1p] = mapped(x0, y0, info, step, floorMinor + 1);
        emit(target, x1p, y1p, fractional);
      }
    }
  }

  static BresenhamCircle(target, cx, cy, radius) {
    ensureCircle(cx, cy, radius);
    let x = 0;
    let y = radius;
    let decision = 3 - 2 * radius;
    while (x <= y) {
      symmetric8(target, cx, cy, x, y);
      if (decision < 0) {
        decision += 4 * x + 6;
      } else {
        decision += 4 * (x - y) + 10;
        y--;
      }
      x++;
    }
  }

  static CastlePittewayLine(target, x0, y0, x1, y1) {
    ensureLine(x0, y0, x1, y1);
    const info = prepare(x0, y0, x1, y1);
    if (info.major === 0) return emit(target, x0, y0);
    if (info.minor === 0 || info.minor === info.major) {
      for (let i = 0; i <= info.major; i++) {
        const [x, y] = mapped(x0, y0, info, i, info.minor === 0 ? 0 : i);
        emit(target, x, y);
      }
      return;
    }
    let m1 = 'S';
    let m2 = 'D';
    let x = info.major - info.minor;
    let y = info.minor;
    while (x !== y) {
      if (x > y) {
        m2 = m1 + [...m2].reverse().join('');
        x -= y;
      } else {
        m1 = m2 + [...m1].reverse().join('');
        y -= x;
      }
    }
    const code = m2 + [...m1].reverse().join('');
    let majorOffset = 0;
    let minorOffset = 0;
    emit(target, x0, y0);
    for (let repetition = 0; repetition < x; repetition++) {
      for (const symbol of code) {
        majorOffset++;
        if (symbol === 'D') minorOffset++;
        const [px, py] = mapped(x0, y0, info, majorOffset, minorOffset);
        emit(target, px, py);
      }
    }
  }

  static PittewayEllipse(target, cx, cy, rx, ry, arc = 'full') {
    ensureCircle(cx, cy, rx);
    ensureCircle(cx, cy, ry);
    const included = arcCheck[arc];
    if (!included) throw new RangeError('Unknown arc mode');
    const dot = (x, y) => {
      if (included(x, y)) emit(target, cx + x, cy + y);
    };
    if (rx === 0 && ry === 0) return dot(0, 0);
    if (rx === 0 || ry === 0) {
      const n = Math.max(rx, ry);
      for (let i = -n; i <= n; i++) dot(rx === 0 ? 0 : i, ry === 0 ? 0 : i);
      return;
    }
    const plot4 = (x, y) => {
      dot(x, y);
      dot(-x, y);
      dot(x, -y);
      dot(-x, -y);
    };
    dot(rx, 0);
    dot(-rx, 0);
    dot(0, ry);
    dot(0, -ry);
    const rx2 = rx * rx;
    const ry2 = ry * ry;
    let x = 0;
    let y = ry;
    let dx = 0;
    let dy = 2 * rx2 * y;
    let d = 4 * ry2 - 4 * rx2 * ry + rx2;
    while (dx < dy) {
      plot4(x, y);
      x++;
      dx += 2 * ry2;
      if (d < 0) {
        d += 4 * (dx + ry2);
      } else {
        y--;
        dy -= 2 * rx2;
        d += 4 * (dx - dy + ry2);
      }
    }
    d = ry2 * (2 * x + 1) ** 2 + 4 * rx2 * (y - 1) ** 2 - 4 * rx2 * ry2;
    while (y >= 0) {
      plot4(x, y);
      y--;
      dy -= 2 * rx2;
      if (d > 0) {
        d += 4 * (rx2 - dy);
      } else {
        x++;
        dx += 2 * ry2;
        d += 4 * (dx - dy + rx2);
      }
    }
    // Thin ellipses can jump across the last axis pixels at a sector switch.
    // Connect the final selected point to the guaranteed cardinal endpoint.
    for (let px = Math.min(x, rx); px <= rx; px++) plot4(px, 0);
  }

  // Integer midpoint rasterization of a parabola: scale * y = x^2.
  // The selected independent coordinate switches when the slope crosses 1.
  static PittewayParabola(target, cx, cy, extent, scale, direction = 'up') {
    ensureCircle(cx, cy, extent);
    ensureCircle(cx, cy, scale);
    if (scale === 0) throw new RangeError('Parabola scale must be positive');
    if (direction !== 'up' && direction !== 'down') throw new RangeError('Unknown parabola direction');
    const sy = direction === 'up' ? 1 : -1;
    const plot = (x, y) => {
      emit(target, cx + x, cy + sy * y);
      if (x !== 0) emit(target, cx - x, cy + sy * y);
    };
    let x = 0;
    let y = 0;
    const endY = Math.floor((extent * extent + Math.floor(scale / 2)) / scale);
    plot(x, y);
    // Region 1: dy/dx <= 1, compare F(x+1, y+1/2) to zero.
    while (x < extent && 2 * x < scale) {
      x++;
      if (2 * scale * y + scale <= 2 * x * x) y++;
      plot(x, y);
    }
    // Region 2: dy/dx > 1, compare F(x+1/2, y+1) to zero.
    while (y < endY) {
      y++;
      if (4 * scale * y > (2 * x + 1) * (2 * x + 1) && x < extent) x++;
      plot(x, y);
    }
    // The extreme point must be present for all integer input parameters.
    plot(extent, endY);
  }

  // Implicit hyperbola F = b²*x² - a²*y² - a²*b². Each decision is
  // an exact integer evaluation of the midpoint between two candidates.
  static PittewayHyperbola(target, cx, cy, a, b, height, branches = 'both') {
    ensureCircle(cx, cy, a);
    ensureCircle(cx, cy, b);
    ensureCircle(cx, cy, height);
    if (a === 0 || b === 0) throw new RangeError('Hyperbola parameters a and b must be positive');
    if (!['both', 'right', 'left'].includes(branches)) throw new RangeError('Unknown hyperbola branch');
    const a2 = a * a;
    const b2 = b * b;
    const plot = (x, y) => {
      for (const px of branches === 'both' ? [x, -x] : [branches === 'right' ? x : -x]) {
        emit(target, cx + px, cy + y);
        if (y !== 0) emit(target, cx + px, cy - y);
      }
    };
    let x = a;
    let y = 0;
    plot(x, y);
    // The gradient selects the dominant axis; midpoint error decides
    // whether to advance the second axis during this move.
    while (y < height) {
      if (b2 * x >= a2 * y) {
        y++;
        const midpoint4 = b2 * (2 * x + 1) ** 2 - 4 * a2 * y * y - 4 * a2 * b2;
        if (midpoint4 < 0) x++;
      } else {
        x++;
        const midpoint4 = 4 * b2 * x * x - a2 * (2 * y + 1) ** 2 - 4 * a2 * b2;
        if (midpoint4 > 0) y++;
      }
      plot(x, y);
    }
  }
}

export const ALGORITHMS = {
  step: { label: 'Пошаговый', fn: RasterEngine.StepLine, kind: 'line' },
  dda: { label: 'ЦДА', fn: RasterEngine.DDALine, kind: 'line' },
  bresenham: { label: 'Брезенхем · отрезок', fn: RasterEngine.BresenhamLine, kind: 'line' },
  wu: { label: 'Ву · сглаживание', fn: RasterEngine.WuLine, kind: 'line' },
  castle: { label: 'Кастл–Питвей · отрезок', fn: RasterEngine.CastlePittewayLine, kind: 'line' },
  circle: { label: 'Брезенхем · окружность', fn: RasterEngine.BresenhamCircle, kind: 'circle' },
  ellipse: { label: 'Питвей · эллипс / дуга', fn: RasterEngine.PittewayEllipse, kind: 'ellipse' },
  parabola: { label: 'Питвей · парабола', fn: RasterEngine.PittewayParabola, kind: 'parabola' },
  hyperbola: { label: 'Питвей · гипербола', fn: RasterEngine.PittewayHyperbola, kind: 'hyperbola' },
};
