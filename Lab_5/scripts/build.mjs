import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(root, name), 'utf8');
const modules = ['geometry.js', 'quadtree.js', 'dataset.js', 'polygons.js', 'analysis.js', 'stress-gpu.js'];
function strip(source) {
  return source.replace(/^import\s+[^;]+;\s*$/gm, '').replace(/^export\s+(?=(?:const|let|function|class)\s)/gm, '');
}
const core = modules.map((module) => strip(read(`src/${module}`))).join('\n\n');
const worker = `${core}\n${strip(read('src/worker.js'))}`;
const js = `(() => {\n'use strict';\n${core}\nconst INLINE_WORKER_SOURCE = ${JSON.stringify(worker)};\n${strip(read('src/app.js'))}\n})();`;
const template = read('template.html');
if (!template.includes('/* APP_STYLES */') || !template.includes('/* APP_SCRIPT */')) throw new Error('Template placeholders missing.');
const result = template.replace('/* APP_STYLES */', read('styles.css')).replace('/* APP_SCRIPT */', js.replace(/<\/script/gi, '<\\/script'));
writeFileSync(join(root, 'index.html'), result);
console.log(`Standalone index.html created (${(Buffer.byteLength(result) / 1024).toFixed(1)} KiB).`);
