/**
 * Terminal seam contract tests — prove the BoltTerminalSeam type is
 * well-formed and the two-lane replacement protocol is implementable.
 *
 * This is a structural type-level test plus runtime sentinel validation.
 * Kernel-level behavioral pins live in scripts/check-bolt-terminal-contract.test.mjs.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REPL_BANNER,
  PROMPT_SHAPE,
} from '../dist/index.js';

// ---------------------------------------------------------------------------
// AC-1: REPL_BANNER sentinel is exact and drift-stable
// ---------------------------------------------------------------------------
test('AC-1 REPL_BANNER is the one-time startup announce text with no ANSI', () => {
  assert.equal(REPL_BANNER, 'Vivari shell — type commands, Enter to run.\n');
  assert.equal(REPL_BANNER.includes('\x1b'), false, 'banner must be plain text, no ANSI');
});

// ---------------------------------------------------------------------------
// AC-2: PROMPT_SHAPE regex matches the structural ANSI prompt
// ---------------------------------------------------------------------------
test('AC-2 PROMPT_SHAPE matches the ANSI cyan-cwd-dollar-reset prompt structure', () => {
  const typical = '\x1b[36m/$\x1b[0m ';
  assert.match(typical, PROMPT_SHAPE, 'the default root prompt must match');
  const afterCd = '\x1b[36metc$\x1b[0m ';
  assert.match(afterCd, PROMPT_SHAPE, 'a cd-changed prompt must match');
  const deep = '\x1b[36mhome/user/projects$\x1b[0m ';
  assert.match(deep, PROMPT_SHAPE, 'a deep cwd prompt must match');
});

test('AC-2 PROMPT_SHAPE rejects non-ANSI or malformed prompts', () => {
  assert.doesNotMatch('/$ ', PROMPT_SHAPE, 'plain text without ANSI must not match');
  assert.doesNotMatch('\x1b[36m\x1b[0m ', PROMPT_SHAPE, 'empty cwd segment must not match');
});

// ---------------------------------------------------------------------------
// AC-3: InteractiveReplLane contract shape — sendStdin returns boolean,
//       output is a ReadableStream, stop and alive are present
// ---------------------------------------------------------------------------
test('AC-3 InteractiveReplLane contract shape is implementable', () => {
  const mockRepl = {
    sendStdin: /** @param {string} _data */ (_data) => true,
    output: new ReadableStream(),
    stop: () => {},
    get alive() { return true; },
  };
  assert.equal(typeof mockRepl.sendStdin, 'function');
  assert.ok(mockRepl.output instanceof ReadableStream);
  assert.equal(typeof mockRepl.stop, 'function');
  assert.equal(mockRepl.alive, true);
  // The REPL lane does NOT surface exit codes — sendStdin returns boolean
  assert.equal(mockRepl.sendStdin('echo hi\n'), true);
});

// ---------------------------------------------------------------------------
// AC-4: ExecCaptureLane contract shape — exec returns {code, stdout, stderr}
// ---------------------------------------------------------------------------
test('AC-4 ExecCaptureLane contract shape is implementable with exit-code propagation', async () => {
  const mockExec = {
    exec: async (_command, _options) => ({
      code: 0,
      stdout: 'ok\n',
      stderr: '',
    }),
  };
  const result = await mockExec.exec('echo ok');
  assert.equal(result.code, 0, 'exec lane must surface exit code 0');
  assert.equal(result.stdout, 'ok\n');
  assert.equal(result.stderr, '');
  assert.ok(typeof result.code === 'number', 'exit code must be numeric');
});

// ---------------------------------------------------------------------------
// AC-5: BoltTerminalSeam composes both lanes
// ---------------------------------------------------------------------------
test('AC-5 BoltTerminalSeam composes REPL and exec lanes', async () => {
  const seam = {
    repl: {
      sendStdin: () => true,
      output: new ReadableStream(),
      stop: () => {},
      get alive() { return true; },
    },
    exec: {
      exec: async () => ({ code: 0, stdout: '', stderr: '' }),
    },
  };
  // The REPL lane gates on prompt draws, not OSC
  assert.equal(typeof seam.repl.sendStdin, 'function');
  assert.equal(typeof seam.repl.stop, 'function');
  // The exec lane surfaces exit codes the REPL cannot
  const result = await seam.exec.exec('true');
  assert.equal(typeof result.code, 'number', 'exec lane must return numeric exit code');
});

// ---------------------------------------------------------------------------
// AC-6: no-OSC invariant — the sentinels contain no JSH/OSC 654 escape
// ---------------------------------------------------------------------------
test('AC-6 REPL_BANNER and PROMPT_SHAPE contain no OSC 654 dependency', () => {
  const OSC_654 = '\x1b]654;';
  assert.equal(REPL_BANNER.includes(OSC_654), false, 'banner must not contain OSC 654');
  // PROMPT_SHAPE is a regex — check its source
  assert.equal(PROMPT_SHAPE.source.includes('654'), false, 'prompt regex must not reference OSC 654');
});
