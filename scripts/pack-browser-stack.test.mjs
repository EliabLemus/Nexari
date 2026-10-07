import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const manifestPath = path.join(repoRoot, 'artifacts', 'browser-stack', 'manifest.json');

test('browser stack manifest ships the verified static asset tarball with integrity metadata', async () => {
  await run('npm', ['run', 'build:browser-assets'], { cwd: repoRoot });
  await run('node', ['scripts/pack-browser-stack.mjs'], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const assets = manifest.packages.find((entry) => entry.name === '@nexari/vivari-browser-assets');

  assert.ok(assets, 'browser stack must include the static asset package');
  assert.match(assets.sha256, /^[a-f0-9]{64}$/);
  assert.match(assets.files['dist/sw.js'], /^[a-f0-9]{64}$/);
  assert.match(assets.files['dist/assets/kernel-worker-JoVB2LPb.js'], /^[a-f0-9]{64}$/);
  assert.match(assets.files['dist/vendor/npm-pack.bin'], /^[a-f0-9]{64}$/);
  assert.match(assets.files['dist/__vv-bridge.html'], /^[a-f0-9]{64}$/);
});
