import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RuntimeError,
  RuntimeLifecycle,
  createRuntime,
  unsupportedCapabilities,
} from '../dist/index.js';

test('stackblitz selection rejects without importing external resources', async () => {
  await assert.rejects(
    () => createRuntime({ backend: 'stackblitz' }),
    (error) => error instanceof RuntimeError && error.code === 'BACKEND_UNAVAILABLE',
  );
});

test('lifecycle only permits idempotent teardown after termination', () => {
  const lifecycle = new RuntimeLifecycle();
  assert.equal(lifecycle.state, 'created');
  lifecycle.beginBoot();
  lifecycle.markReady();
  lifecycle.beginTeardown();
  lifecycle.markTerminated();
  lifecycle.markTerminated();
  assert.equal(lifecycle.state, 'terminated');
  assert.throws(() => lifecycle.beginBoot(), (error) => error instanceof RuntimeError && error.code === 'TORN_DOWN');
});

test('unsupported browser-runtime capabilities are explicit', () => {
  assert.deepEqual(unsupportedCapabilities(), {
    native_addons: 'unsupported',
    docker: 'unsupported',
    tcp_remote: 'unsupported',
    udp: 'unsupported',
    ssh: 'unsupported',
    linux_binary: 'unsupported',
  });
});
