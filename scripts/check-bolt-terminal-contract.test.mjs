import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker, MessageChannel } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

// P0 Bolt terminal seam contract (openspec SPEC-002 §4 / DELTAS Delta 002) —
// kernel-level pins for the REPLACEMENT of Bolt.DIY's JSH/OSC protocol.
//
// Bolt's pinned shell (bolt.diy app/utils/shell.ts @ 2e254ac1) spawns
// `/bin/jsh --osc` and gates its whole command lifecycle on OSC 654:
// `\x1b]654;interactive\x07` enables input, `\x1b]654;exit=<code>:<row>\x07`
// reports completion, and an OSC 'prompt' marks the next command boundary.
//
// Nexari's clean-room sh NEVER emits OSC 654 (verified 2026-09-22: the `sh:`
// template in runtime/vivari/packages/kernel-host/coreutils.js contains no 654
// emitter; the structural no-OSC assertions below make that falsifiable), so
// any facade must gate on the REPLACEMENT protocol pinned here:
// - readiness: the one-time plain-text announce banner, then ANSI prompt draws;
// - command round-trip: echoed/output sentinel text followed by a later prompt
//   redraw (the replacement for waitTillOscCode('prompt'));
// - exit codes are NOT observable through the interactive REPL: drain()
//   discards runLine's status (coreutils.js, the interactive drain) and the
//   lexer has no `$?` expansion — exit capture must ride the separate `sh -c`
//   exec lane, where kernel.start resolves {code, stdout, stderr};
// - interrupt: `\x03` with a foreground child SIGINTs it, the prompt returns,
//   and a follow-up command still executes. The child's numeric exit code is
//   intentionally never asserted: the REPL never surfaces it (runSimple's
//   close handler resolves code==null as 0), so 130/143 claims would be fake.
// - stale input: kernel.sendStdin to a stopped/unknown pid returns false and
//   revives nothing.
//
// Exec-lane exit-code propagation beyond success (exit 3, typed 127 not-found)
// is already pinned in scripts/check-runtime-shell-coreutils.test.mjs and is
// deliberately not duplicated here. Harness: boots the pinned runtime's
// Node-mode kernel exactly like that file (fs-worker + process workers, no
// adapter, no browser). The submodule is pinned; nothing patches it at test
// time. Challenger pre-mortem 2026-09-22 (REVISE_CONTRACT) shaped AC-1/2/3/4
// observables, the uncaptured-spawn stdin lane, and the no-OSC negatives.

const runtimeRoot = fileURLToPath(new URL('../runtime/vivari/', import.meta.url));
const kernelUrl = new URL('packages/kernel-host/kernel.js', `file://${runtimeRoot}`);
const kernelFsUrl = new URL('packages/kernel-host/kernel-fs.js', `file://${runtimeRoot}`);
const workerTransferUrl = new URL('packages/kernel-host/worker-transfer.js', `file://${runtimeRoot}`);
const fsWorkerUrl = new URL('scripts/fs-worker.mjs', `file://${runtimeRoot}`);
const processWorkerUrl = new URL('scripts/process-worker.mjs', `file://${runtimeRoot}`);

// The interactive REPL's one-time startup banner (coreutils.js runInteractive).
// Plain text, no ANSI, cwd-independent: the drift-stable readiness sentinel.
const BANNER = 'Vivari shell — type commands, Enter to run.\n';
// The prompt is drawn as ANSI cyan cwdName + '$ ' reset. Pinned by shape, not
// bytes: the cwd name legitimately changes with `cd`, the ANSI wrapper must not.
const PROMPT_RE = /\x1b\[36m[^\x1b]*\$\x1b\[0m /g;

async function makeKernel({ stdout } = {}) {
  const { Kernel } = await import(kernelUrl.href);
  const { createKernelFs } = await import(kernelFsUrl.href);
  const { initTransferList } = await import(workerTransferUrl.href);

  const fsWorker = new Worker(fileURLToPath(fsWorkerUrl.href));
  let onKernelFsMessage = () => {};
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fs-worker never reported ready')), 10000);
    fsWorker.on('message', (m) => {
      if (m.type === 'ready') {
        clearTimeout(timer);
        resolve();
      } else {
        onKernelFsMessage(m);
      }
    });
  });
  const kernelFs = createKernelFs(fsWorker);
  onKernelFsMessage = kernelFs.onMessage;

  const spawnWorker = (info) => {
    const worker = new Worker(fileURLToPath(processWorkerUrl.href));
    worker.on('message', (m) => {
      const handler = info.on[m.type];
      if (handler) handler(m);
    });
    const { port1, port2 } = new MessageChannel();
    fsWorker.postMessage({ type: 'fs-register', client: info.pid, sab: info.sab, port: port2 }, [port2]);
    worker.postMessage({ type: 'init', sab: info.sab, spec: info.spec, fsPort: port1 }, initTransferList(info, port1));
    return {
      terminate: () => {
        worker.terminate();
        fsWorker.postMessage({ type: 'fs-unregister', client: info.pid });
      },
      postMessage: (m) => worker.postMessage(m),
    };
  };

  const kernel = new Kernel({ fs: kernelFs.fs, spawnWorker, stdout });
  kernel.installCoreutils();
  return {
    kernel,
    teardown() {
      fsWorker.terminate();
    },
  };
}

function text(chunks) {
  return Buffer.concat(chunks).toString();
}

function countPrompts(streamText) {
  PROMPT_RE.lastIndex = 0;
  let n = 0;
  while (PROMPT_RE.exec(streamText)) n++;
  return n;
}

function countOccurrences(streamText, needle) {
  let n = 0;
  let idx = streamText.indexOf(needle);
  while (idx !== -1) {
    n++;
    idx = streamText.indexOf(needle, idx + needle.length);
  }
  return n;
}

async function until(fn, timeoutMs, what) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(`timed out after ${timeoutMs}ms waiting for ${what}`);
}

// Launch the interactive shell the way the facade will: UNCAPPED (no capture,
// no explicit tty) so fd 0 stays on the async stdin lane — capture would flip
// stdin to the kernel's synchronous EOF path and the REPL would never see
// keystrokes. Output flows to the kernel's stdout sink.
async function launchInteractiveSh(t, outChunks) {
  const { kernel, teardown } = await makeKernel({ stdout: (c) => outChunks.push(Buffer.from(c)) });
  t.after(teardown);
  const pid = kernel.launch('sh', [], {});
  assert.ok(pid > 0, 'launch must resolve the clean-room sh');
  await until(() => countPrompts(text(outChunks)) >= 1, 5000, 'the first prompt draw');
  return { kernel, pid, stream: () => text(outChunks) };
}

test('AC-1 replacement readiness: the interactive sh announces with the exact banner, then a structural prompt — never OSC 654', async (t) => {
  const outChunks = [];
  const { kernel, pid, stream } = await launchInteractiveSh(t, outChunks);
  try {
    const s = stream();
    assert.ok(s.startsWith(BANNER), 'the announce banner must open the output stream exactly once, first');
    const afterBanner = s.slice(BANNER.length);
    assert.match(
      afterBanner,
      /^\x1b\[36m[^\x1b]*\$\x1b\[0m /,
      'the first ANSI prompt draw must immediately follow the banner',
    );
    assert.equal(s.includes('\x1b]654;'), false, 'the clean-room sh must not emit Bolt JSH OSC 654 sequences');
  } finally {
    kernel.stop(pid);
  }
});

test('AC-2 replacement command lane: typed command output is followed by a prompt redraw — with no exit code observable', async (t) => {
  const outChunks = [];
  const { kernel, pid, stream } = await launchInteractiveSh(t, outChunks);
  try {
    const promptsBefore = countPrompts(stream());
    // The typed line is echoed per keystroke, so the sentinel appears twice:
    // once in the echo, once in the command's real output. Require both.
    kernel.sendStdin(pid, 'echo BOLT-CONTRACT-ECHO\n');
    await until(() => countOccurrences(stream(), 'BOLT-CONTRACT-ECHO') >= 2, 5000, 'the echo sentinel beyond its keystroke echo');
    await until(() => countPrompts(stream()) > promptsBefore, 5000, 'a prompt redraw after the command');
    assert.equal(stream().includes('\x1b]654;'), false, 'no OSC 654 in the round-trip stream');
  } finally {
    kernel.stop(pid);
  }
});

test('AC-2b lane divergence: REPL cwd changes stay in the REPL; the exec lane keeps its spawn cwd', async (t) => {
  const outChunks = [];
  const { kernel, pid, stream } = await launchInteractiveSh(t, outChunks);
  try {
    kernel.sendStdin(pid, 'cd /etc\n');
    // `cd` has no output; its only observable is the NEXT prompt draw carrying
    // the new cwd name (probe 2026-09-22: boot prompt `/$` → post-cd prompt
    // `etc$`). No prompt redraw after cd ⇒ the exec-lane probe below would run
    // while the REPL is still mid-command and the divergence pin would be vacuous.
    await until(() => stream().includes('\x1b[36metc$\x1b[0m '), 5000, 'the REPL prompt tracking cd /etc');
    // The facade's exit-capture lane boots fresh shells: it must NOT inherit
    // the REPL's interactive cwd (or env — same one-long-lived-process rule).
    const exec = await kernel.start('sh', ['-c', 'pwd'], { cwd: '/', capture: true });
    assert.equal(exec.code, 0, `exec lane must exit 0, got ${exec.code}`);
    assert.equal(exec.stdout, '/\n', 'the exec lane must start from its spawn cwd, not the REPL cwd');
    kernel.sendStdin(pid, 'pwd\n');
    await until(() => stream().includes('/etc\n'), 5000, 'the REPL still reporting its own cwd');
    assert.equal(stream().includes('\x1b]654;'), false, 'no OSC 654 in the divergence stream');
  } finally {
    kernel.stop(pid);
  }
});

test('AC-3 exec lane: sh -c resolves the exact exit code, stdout, and clean stderr for the facade exit-capture lane', async (t) => {
  const { kernel, teardown } = await makeKernel();
  t.after(teardown);
  const ok = await kernel.start('sh', ['-c', 'echo BOLT-CONTRACT-LANE'], { capture: true });
  assert.equal(ok.code, 0, `the success leg must exit 0, got ${ok.code}`);
  assert.equal(ok.stdout, 'BOLT-CONTRACT-LANE\n');
  assert.equal(ok.stderr, '', 'the success leg must keep stderr clean');
  // Failure legs (exit 3 propagation, typed 127 not-found) are pinned in
  // scripts/check-runtime-shell-coreutils.test.mjs and not duplicated here.
});

test('AC-4 interrupt: Ctrl+C SIGINTs the foreground child, restores the prompt, and the REPL stays answerable', async (t) => {
  const outChunks = [];
  const { kernel, pid, stream } = await launchInteractiveSh(t, outChunks);
  try {
    // A long-running foreground child with observable heartbeats. The echoed
    // command itself contains the sentinel, so require echo + >=2 real ticks.
    kernel.sendStdin(pid, 'node -e \'setInterval(()=>console.log("BOLT-CONTRACT-TICK"),40)\'\n');
    await until(() => countOccurrences(stream(), 'BOLT-CONTRACT-TICK') >= 3, 5000, 'the foreground child ticking beyond its echo');
    const ticksAtInterrupt = countOccurrences(stream(), 'BOLT-CONTRACT-TICK');
    const promptsAtInterrupt = countPrompts(stream());
    kernel.sendStdin(pid, '\x03');
    await until(() => countPrompts(stream()) > promptsAtInterrupt, 5000, 'the prompt restored after SIGINT');
    // Give a would-be survivor several tick intervals, then require silence.
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(
      countOccurrences(stream(), 'BOLT-CONTRACT-TICK'),
      ticksAtInterrupt,
      'the foreground child must be dead after Ctrl+C (no further ticks)',
    );
    kernel.sendStdin(pid, 'echo BOLT-CONTRACT-AFTER\n');
    await until(() => countOccurrences(stream(), 'BOLT-CONTRACT-AFTER') >= 2, 5000, 'a follow-up command after the interrupt');
    assert.equal(stream().includes('\x1b]654;'), false, 'no OSC 654 around the interrupt');
    // Source pin, not an assertion: the REPL never surfaces the child's numeric
    // exit code — runSimple's close handler resolves code==null as 0 and drain()
    // discards it — so the facade must not claim 130/143 propagation either.
  } finally {
    kernel.stop(pid);
  }
});

test('AC-5 stale input: sendStdin to a stopped or unknown pid returns false and revives nothing', async (t) => {
  const outChunks = [];
  const { kernel, pid, stream } = await launchInteractiveSh(t, outChunks);
  kernel.stop(pid);
  assert.equal(kernel.sendStdin(pid, 'echo BOLT-CONTRACT-GHOST\n'), false, 'sendStdin to a stopped pid must return false');
  assert.equal(kernel.sendStdin(999999, 'x'), false, 'sendStdin to a never-known pid must return false');
  await new Promise((r) => setTimeout(r, 250));
  const s = stream();
  assert.equal(s.includes('BOLT-CONTRACT-GHOST'), false, 'a stopped shell must not execute stale input');
  assert.equal(countPrompts(s), 1, 'no prompt revival after teardown');
  assert.equal(s.includes('\x1b]654;'), false, 'no OSC 654 after teardown');
});
