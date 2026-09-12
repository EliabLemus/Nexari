import assert from 'node:assert/strict';
import test from 'node:test';
import { chromeArguments, validateLoopbackCdpUrl } from './browser-smoke-runner.mjs';

test('browser proof runner pins Chrome DevTools to loopback and a supplied fresh profile', () => {
  assert.deepEqual(
    chromeArguments('/tmp/nexari-chrome-profile', 9223),
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=9223',
      '--user-data-dir=/tmp/nexari-chrome-profile',
    ],
  );
});

test('browser proof runner rejects non-loopback CDP endpoints before opening a browser', () => {
  assert.equal(validateLoopbackCdpUrl('http://127.0.0.1:9223').href, 'http://127.0.0.1:9223/');
  assert.throws(
    () => validateLoopbackCdpUrl('http://localhost:9223'),
    (error) => error?.code === 'CDP_LOOPBACK_REQUIRED',
  );
  assert.throws(
    () => validateLoopbackCdpUrl('http://192.0.2.10:9223'),
    (error) => error?.code === 'CDP_LOOPBACK_REQUIRED',
  );
});
