import { runChecks } from '../src/checks.js';

const checks = runChecks();
for (const result of checks) {
  process.stdout.write(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? ` — ${result.error}` : ''}\n`);
}
const passes = checks.filter((item) => item.pass).length;
process.stdout.write(`\n${passes}/${checks.length} checks passed\n`);
if (passes !== checks.length) process.exitCode = 1;
