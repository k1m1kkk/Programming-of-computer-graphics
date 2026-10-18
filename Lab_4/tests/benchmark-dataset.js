import { generateSunLines } from '../src/Benchmark.js';

const count = 100000;
const lines = generateSunLines(count, 8, 160, 0x4a21bcb1);
if (lines.length !== count * 4) throw new Error('Invalid segment array length');
const octants = Array(8).fill(0);
for (let i = 0; i < count; i++) {
  const p = i * 4;
  const [x0, y0, x1, y1] = lines.subarray(p, p + 4);
  if (x0 !== 0 || y0 !== 0) throw new Error('Sun rays do not share one origin');
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steep = Math.abs(dy) > Math.abs(dx);
  const expected = i % 8;
  if (steep !== (expected % 2 === 1)) throw new Error(`Wrong dominant axis at ${i}`);
  if ((dx < 0) !== ((expected & 2) !== 0)) throw new Error(`Wrong X sign at ${i}`);
  if ((dy < 0) !== ((expected & 4) !== 0)) throw new Error(`Wrong Y sign at ${i}`);
  const major = Math.max(Math.abs(dx), Math.abs(dy));
  const minor = Math.min(Math.abs(dx), Math.abs(dy));
  if (major < 8 || major > 160 || minor < 1 || minor >= major) throw new Error(`Invalid slope at ${i}`);
  octants[expected]++;
}
console.log(`PASS Sun dataset: ${count} rays, common origin, 8 octants × ${octants.join('/')}`);
