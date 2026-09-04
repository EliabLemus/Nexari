import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { terminateChild } from './browser-smoke-cleanup.mjs';

test('terminates a browser-lab child and waits for its exit before resolving', async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  const signals = [];
  child.kill = (signal) => {
    signals.push(signal);
    queueMicrotask(() => {
      child.exitCode = signal === 'SIGTERM' ? 0 : 1;
      child.emit('exit', child.exitCode, signal);
    });
    return true;
  };

  await terminateChild(child, { graceMs: 50 });

  assert.deepEqual(signals, ['SIGTERM']);
  assert.equal(child.exitCode, 0);
});

test('does not wait forever when a browser-lab child has already exited before cleanup can signal it', async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  const signals = [];
  child.kill = (signal) => {
    signals.push(signal);
    return false;
  };

  await Promise.race([
    terminateChild(child, { graceMs: 10 }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('cleanup waited for an already-exited child')), 100)),
  ]);

  assert.deepEqual(signals, ['SIGTERM']);
});
