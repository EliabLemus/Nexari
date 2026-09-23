import assert from 'node:assert/strict';
import test from 'node:test';

import { createBoltTerminalSeam } from '../dist/index.js';

function textStream(chunks = [], error) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (error) controller.error(error);
      else controller.close();
    },
  });
}

function inputRecorder({ failWrite = false } = {}) {
  const writes = [];
  return {
    writes,
    stream: new WritableStream({
      write(chunk) {
        if (failWrite) throw new Error('stdin closed');
        writes.push(chunk);
      },
    }),
  };
}

function process({ output = textStream(), stdout = textStream(), stderr = textStream(), exit = Promise.resolve(0), input = inputRecorder().stream } = {}) {
  let kills = 0;
  return {
    pid: 1,
    output,
    stdout,
    stderr,
    input,
    exit,
    kill() { kills++; },
    resize() {},
    get kills() { return kills; },
  };
}

test('terminal seam REPL is an uncapped sh that exposes raw output and becomes inert after stop', async () => {
  const input = inputRecorder();
  let repl = process({ output: textStream(['banner', ' prompt']), input: input.stream, exit: new Promise(() => {}) });
  const calls = [];
  const runtime = {
    spawn: async (...args) => {
      calls.push(args);
      return repl;
    },
  };

  const seam = await createBoltTerminalSeam(runtime);
  assert.deepEqual(calls, [['sh', []]], 'REPL must use an option-less uncapped sh spawn');
  assert.equal(seam.repl.output, repl.output, 'REPL output must remain the raw guest stream');
  assert.equal(seam.repl.alive, true);
  assert.equal(seam.repl.sendStdin('echo hi\n'), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(input.writes, ['echo hi\n']);
  seam.repl.stop();
  seam.repl.stop();
  assert.equal(repl.kills, 1, 'stop must be idempotent');
  assert.equal(seam.repl.alive, false);
  assert.equal(seam.repl.sendStdin('stale\n'), false);
});

test('terminal seam REPL handles rejected exit and rejected input without an unhandled lane', async () => {
  const rejectedExit = Promise.reject(new Error('guest killed'));
  rejectedExit.catch(() => {});
  const exitRepl = process({ exit: rejectedExit });
  const exitSeam = await createBoltTerminalSeam({ spawn: async () => exitRepl });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(exitSeam.repl.alive, false, 'a rejected guest exit closes the lane');

  const input = inputRecorder({ failWrite: true });
  const inputRepl = process({ input: input.stream, exit: new Promise(() => {}) });
  const inputSeam = await createBoltTerminalSeam({ spawn: async () => inputRepl });
  assert.equal(inputSeam.repl.sendStdin('will fail\n'), true, 'synchronous dispatch accepts a live lane');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(inputSeam.repl.alive, false, 'an asynchronous stdin failure closes the lane');
  assert.equal(inputSeam.repl.sendStdin('late\n'), false);
});

test('terminal seam exec captures split stdout/stderr and exact nonzero exit status', async () => {
  const repl = process({ exit: new Promise(() => {}) });
  const exec = process({
    stdout: textStream(['out-', 'one']),
    stderr: textStream(['err-', 'two']),
    exit: Promise.resolve(7),
  });
  const calls = [];
  const runtime = { spawn: async (...args) => {
    calls.push(args);
    return calls.length === 1 ? repl : exec;
  } };
  const seam = await createBoltTerminalSeam(runtime);
  const result = await seam.exec.exec('false', { cwd: '/project', env: { A: '1' } });
  assert.deepEqual(result, { code: 7, stdout: 'out-one', stderr: 'err-two' });
  assert.deepEqual(calls[1], ['sh', ['-c', 'false'], { cwd: '/project', env: { A: '1' } }]);
});

test('terminal seam exec forwards only explicit options and propagates stream failure', async () => {
  const repl = process({ exit: new Promise(() => {}) });
  const streamFailure = new Error('stdout failure');
  const brokenExec = process({ stdout: textStream([], streamFailure), exit: Promise.resolve(0) });
  const calls = [];
  const runtime = { spawn: async (...args) => {
    calls.push(args);
    return calls.length === 1 ? repl : brokenExec;
  } };
  const seam = await createBoltTerminalSeam(runtime);
  await assert.rejects(seam.exec.exec('echo broken'), streamFailure);
  assert.deepEqual(calls[1], ['sh', ['-c', 'echo broken'], undefined]);
});

test('terminal seam exec rejects an already-aborted request without spawning a new guest', async () => {
  const repl = process({ exit: new Promise(() => {}) });
  let calls = 0;
  const runtime = { spawn: async () => {
    calls++;
    return repl;
  } };
  const seam = await createBoltTerminalSeam(runtime);
  const controller = new AbortController();
  const reason = new Error('caller cancelled');
  controller.abort(reason);
  await assert.rejects(seam.exec.exec('sleep 1', { signal: controller.signal }), reason);
  assert.equal(calls, 1, 'only the eager REPL spawn is allowed');
});
