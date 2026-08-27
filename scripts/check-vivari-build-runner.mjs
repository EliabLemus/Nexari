import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runner = path.join(root, 'scripts', 'build-vivari.mjs');
await access(runner);
const source = await readFile(runner, 'utf8');
for (const needle of [
  "NEXARI_RUST_TOOLCHAIN",
  "1.88.0-aarch64-apple-darwin",
  "wasm32-unknown-unknown",
  "npm run build",
  "npm run verify",
  "npm run smoke",
]) {
  if (!source.includes(needle)) throw new Error(`build runner must contain ${needle}`);
}
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (pkg.scripts['build:vivari'] !== 'node scripts/build-vivari.mjs') {
  throw new Error('package.json must expose build:vivari');
}
console.log('vivari build runner contract: PASS');
