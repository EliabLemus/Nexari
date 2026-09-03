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

test('vivari selection links only to the owned adapter and preserves injected isolation checks', async () => {
  let booted = 0;
  const runtime = await createRuntime({
    backend: 'vivari',
    id: 'contract-linked-vivari',
    isIsolated: () => false,
    loadSdk: async () => ({
      boot: async () => {
        booted++;
        throw new Error('must not boot without isolation');
      },
    }),
  });
  assert.equal(runtime.id, 'contract-linked-vivari');
  await assert.rejects(runtime.boot(), (error) => error instanceof RuntimeError && error.code === 'ISOLATION_REQUIRED');
  assert.equal(booted, 0);
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

test('browser-runtime capabilities explicitly disclose the experimental filesystem watcher', () => {
  assert.deepEqual(unsupportedCapabilities(), {
    native_addons: 'unsupported',
    docker: 'unsupported',
    tcp_remote: 'unsupported',
    udp: 'unsupported',
    ssh: 'unsupported',
    linux_binary: 'unsupported',
    permission_changes: 'unsupported',
    symlinks: 'unsupported',
    filesystem_watch: 'experimental',
    interactive_terminal: 'unsupported',
    text_search: 'unsupported',
  });
});
