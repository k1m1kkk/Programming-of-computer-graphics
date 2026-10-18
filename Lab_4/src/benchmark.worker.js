import { runBenchmark } from './Benchmark.js';

self.onmessage = async (message) => {
  if (message.data?.type !== 'start') return;
  try {
    const results = await runBenchmark((progress) => self.postMessage({ type: 'progress', ...progress }));
    self.postMessage({ type: 'done', results });
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error?.stack || error) });
  }
};
