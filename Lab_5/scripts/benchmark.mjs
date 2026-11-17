import { writeFileSync } from 'node:fs';
import { fullBenchmark } from '../src/analysis.js';
const quick = process.argv.includes('--quick');
const options = quick ? { count: 30000, depths: [0, 4, 7], densities: [1, 3], samples: 8 } :
  { count: 500000, depths: [0, 4, 6, 8], densities: [0.6, 1, 3], samples: 16 };
const result = fullBenchmark(options, (step) => process.stderr.write(`\rBenchmark: ${step.done}/${step.total}`));
process.stderr.write('\n');
writeFileSync(quick ? 'benchmark-quick.json' : 'benchmark-results.json', JSON.stringify(result, null, 2));
console.table(result.results.map((row) => ({ density: row.density, depth: row.depth, medianMs: +row.medianMs.toFixed(3), candidates: Math.round(row.meanCandidates) })));
