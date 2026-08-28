import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lab = path.join(root, 'labs', 'browser-smoke');
for (const relative of ['index.html', 'src/main.ts', 'vite.config.ts', 'package.json']) {
  await access(path.join(lab, relative));
}
const source = await readFile(path.join(lab, 'src/main.ts'), 'utf8');
for (const needle of ['Vivari.boot', 'crossOriginIsolated', 'SharedArrayBuffer', 'server-ready', 'server.listen', 'teardown']) {
  if (!source.includes(needle)) throw new Error(`browser lab must exercise ${needle}`);
}
const config = await readFile(path.join(lab, 'vite.config.ts'), 'utf8');
for (const needle of ['Cross-Origin-Opener-Policy', 'same-origin', 'Cross-Origin-Embedder-Policy', 'require-corp', 'Service-Worker-Allowed']) {
  if (!config.includes(needle)) throw new Error(`browser lab must serve ${needle}`);
}
console.log('browser lab static contract: PASS');
