import assert from 'node:assert/strict';
import test from 'node:test';

import { RuntimeError } from '../../runtime-contract/dist/index.js';
import { createVivariRuntime } from '../dist/index.js';

function loaderReturning(guest) {
  return async () => ({ boot: async () => guest });
}

function shapeCompleteGuest() {
  const noop = () => {};
  return {
    fs: {
      readFile: async () => new Uint8Array(),
      writeFile: async () => {},
      readdir: async () => [],
      mkdir: async () => {},
      rm: async () => {},
    },
    spawn: async () => {
      throw new Error('not expected in this test');
    },
    teardown: () => {},
  };
}

test('boot fails typed when the loaded SDK returns a guest missing teardown', async () => {
  const guest = shapeCompleteGuest();
  delete guest.teardown;
  const runtime = createVivariRuntime({ id: 'shape-missing-teardown', isIsolated: () => true, loadSdk: loaderReturning(guest) });
  await assert.rejects(
    runtime.boot(),
    (error) =>
      error instanceof RuntimeError
      && error.code === 'BOOT_FAILED'
      && /invalid runtime instance/.test(error.message),
  );
  assert.equal(runtime.state, 'terminated');
});

test('boot fails typed when the loaded SDK returns a guest missing an fs member', async () => {
  const guest = shapeCompleteGuest();
  delete guest.fs.rm;
  const runtime = createVivariRuntime({ id: 'shape-missing-rm', isIsolated: () => true, loadSdk: loaderReturning(guest) });
  await assert.rejects(
    runtime.boot(),
    (error) => error instanceof RuntimeError && error.code === 'BOOT_FAILED' && /invalid runtime instance/.test(error.message),
  );
  assert.equal(runtime.state, 'terminated');
});

test('boot fails typed when a non-function member masquerades as the guest fs', async () => {
  const guest = shapeCompleteGuest();
  guest.fs.readFile = 'not-a-function';
  const runtime = createVivariRuntime({ id: 'shape-nonfunction-fs', isIsolated: () => true, loadSdk: loaderReturning(guest) });
  await assert.rejects(
    runtime.boot(),
    (error) => error instanceof RuntimeError && error.code === 'BOOT_FAILED' && /invalid runtime instance/.test(error.message),
  );
  assert.equal(runtime.state, 'terminated');
});

test('boot fails typed when the loaded SDK returns a null guest', async () => {
  const runtime = createVivariRuntime({ id: 'shape-null-guest', isIsolated: () => true, loadSdk: loaderReturning(null) });
  await assert.rejects(
    runtime.boot(),
    (error) => error instanceof RuntimeError && error.code === 'BOOT_FAILED' && /invalid runtime instance/.test(error.message),
  );
  assert.equal(runtime.state, 'terminated');
});

test('boot fails typed when the loaded SDK returns a primitive guest', async () => {
  const runtime = createVivariRuntime({ id: 'shape-primitive-guest', isIsolated: () => true, loadSdk: loaderReturning(42) });
  await assert.rejects(
    runtime.boot(),
    (error) => error instanceof RuntimeError && error.code === 'BOOT_FAILED' && /invalid runtime instance/.test(error.message),
  );
  assert.equal(runtime.state, 'terminated');
});

test('a shape-complete guest with an unknown-returning boot still boots to ready', async () => {
  const tornDown = [];
  const guest = shapeCompleteGuest();
  guest.teardown = () => {
    tornDown.push('guest');
  };
  const runtime = createVivariRuntime({ id: 'shape-complete-ready', isIsolated: () => true, loadSdk: loaderReturning(guest) });
  await runtime.boot();
  assert.equal(runtime.state, 'ready');
  await runtime.teardown();
  assert.deepEqual(tornDown, ['guest']);
});

test('a torn-down runtime still wins the error race over a malformed guest', async () => {
  let releaseBoot;
  const gate = new Promise((resolve) => {
    releaseBoot = resolve;
  });
  const runtime = createVivariRuntime({
    id: 'shape-teardown-race',
    isIsolated: () => true,
    loadSdk: async () => ({ boot: async () => {
      await gate;
      return 42;
    } }),
  });
  const bootPromise = runtime.boot();
  await runtime.teardown();
  releaseBoot();
  await assert.rejects(bootPromise, (error) => error instanceof RuntimeError && error.code === 'TORN_DOWN');
});
