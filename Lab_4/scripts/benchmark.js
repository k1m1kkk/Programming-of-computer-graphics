import { writeFileSync } from 'node:fs';
import { runBenchmark } from '../src/Benchmark.js';

const quick = process.argv.includes('--quick');
const result = await runBenchmark(({ percent, text }) => {
  if (percent % 10 === 0) process.stdout.write(`${percent}% ${text}\n`);
}, { quick });
writeFileSync(quick ? 'benchmark-quick.json' : 'benchmark-results.json', JSON.stringify(result, null, 2));
process.stdout.write('\n100k line benchmark results (ms):\n');
process.stdout.write(JSON.stringify(result.countResults.at(-1), null, 2) + '\n');
process.stdout.write('\nMax circle benchmark (ms):\n');
process.stdout.write(JSON.stringify(result.circleResults.at(-1), null, 2) + '\n');
