import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const assetPackage = path.join(repoRoot, 'packages', 'vivari-browser-assets');
const canonicalPublic = path.join(repoRoot, 'runtime', 'vivari', 'packages', 'studio', 'public');
const canonicalCoreAssets = path.join(repoRoot, 'runtime', 'vivari', 'packages', 'core', 'dist', 'assets');

const required = [
  ['sw.js', path.join(canonicalCoreAssets, 'sw.js')],
  ['__vv-bridge.html', path.join(canonicalPublic, '__vv-bridge.html')],
  ['__vv-preview-boot.html', path.join(canonicalPublic, '__vv-preview-boot.html')],
  ['assets/kernel-worker-JoVB2LPb.js', path.join(canonicalCoreAssets, 'kernel-worker-JoVB2LPb.js')],
  ['vendor/npm-pack.bin', path.join(canonicalPublic, 'vendor', 'npm-pack.bin')],
  ['vendor/sqlite/sqlite3.wasm', path.join(canonicalPublic, 'vendor', 'sqlite', 'sqlite3.wasm')],
];

test('browser asset package exposes only generated dist payload and preserves canonical bytes', async () => {
  const manifest = JSON.parse(await readFile(path.join(assetPackage, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@nexari/vivari-browser-assets');
  assert.deepEqual(manifest.files, ['dist']);

  for (const [relative, canonical] of required) {
    const actual = path.join(assetPackage, 'dist', relative);
    assert.equal((await stat(actual)).isFile(), true, `${relative} must be packaged`);
    assert.deepEqual(await readFile(actual), await readFile(canonical), `${relative} must match the owned Vivari source`);
  }
});
