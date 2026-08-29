import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNoNpmPublication } from './check-workflow-safety.mjs';

test('accepts a workflow with source-tag release only', () => {
  assert.doesNotThrow(() => assertNoNpmPublication('run: gh release create v1.2.3 --generate-notes\n'));
});

test('rejects npm publication credentials and commands', () => {
  for (const forbidden of [
    'npm publish',
    'pnpm publish',
    'yarn publish',
    'npm token create',
    'registry-url: https://registry.npmjs.org',
    'NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}',
  ]) {
    assert.throws(() => assertNoNpmPublication(forbidden), /npm package publication is forbidden/);
  }
});
