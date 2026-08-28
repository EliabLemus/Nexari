import assert from 'node:assert/strict';
import test from 'node:test';

import { RuntimeError } from '../../runtime-contract/dist/index.js';
import { createVivariRuntime } from '../dist/index.js';

const stream = new ReadableStream({ start(controller) { controller.close(); } });

function fakeSdk() {
  const calls = { boot: 0, mount: 0, spawn: 0, teardown: 0, detach: 0, unsubscribe: 0 };
  let serverReady;
  const instance = {
    fs: { readFile: async () => 'ok', writeFile: async () => {}, readdir: async () => [], mkdir: async () => {}, rm: async () => {} },
    mount: async () => { calls.mount++; },
    spawn: async () => { calls.spawn++; return { pid: 41, output: stream, stdout: stream, stderr: stream, input: new WritableStream(), exit: Promise.resolve(0), kill() {} }; },
    on: (_event, listener) => { serverReady = listener; return () => { calls.unsubscribe++; serverReady = undefined; }; },
    emitServerReady: (...args) => serverReady?.(...args),
    attachPreview: () => () => { calls.detach++; },
    export: async () => ({ files: [], truncated: false }),
    teardown: () => { calls.teardown++; },
  };
  return { calls, instance, loader: async () => ({ boot: async () => { calls.boot++; return instance; } }) };
}

test('rejects without isolation before booting the fork', async () => {
  const fake = fakeSdk();
  const runtime = createVivariRuntime({ id: 'a', isIsolated: () => false, loadSdk: fake.loader });
  await assert.rejects(runtime.boot(), (error) => error instanceof RuntimeError && error.code === 'ISOLATION_REQUIRED');
  assert.equal(fake.calls.boot, 0);
});

test('maps the owned fork and detaches previews on idempotent teardown', async () => {
  const fake = fakeSdk();
  const runtime = createVivariRuntime({ id: 'b', isIsolated: () => true, loadSdk: fake.loader });
  await runtime.boot();
  await runtime.mount({});
  const process = await runtime.spawn('node', ['app.js']);
  const detach = runtime.attachPreview({});
  assert.equal(process.pid, 41);
  assert.equal(runtime.state, 'ready');
  detach();
  await runtime.teardown();
  await runtime.teardown();
  assert.deepEqual(fake.calls, { boot: 1, mount: 1, spawn: 1, teardown: 1, detach: 1, unsubscribe: 0 });
  assert.equal(runtime.state, 'terminated');
  await assert.rejects(runtime.spawn('node'), (error) => error instanceof RuntimeError && error.code === 'TORN_DOWN');
});

test('forwards server readiness as a typed runtime event', async () => {
  const fake = fakeSdk();
  const runtime = createVivariRuntime({ id: 'c', isIsolated: () => true, loadSdk: fake.loader });
  await runtime.boot();
  let received;
  const off = runtime.on('server-ready', (port, url) => { received = { port, url }; });
  fake.instance.emitServerReady(3111, 'http://preview.test/');
  off();
  assert.deepEqual(received, { port: 3111, url: 'http://preview.test/' });
});

test('teardown unsubscribes runtime event listeners so stale server events cannot reach the host', async () => {
  const fake = fakeSdk();
  const runtime = createVivariRuntime({ id: 'd', isIsolated: () => true, loadSdk: fake.loader });
  await runtime.boot();
  let received = 0;
  runtime.on('server-ready', () => { received++; });
  await runtime.teardown();
  fake.instance.emitServerReady(3111, 'http://stale.test/');
  assert.equal(fake.calls.unsubscribe, 1);
  assert.equal(received, 0);
});
