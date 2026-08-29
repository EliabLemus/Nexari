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

test('boot after teardown rejects as torn down before evaluating isolation', async () => {
  const fake = fakeSdk();
  const runtime = createVivariRuntime({ id: 'terminated-before-boot', isIsolated: () => false, loadSdk: fake.loader });
  await runtime.teardown();
  await assert.rejects(runtime.boot(), (error) => error instanceof RuntimeError && error.code === 'TORN_DOWN');
  assert.equal(fake.calls.boot, 0);
});

test('boot after a successful boot and teardown rejects as torn down', async () => {
  const fake = fakeSdk();
  const runtime = createVivariRuntime({ id: 'terminated-after-boot', isIsolated: () => true, loadSdk: fake.loader });
  await runtime.boot();
  await runtime.teardown();
  await assert.rejects(runtime.boot(), (error) => error instanceof RuntimeError && error.code === 'TORN_DOWN');
  assert.equal(fake.calls.boot, 1);
  assert.equal(runtime.state, 'terminated');
});

test('an already-aborted boot signal fails closed before loading the Vivari SDK', async () => {
  let sdkLoads = 0;
  const controller = new AbortController();
  controller.abort(new Error('caller cancelled boot'));
  const runtime = createVivariRuntime({
    id: 'aborted-before-sdk-load',
    isIsolated: () => false,
    loadSdk: async () => { sdkLoads++; throw new Error('SDK must not load'); },
  });
  await assert.rejects(runtime.boot({ signal: controller.signal }), (error) => error instanceof RuntimeError && error.code === 'BOOT_ABORTED');
  assert.equal(sdkLoads, 0);
  assert.equal(runtime.state, 'terminated');
});

test('a caller abort during SDK loading prevents a late SDK from booting a guest', async () => {
  let resolveSdk;
  let guestBoots = 0;
  const controller = new AbortController();
  const runtime = createVivariRuntime({
    id: 'aborted-during-sdk-load',
    isIsolated: () => true,
    loadSdk: () => new Promise((resolve) => { resolveSdk = resolve; }),
  });
  const boot = runtime.boot({ signal: controller.signal });
  await new Promise(setImmediate);
  controller.abort(new Error('caller cancelled boot'));
  resolveSdk({ boot: async () => { guestBoots++; return fakeSdk().instance; } });
  await assert.rejects(boot, (error) => error instanceof RuntimeError && error.code === 'BOOT_ABORTED');
  assert.equal(guestBoots, 0);
  assert.equal(runtime.state, 'terminated');
});

test('a caller abort during guest boot tears down a guest that ignores its abort signal', async () => {
  const fake = fakeSdk();
  const controller = new AbortController();
  let resolveGuestBoot;
  const runtime = createVivariRuntime({
    id: 'aborted-during-guest-boot',
    isIsolated: () => true,
    loadSdk: async () => ({ boot: () => new Promise((resolve) => { resolveGuestBoot = resolve; }) }),
  });
  const boot = runtime.boot({ signal: controller.signal });
  await new Promise(setImmediate);
  controller.abort(new Error('caller cancelled boot'));
  resolveGuestBoot(fake.instance);
  await assert.rejects(boot, (error) => error instanceof RuntimeError && error.code === 'BOOT_ABORTED');
  assert.equal(fake.calls.teardown, 1);
  assert.equal(runtime.state, 'terminated');
});

test('a caller abort during guest boot remains BOOT_ABORTED when late guest cleanup fails', async () => {
  const fake = fakeSdk();
  const controller = new AbortController();
  let resolveGuestBoot;
  fake.instance.teardown = () => {
    fake.calls.teardown++;
    throw new Error('late guest cleanup failed');
  };
  const runtime = createVivariRuntime({
    id: 'aborted-guest-cleanup-failure',
    isIsolated: () => true,
    loadSdk: async () => ({ boot: () => new Promise((resolve) => { resolveGuestBoot = resolve; }) }),
  });
  const boot = runtime.boot({ signal: controller.signal });
  await new Promise(setImmediate);
  controller.abort(new Error('caller cancelled boot'));
  resolveGuestBoot(fake.instance);
  await assert.rejects(boot, (error) => error instanceof RuntimeError
    && error.code === 'BOOT_ABORTED'
    && error.cause?.message === 'late guest cleanup failed');
  assert.equal(fake.calls.teardown, 1);
  assert.equal(runtime.state, 'terminated');
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

test('maps the owned fork command-not-found rejection to the runtime contract', async () => {
  const fake = fakeSdk();
  const guestError = Object.assign(new Error('command missing'), { code: 'ERR_COMMAND_NOT_FOUND' });
  fake.instance.spawn = async () => { throw guestError; };
  const runtime = createVivariRuntime({ id: 'command-not-found', isIsolated: () => true, loadSdk: fake.loader });
  await runtime.boot();
  await assert.rejects(runtime.spawn('missing-command'), (error) =>
    error instanceof RuntimeError && error.code === 'COMMAND_NOT_FOUND' && error.cause === guestError,
  );
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

test('teardown aborts a pending guest boot so lifecycle cleanup cannot hang', async () => {
  let observedSignal;
  const runtime = createVivariRuntime({
    id: 'abort-pending-boot',
    isIsolated: () => true,
    loadSdk: async () => ({
      boot: ({ signal }) => new Promise((_resolve, reject) => {
        observedSignal = signal;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
    }),
  });
  const boot = runtime.boot();
  const bootFailure = assert.rejects(boot, (error) => error instanceof RuntimeError && error.code === 'TORN_DOWN');
  await new Promise(setImmediate);
  const teardown = runtime.teardown();
  await teardown;
  await bootFailure;
  assert.equal(observedSignal.aborted, true);
  assert.equal(runtime.state, 'terminated');
});

test('teardown during a pending boot tears down the late guest instead of leaking it', async () => {
  const fake = fakeSdk();
  let resolveBoot;
  const runtime = createVivariRuntime({
    id: 'e',
    isIsolated: () => true,
    loadSdk: async () => ({ boot: () => new Promise((resolve) => { resolveBoot = resolve; }) }),
  });
  const boot = runtime.boot();
  await Promise.resolve();
  const teardown = runtime.teardown();
  resolveBoot(fake.instance);
  await teardown;
  await assert.rejects(boot, (error) => error instanceof RuntimeError && error.code === 'TORN_DOWN');
  assert.equal(fake.calls.teardown, 1);
  assert.equal(runtime.state, 'terminated');
});

test('teardown waits for asynchronous cleanup of a guest that boots late', async () => {
  const fake = fakeSdk();
  let resolveBoot;
  let releaseGuestTeardown;
  fake.instance.teardown = () => {
    fake.calls.teardown++;
    return new Promise((resolve) => { releaseGuestTeardown = resolve; });
  };
  const runtime = createVivariRuntime({
    id: 'late-async-teardown',
    isIsolated: () => true,
    loadSdk: async () => ({ boot: () => new Promise((resolve) => { resolveBoot = resolve; }) }),
  });
  const boot = runtime.boot();
  await new Promise(setImmediate);
  let teardownSettled = false;
  const teardown = runtime.teardown().then(() => { teardownSettled = true; });
  resolveBoot(fake.instance);
  await new Promise(setImmediate);
  assert.equal(fake.calls.teardown, 1);
  assert.equal(teardownSettled, false);
  releaseGuestTeardown();
  await teardown;
  await assert.rejects(boot, (error) => error instanceof RuntimeError && error.code === 'TORN_DOWN');
  assert.equal(runtime.state, 'terminated');
});

test('teardown during a pending SDK load reports termination rather than the late loader failure', async () => {
  let rejectLoad;
  const runtime = createVivariRuntime({
    id: 'loader-race',
    isIsolated: () => true,
    loadSdk: () => new Promise((_resolve, reject) => { rejectLoad = reject; }),
  });
  const boot = runtime.boot();
  await Promise.resolve();
  await runtime.teardown();
  rejectLoad(new Error('SDK network failed after teardown'));
  await assert.rejects(boot, (error) => error instanceof RuntimeError && error.code === 'TORN_DOWN');
  assert.equal(runtime.state, 'terminated');
});

test('server events cannot reach the host once teardown begins, even while preview cleanup is pending', async () => {
  const fake = fakeSdk();
  let releasePreviewCleanup;
  fake.instance.attachPreview = () => () => new Promise((resolve) => { releasePreviewCleanup = resolve; });
  const runtime = createVivariRuntime({ id: 'teardown-event-race', isIsolated: () => true, loadSdk: fake.loader });
  await runtime.boot();
  runtime.attachPreview({});
  let received = 0;
  runtime.on('server-ready', () => { received++; });
  const teardown = runtime.teardown();
  fake.instance.emitServerReady(3111, 'http://stale.test/');
  assert.equal(received, 0);
  releasePreviewCleanup();
  await teardown;
});

test('preview cleanup failure cannot strand the guest during teardown', async () => {
  const fake = fakeSdk();
  fake.instance.attachPreview = () => () => { throw new Error('iframe cleanup failed'); };
  const runtime = createVivariRuntime({ id: 'f', isIsolated: () => true, loadSdk: fake.loader });
  await runtime.boot();
  runtime.attachPreview({});
  await assert.rejects(runtime.teardown(), /iframe cleanup failed/);
  assert.equal(fake.calls.teardown, 1);
  assert.equal(runtime.state, 'terminated');
});

test('teardown retries owned guest cleanup after a prior teardown failure', async () => {
  const fake = fakeSdk();
  let guestTeardownAttempts = 0;
  fake.instance.teardown = () => {
    guestTeardownAttempts++;
    fake.calls.teardown++;
    if (guestTeardownAttempts === 1) throw new Error('guest teardown failed once');
  };
  const runtime = createVivariRuntime({ id: 'retry-failed-teardown', isIsolated: () => true, loadSdk: fake.loader });
  await runtime.boot();
  await assert.rejects(runtime.teardown(), /guest teardown failed once/);
  await runtime.teardown();
  assert.equal(guestTeardownAttempts, 2);
  assert.equal(runtime.state, 'terminated');
});

test('teardown retries a failed runtime event unsubscribe', async () => {
  const fake = fakeSdk();
  let unsubscribeAttempts = 0;
  fake.instance.on = () => () => {
    unsubscribeAttempts++;
    if (unsubscribeAttempts === 1) throw new Error('event unsubscribe failed once');
    fake.calls.unsubscribe++;
  };
  const runtime = createVivariRuntime({ id: 'retry-failed-event-unsubscribe', isIsolated: () => true, loadSdk: fake.loader });
  await runtime.boot();
  runtime.on('server-ready', () => {});
  await assert.rejects(runtime.teardown(), /event unsubscribe failed once/);
  await runtime.teardown();
  assert.equal(unsubscribeAttempts, 2);
  assert.equal(fake.calls.unsubscribe, 1);
  assert.equal(fake.calls.teardown, 2);
  assert.equal(runtime.state, 'terminated');
});

test('teardown waits for asynchronous preview detachment before terminating the guest', async () => {
  const fake = fakeSdk();
  let releasePreviewDetach;
  fake.instance.attachPreview = () => () => new Promise((resolve) => { releasePreviewDetach = resolve; });
  const runtime = createVivariRuntime({ id: 'async-preview-detach', isIsolated: () => true, loadSdk: fake.loader });
  await runtime.boot();
  runtime.attachPreview({});
  let teardownSettled = false;
  const teardown = runtime.teardown().then(() => { teardownSettled = true; });
  await new Promise(setImmediate);
  assert.equal(teardownSettled, false);
  assert.equal(fake.calls.teardown, 0);
  releasePreviewDetach();
  await teardown;
  assert.equal(fake.calls.teardown, 1);
  assert.equal(runtime.state, 'terminated');
});

test('a failed caller preview detach remains owned so teardown can retry it', async () => {
  const fake = fakeSdk();
  let detachAttempts = 0;
  fake.instance.attachPreview = () => () => {
    detachAttempts++;
    if (detachAttempts === 1) throw new Error('temporary iframe cleanup failure');
    fake.calls.detach++;
  };
  const runtime = createVivariRuntime({ id: 'retry-caller-preview-detach', isIsolated: () => true, loadSdk: fake.loader });
  await runtime.boot();
  const detach = runtime.attachPreview({});
  assert.throws(detach, /temporary iframe cleanup failure/);
  await runtime.teardown();
  assert.equal(detachAttempts, 2);
  assert.equal(fake.calls.detach, 1);
  assert.equal(fake.calls.teardown, 1);
  assert.equal(runtime.state, 'terminated');
});

test('teardown shares a caller-initiated asynchronous preview detach instead of invoking it twice', async () => {
  const fake = fakeSdk();
  let releasePreviewDetach;
  fake.instance.attachPreview = () => () => {
    fake.calls.detach++;
    return new Promise((resolve) => { releasePreviewDetach = resolve; });
  };
  const runtime = createVivariRuntime({ id: 'share-pending-preview-detach', isIsolated: () => true, loadSdk: fake.loader });
  await runtime.boot();
  const detach = runtime.attachPreview({});
  const pendingDetach = detach();
  const teardown = runtime.teardown();
  await new Promise(setImmediate);
  assert.equal(fake.calls.detach, 1);
  assert.equal(fake.calls.teardown, 0);
  releasePreviewDetach();
  await Promise.all([pendingDetach, teardown]);
  assert.equal(fake.calls.detach, 1);
  assert.equal(fake.calls.teardown, 1);
  assert.equal(runtime.state, 'terminated');
});

test('concurrent teardown callers share one cleanup instead of rejecting the later caller', async () => {
  const fake = fakeSdk();
  let releaseTeardown;
  fake.instance.teardown = () => {
    fake.calls.teardown++;
    return new Promise((resolve) => { releaseTeardown = resolve; });
  };
  const runtime = createVivariRuntime({ id: 'g', isIsolated: () => true, loadSdk: fake.loader });
  await runtime.boot();
  const first = runtime.teardown();
  const second = runtime.teardown();
  releaseTeardown();
  await Promise.all([first, second]);
  assert.equal(fake.calls.teardown, 1);
  assert.equal(runtime.state, 'terminated');
});
