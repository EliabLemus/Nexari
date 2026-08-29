import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const adapterRoot = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const coreEntrypoint = new URL('../../../runtime/vivari/packages/core/dist/index.js', import.meta.url);

test('the adapter type-checks against the owned Vivari fork declarations', () => {
  execFileSync('npx', ['tsc', '-p', 'tsconfig.linkage.json', '--noEmit'], {
    cwd: adapterRoot,
    stdio: 'pipe',
  });
});

test('the owned Vivari fork exposes the adapter seam at runtime', async () => {
  const { Vivari } = await import(coreEntrypoint.href);
  assert.equal(typeof Vivari.boot, 'function');
  for (const method of ['mount', 'spawn', 'attachPreview', 'on', 'export', 'teardown']) {
    assert.equal(typeof Vivari.prototype[method], 'function', `${method} must remain available to the adapter`);
  }
  assert.ok(coreEntrypoint.pathname.startsWith(`${repositoryRoot.replace(/\/$/, '')}/runtime/vivari/`), 'the runtime proof must load the owned fork');
});
