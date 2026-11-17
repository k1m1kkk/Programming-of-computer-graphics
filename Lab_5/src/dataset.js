export function seededRandom(seed = 2026) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const DATA_BOUNDS = { xmin: -512, ymin: -512, xmax: 512, ymax: 512 };
export function makeDataset(count = 500000, density = 1, seed = 2026) {
  if (!Number.isInteger(count) || count < 0 || count > 1000000) throw new Error('Invalid dataset size.');
  if (!Number.isFinite(density) || density < 0.1 || density > 12) throw new Error('Invalid density.');
  const random = seededRandom(seed);
  const data = new Float64Array(count * 4);
  const range = 475 / Math.sqrt(density);
  for (let i = 0; i < count; i++) {
    let x = (random() * 2 - 1) * range;
    let y = (random() * 2 - 1) * range;
    const length = 1 + random() * 11;
    const angle = random() * Math.PI * 2;
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    const j = i * 4;
    data[j] = Math.max(-510, Math.min(510, x));
    data[j + 1] = Math.max(-510, Math.min(510, y));
    data[j + 2] = Math.max(-510, Math.min(510, x + dx));
    data[j + 3] = Math.max(-510, Math.min(510, y + dy));
  }
  return data;
}
