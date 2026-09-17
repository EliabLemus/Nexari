import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertBrowserE2eChromePin,
  assertNoNpmPublication,
  assertNoWorkflowCdpAssignment,
} from './check-workflow-safety.mjs';

const BROWSER_E2E_STEP = [
  '      - name: Browser E2E',
  '        run: npm run test:browser-lab',
  '        env:',
  '          NEXARI_CHROME_BIN: /usr/bin/google-chrome',
].join('\n');

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

test('accepts a test:browser-lab step that pins NEXARI_CHROME_BIN to an absolute Chrome path in the same step', () => {
  assert.doesNotThrow(() => assertBrowserE2eChromePin(BROWSER_E2E_STEP));
});

test('rejects a test:browser-lab step without a NEXARI_CHROME_BIN pin', () => {
  assert.throws(
    () => assertBrowserE2eChromePin('      - run: npm run test:browser-lab\n'),
    /must pin NEXARI_CHROME_BIN/,
  );
});

test('rejects a NEXARI_CHROME_BIN pin that is not step-adjacent to the test:browser-lab run', () => {
  const farAway = [
    '  browser-e2e:',
    '    env:',
    '      NEXARI_CHROME_BIN: /usr/bin/google-chrome',
    '    steps:',
    '      - run: echo start',
    ...Array.from({ length: 10 }, () => '      - run: echo other'),
    '      - run: npm run test:browser-lab',
  ].join('\n');
  assert.throws(() => assertBrowserE2eChromePin(farAway), /must pin NEXARI_CHROME_BIN/);
});

test('rejects a NEXARI_CHROME_BIN pin that is not an absolute Chrome path', () => {
  const relative = BROWSER_E2E_STEP.replace('/usr/bin/google-chrome', 'google-chrome');
  assert.throws(() => assertBrowserE2eChromePin(relative), /must pin NEXARI_CHROME_BIN/);
});

test('rejects any NEXARI_CHROME_CDP_URL assignment; the browser lab runner owns its loopback-only Chrome', () => {
  for (const forbidden of [
    '        env:\n          NEXARI_CHROME_CDP_URL: http://127.0.0.1:9222',
    '        env:\n          NEXARI_CHROME_CDP_URL: http://localhost:9222',
    '        env:\n          NEXARI_CHROME_CDP_URL: http://example.invalid:9222',
  ]) {
    assert.throws(() => assertNoWorkflowCdpAssignment(forbidden), /must not assign NEXARI_CHROME_CDP_URL/);
  }
});
