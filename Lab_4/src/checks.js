import { RasterEngine } from './RasterEngine.js';
import { VirtualGrid } from './VirtualGrid.js';

const get = (fn, ...params) => {
  const grid = new VirtualGrid(121, 121);
  fn(grid, ...params);
  return grid;
};

const assert = (condition, message) => {
  if (!condition) throw Error(message);
};

const lineFns = [RasterEngine.StepLine, RasterEngine.DDALine, RasterEngine.BresenhamLine, RasterEngine.CastlePittewayLine];
const shapes = [[22, 8], [8, 22], [-8, 22], [-22, 8], [-22, -8], [-8, -22], [8, -22], [22, -8]];

export function runChecks() {
  const cases = [
    ['Все 8 октантов для 4 алгоритмов отрезка', () => {
      for (const fn of lineFns) {
        for (const [x, y] of shapes) {
          const grid = get(fn, 0, 0, x, y);
          assert(grid.touched === Math.max(Math.abs(x), Math.abs(y)) + 1, `Pixel count: ${fn.name} (${x}, ${y})`);
          assert(grid.GetPixel(0, 0) > 0 && grid.GetPixel(x, y) > 0, `Endpoints: ${fn.name}`);
          assert(grid.clipped === 0, `Unexpected clipping: ${fn.name}`);
        }
      }
    }],
    ['Те же 8 октантов в обратном направлении', () => {
      for (const fn of lineFns) {
        for (const [x, y] of shapes) {
          const grid = get(fn, x, y, 0, 0);
          assert(grid.touched === Math.max(Math.abs(x), Math.abs(y)) + 1, `Reverse count: ${fn.name}`);
          assert(grid.GetPixel(x, y) && grid.GetPixel(0, 0), `Reverse endpoints: ${fn.name}`);
        }
      }
    }],
    ['Диагонали, горизонтали, вертикали и точечные отрезки', () => {
      for (const fn of lineFns) {
        for (const [x, y] of [[0, 0], [0, 18], [18, 0], [19, 19], [-19, -19], [0, -18], [-18, 0]]) {
          const grid = get(fn, 0, 0, x, y);
          assert(grid.touched === Math.max(Math.abs(x), Math.abs(y)) + 1, `Degenerate: ${fn.name}`);
        }
      }
    }],
    ['Восьмисвязность линий Брезенхема', () => {
      for (let x = -24; x <= 24; x++) {
        for (let y = -24; y <= 24; y++) {
          const grid = get(RasterEngine.BresenhamLine, -2, 3, x, y);
          const points = grid.Points();
          const pointSet = new Set(points.map((p) => `${p.x},${p.y}`));
          const pending = [points[0]];
          const visited = new Set();
          while (pending.length) {
            const point = pending.pop();
            const id = `${point.x},${point.y}`;
            if (visited.has(id)) continue;
            visited.add(id);
            for (let xx = -1; xx <= 1; xx++) {
              for (let yy = -1; yy <= 1; yy++) {
                const nid = `${point.x + xx},${point.y + yy}`;
                if (pointSet.has(nid) && !visited.has(nid)) pending.push({ x: point.x + xx, y: point.y + yy });
              }
            }
          }
          assert(visited.size === points.length, `Disconnected pixels for (${x}, ${y})`);
        }
      }
    }],
    ['Согласованность 4 алгоритмов на множестве склонов', () => {
      for (let dx = -31; dx <= 31; dx += 3) {
        for (let dy = -31; dy <= 31; dy += 3) {
          const reference = get(RasterEngine.BresenhamLine, 0, 0, dx, dy);
          for (const fn of lineFns) {
            const result = get(fn, 0, 0, dx, dy);
            assert(result.touched === reference.touched, `Pixel count differs: ${fn.name} ${dx}/${dy}`);
            for (const pixel of result.Points()) {
              assert(reference.GetPixel(pixel.x, pixel.y) === 1, `Different pixel: ${fn.name} ${dx}/${dy}`);
            }
          }
        }
      }
    }],
    ['Кастл–Питвей vs Брезенхем: целочисленные наклоны', () => {
      for (let major = 2; major <= 34; major++) {
        for (let minor = 1; minor < major; minor++) {
          const castle = get(RasterEngine.CastlePittewayLine, 0, 0, major, minor);
          const bres = get(RasterEngine.BresenhamLine, 0, 0, major, minor);
          assert(castle.touched === bres.touched, `Point count at ${major}/${minor}`);
          assert(castle.GetPixel(major, minor) === 1, `Endpoint at ${major}/${minor}`);
        }
      }
    }],
    ['Ву: интенсивности соседних пикселей суммируются в 1', () => {
      const grid = get(RasterEngine.WuLine, 0, 0, 17, 6);
      let hasFractional = false;
      for (let x = 0; x <= 17; x++) {
        let sum = 0;
        for (let y = -1; y <= 8; y++) {
          const alpha = grid.GetPixel(x, y);
          assert(alpha >= 0 && alpha <= 1, `Alpha out of range: ${alpha}`);
          if (alpha > 0 && alpha < 1) hasFractional = true;
          sum += alpha;
        }
        assert(Math.abs(sum - 1) < 1e-5, `Alpha sum for column ${x}: ${sum}`);
      }
      assert(hasFractional, 'No fractional alpha found');
    }],
    ['Окружность: нулевой радиус, осевые пиксели, 8 симметрий', () => {
      const zero = get(RasterEngine.BresenhamCircle, 0, 0, 0);
      assert(zero.touched === 1 && zero.GetPixel(0, 0) === 1, 'Radius zero');
      const grid = get(RasterEngine.BresenhamCircle, -3, 5, 18);
      for (const [x, y] of [[18, 0], [-18, 0], [0, 18], [0, -18]]) {
        assert(grid.GetPixel(-3 + x, 5 + y) === 1, 'Missing cardinal pixel');
      }
      for (const point of grid.Points()) {
        const x = point.x + 3;
        const y = point.y - 5;
        for (const [sx, sy] of [[x, y], [-x, y], [x, -y], [-x, -y], [y, x], [-y, x], [y, -x], [-y, -x]]) {
          assert(grid.GetPixel(-3 + sx, 5 + sy) === 1, 'Missing symmetry point');
        }
      }
    }],
    ['Питвей: эллипс, вырожденные полуоси, дуги', () => {
      const full = get(RasterEngine.PittewayEllipse, 0, 0, 26, 12, 'full');
      for (const [x, y] of [[26, 0], [-26, 0], [0, 12], [0, -12]]) assert(full.GetPixel(x, y) === 1, 'Ellipse cardinal missing');
      const top = get(RasterEngine.PittewayEllipse, 0, 0, 26, 12, 'top');
      for (const p of top.Points()) assert(p.y >= 0 && full.GetPixel(p.x, p.y) === 1, 'Bad upper arc');
      const q1 = get(RasterEngine.PittewayEllipse, 0, 0, 26, 12, 'q1');
      for (const p of q1.Points()) assert(p.x >= 0 && p.y >= 0, 'Bad quadrant');
      assert(get(RasterEngine.PittewayEllipse, 0, 0, 0, 7).touched === 15, 'Zero X radius');
      assert(get(RasterEngine.PittewayEllipse, 0, 0, 7, 0).touched === 15, 'Zero Y radius');
      assert(get(RasterEngine.PittewayEllipse, 0, 0, 0, 0).touched === 1, 'Zero radii');
    }],
    ['Эллипсы: крайние точки, симметрия и 8-связность для полуосей 1…50', () => {
      for (let rx = 1; rx <= 50; rx++) {
        for (let ry = 1; ry <= 50; ry++) {
          const values = new Set();
          RasterEngine.PittewayEllipse({ SetPixel(x, y) { values.add(`${x},${y}`); } }, 0, 0, rx, ry);
          for (const key of [`${rx},0`, `${-rx},0`, `0,${ry}`, `0,${-ry}`]) assert(values.has(key), `Cardinal ${rx},${ry}: ${key}`);
          for (const key of values) {
            const [x, y] = key.split(',').map(Number);
            assert(values.has(`${-x},${y}`) && values.has(`${x},${-y}`), `Symmetry ${rx},${ry}`);
          }
          const first = `0,${ry}`;
          const queue = [first];
          const seen = new Set(queue);
          for (let i = 0; i < queue.length; i++) {
            const [x, y] = queue[i].split(',').map(Number);
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
              const next = `${x + dx},${y + dy}`;
              if (values.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
            }
          }
          assert(seen.size === values.size, `Disconnected ellipse ${rx},${ry}`);
        }
      }
    }],
    ['Коники: целочисленные параболы, гиперболы и отражение', () => {
      for (const [extent, scale] of [[0, 5], [1, 40], [20, 16], [36, 2], [40, 81]]) {
        const points = new Set();
        RasterEngine.PittewayParabola({ SetPixel(x, y) { points.add(`${x},${y}`); } }, 0, 0, extent, scale, 'up');
        assert(points.has('0,0'), 'Parabola origin');
        assert(points.has(`${extent},${Math.floor((extent * extent + Math.floor(scale / 2)) / scale)}`), 'Parabola endpoint');
        for (const key of points) {
          const [x, y] = key.split(',').map(Number);
          assert(y >= 0 && points.has(`${-x},${y}`), 'Parabola must be symmetric');
        }
      }
      for (const [a, b, height] of [[1, 1, 30], [3, 40, 30], [9, 13, 24], [24, 3, 15]]) {
        const points = new Set();
        RasterEngine.PittewayHyperbola({ SetPixel(x, y) { points.add(`${x},${y}`); } }, 0, 0, a, b, height);
        for (const key of [`${a},0`, `${-a},0`]) assert(points.has(key), 'Hyperbola vertices');
        for (const key of points) {
          const [x, y] = key.split(',').map(Number);
          assert(points.has(`${-x},${y}`) && points.has(`${x},${-y}`), 'Hyperbola reflection');
        }
      }
    }],
    ['VirtualGrid: reset, boundaries and alpha accumulation', () => {
      const grid = new VirtualGrid(3, 3, -1, -1);
      grid.SetPixel(0, 0, 0.25);
      grid.SetPixel(0, 0, 0.1);
      grid.SetPixel(0, 0, 0.75);
      grid.SetPixel(-2, 0, 1);
      assert(Math.abs(grid.GetPixel(0, 0) - 0.75) < 1e-6, 'Max intensity');
      assert(grid.touched === 1 && grid.calls === 4 && grid.clipped === 1, 'Counters');
      grid.Clear();
      assert(grid.GetPixel(0, 0) === 0 && grid.calls === 0, 'Reset');
    }],
  ];
  return cases.map(([name, check]) => {
    try {
      check();
      return { name, pass: true };
    } catch (error) {
      return { name, pass: false, error: error.message };
    }
  });
}
