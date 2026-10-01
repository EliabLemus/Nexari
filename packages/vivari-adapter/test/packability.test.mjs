import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * A tarball must not retain a source-tree import: `../` could escape the
 * package root only because the repository happens to place sibling packages
 * next to it. Both runtime JS and consumer-facing declarations are checked.
 */
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const packagedPackages = [
  { name: '@nexari/runtime-contract', dir: 'packages/runtime-contract' },
  { name: '@nexari/vivari-adapter', dir: 'packages/vivari-adapter' },
];
const ESCAPING_SPECIFIER = /(?:from\s*|import\s*\(|import\s*)['"]\.\.\//;

async function moduleFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return moduleFiles(absolute);
    return /\.(?:[cm]?js|d\.ts)$/.test(entry.name) ? [absolute] : [];
  }));
  return nested.flat();
}

test('packaged JS and declarations carry no parent-relative import specifiers', async () => {
  const violations = [];
  for (const pkg of packagedPackages) {
    const packageDir = path.join(repoRoot, pkg.dir);
    for (const file of await moduleFiles(path.join(packageDir, 'dist'))) {
      if (ESCAPING_SPECIFIER.test(await readFile(file, 'utf8'))) {
        violations.push(`${pkg.name}: ${path.relative(repoRoot, file)}`);
      }
    }
  }
  assert.deepEqual(violations, [], `tarball imports escape package root: ${violations.join(', ')}`);
});

test('adapter imports contract and Vivari core through bare package specifiers', async () => {
  const source = await readFile(path.join(repoRoot, 'packages/vivari-adapter/src/index.ts'), 'utf8');
  const terminal = await readFile(path.join(repoRoot, 'packages/vivari-adapter/src/terminal-seam.ts'), 'utf8');
  assert.match(source, /from ['"]@nexari\/runtime-contract['"]/);
  assert.match(terminal, /from ['"]@nexari\/runtime-contract['"]/);
  assert.match(source, /import\(['"]@vivari\/core['"]\)/);
  assert.doesNotMatch(source, /(?:from|import\()\s*['"]\.\.\//);
});

test('tarball manifests whitelist dist and adapter pins its runtime dependencies', async () => {
  const contract = JSON.parse(await readFile(path.join(repoRoot, 'packages/runtime-contract/package.json'), 'utf8'));
  const adapter = JSON.parse(await readFile(path.join(repoRoot, 'packages/vivari-adapter/package.json'), 'utf8'));
  assert.deepEqual(contract.files, ['dist']);
  assert.deepEqual(adapter.files, ['dist']);
  assert.equal(adapter.dependencies['@nexari/runtime-contract'], contract.version);
  assert.equal(adapter.dependencies['@vivari/core'], '1.0.0');
});
