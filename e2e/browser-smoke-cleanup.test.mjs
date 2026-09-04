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
