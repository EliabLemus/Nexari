import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker, MessageChannel } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

// Focused deterministic audit for the BOLT-WC-005 shell leg: boots the owned
// Vivari runtime's Node-mode kernel (Rust/Wasm VFS worker + process workers,
// no adapter, no browser) and pins EXACTLY what the guest `sh` can and cannot
// do today. The compatibility matrix row for BOLT-WC-006 stays `blocked` and
// the browser lab proves the printf shell leg positively
// (labs/browser-smoke/src/main.ts, shellSpawnProof); this file is the
// runtime-level counterpart so the guest shell contract cannot silently change:
// - shell builtins work (echo, pwd, exit codes, && / || sequencing);
// - external coreutils installed under /bin resolve (ls);
// - the printf coreutil formats arguments with an observable exit, and an
//   unsupported directive fails typed rather than silently mis-formatting;
// - external programs NOT in the clean-room coreutils set still fail typed
//   (`sh: seq: not found` + exit 127) — seq is deliberately absent, so this
//   stays the pinned not-found shape for any future uninstalled command.
//
// If a future change removes the printf coreutil or alters the typed
// not-found failure, this file fails first. The kernel source is the pinned
// submodule; nothing here may patch it at test time.

const runtimeRoot = fileURLToPath(new URL('../runtime/vivari/', import.meta.url));
const kernelUrl = new URL('packages/kernel-host/kernel.js', `file://${runtimeRoot}`);
const kernelFsUrl = new URL('packages/kernel-host/kernel-fs.js', `file://${runtimeRoot}`);
const workerTransferUrl = new URL('packages/kernel-host/worker-transfer.js', `file://${runtimeRoot}`);
const fsWorkerUrl = new URL('scripts/fs-worker.mjs', `file://${runtimeRoot}`);
const processWorkerUrl = new URL('scripts/process-worker.mjs', `file://${runtimeRoot}`);

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
      // Terminate the fs-worker; the kernel's stall timer was .unref()'d so
      // the only ref'd thread keeping the process alive is this one.
      fsWorker.terminate();
    },
  };
}

async function runShell(kernel, script, options = {}) {
  const p = await kernel.start('sh', ['-c', script], { cwd: '/', capture: true, ...options });
  return { code: p.code, stdout: p.stdout, stderr: p.stderr };
}

test('node-mode kernel boots, installs coreutils under /bin, and resolves sh', async (t) => {
  const { kernel, teardown } = await makeKernel();
  t.after(teardown);
  assert.deepEqual(kernel.readdir('/').sort(), ['bin', 'etc', 'usr'], '/bin must exist after installCoreutils');
  const listing = await runShell(kernel, 'ls /bin');
  assert.equal(listing.code, 0, `ls /bin must exit 0, got ${listing.code}`);
  assert.ok(listing.stdout.split('\n').includes('sh.js'), 'the clean-room sh must be installed under /bin');
  assert.ok(listing.stdout.split('\n').includes('printf.js'), 'the printf coreutil must be installed under /bin');
});

test('guest sh proves builtins: echo literal, exit codes and cwd via pwd', async (t) => {
  const { kernel, teardown } = await makeKernel();
  t.after(teardown);
  const echo = await runShell(kernel, 'echo nexari-shell-process');
  assert.equal(echo.code, 0, `echo must exit 0, got ${echo.code}`);
  assert.equal(echo.stdout, 'nexari-shell-process\n');
  const status = await runShell(kernel, 'exit 3');
  assert.equal(status.code, 3, 'sh -c exit 3 must propagate exit code 3');
  const cwd = await runShell(kernel, 'pwd', { cwd: '/work' });
  assert.equal(cwd.code, 0, `pwd must exit 0, got ${cwd.code}`);
  assert.equal(cwd.stdout.trim(), '/work', 'sh -c pwd must report exactly the cwd passed to spawn');
});

test('POSITIVE: printf coreutil formats arguments with an observable exit (BOLT-WC-005)', async (t) => {
  const { kernel, teardown } = await makeKernel();
  t.after(teardown);
  // Literal text + trailing newline escape: the browser E2E pins exactly this
  // shape (exit 0, stdout with the trailing newline, empty stderr).
  const literal = await runShell(kernel, "printf 'nexari-shell-process\\n'");
  assert.equal(literal.code, 0, `printf literal must exit 0, got ${literal.code}`);
  assert.equal(literal.stdout, 'nexari-shell-process\n');
  assert.equal(literal.stderr, '', 'printf must not emit stderr on success');
  // %s consumes an argument; %d formats an integer; %% is a literal percent.
  const specifiers = await runShell(kernel, "printf '%s scored %d%%\\n' nexari 99");
  assert.equal(specifiers.code, 0, `printf specifiers must exit 0, got ${specifiers.code}`);
  assert.equal(specifiers.stdout, 'nexari scored 99%\n');
  // POSIX format reuse: after consuming `a b`, the leftover `c` starts a second
  // pass where the second %s has no argument and degrades to '' (host GNU
  // printf prints exactly "a-b\nc-\n").
  const reused = await runShell(kernel, "printf '%s-%s\\n' a b c");
  assert.equal(reused.code, 0, `printf format reuse must exit 0, got ${reused.code}`);
  assert.equal(reused.stdout, 'a-b\nc-\n');
  // An unsupported directive must fail TYPED, never silently emit wrong output.
  const unsupported = await runShell(kernel, "printf '%f\\n' 1.5");
  assert.equal(unsupported.code, 1, `printf unsupported directive must exit 1, got ${unsupported.code}`);
  assert.equal(unsupported.stdout, '', 'an unsupported directive must not emit stdout');
  assert.match(unsupported.stderr, /printf: %f: unsupported directive/);
});

test('guest sh sequences commands and recovers from a missing command', async (t) => {
  const { kernel, teardown } = await makeKernel();
  t.after(teardown);
  const sequence = await runShell(kernel, 'echo ok && echo done');
  assert.equal(sequence.code, 0);
  assert.equal(sequence.stdout, 'ok\ndone\n');
  const fallback = await runShell(kernel, 'nosuchcmd || echo recovered');
  assert.equal(fallback.code, 0);
  assert.equal(fallback.stdout, 'recovered\n');
  assert.match(fallback.stderr, /nosuchcmd: not found/);
});

test('PINNED FAILURE: external coreutil outside the clean-room set fails typed (BOLT-WC-005)', async (t) => {
  const { kernel, teardown } = await makeKernel();
  t.after(teardown);
  const seq = await runShell(kernel, 'seq 3');
  assert.equal(seq.code, 127, `seq must exit 127 (deliberately absent from the clean-room coreutils set), got ${seq.code}`);
  assert.equal(seq.stdout, '', 'a not-found command must not emit stdout');
  assert.equal(seq.stderr, 'sh: seq: not found\n', 'the failure must stay typed exactly as the matrix records it');
});

test('AC-1 initial TTY: terminal-capable guest observes isTTY and configured dimensions (BOLT-WC-006 resize step 1)', async (t) => {
  const { kernel, teardown } = await makeKernel();
  t.after(teardown);
  // NEXARI-WC006-RESIZE-001 AC-1: a process spawned terminal-capable observes
  // process.stdout.isTTY === true plus configured positive finite integer
  // columns/rows. capture+tty together model a pty harness: output is
  // collected, but the streams face a terminal — the spawner must say so
  // explicitly (capture alone honestly means pipes). This is the first half of
  // the spec; resize + SIGWINCH are later steps and must not silently appear here.
  const probe = await kernel.start(
    'node',
    ['-e', 'console.log(JSON.stringify({out: process.stdout.isTTY === true, err: process.stderr.isTTY === true, cols: process.stdout.columns, rows: process.stdout.rows}))'],
    { capture: true, tty: true, columns: 100, rows: 30 },
  );
  assert.equal(probe.code, 0, `TTY dims probe must exit 0, got ${probe.code}: ${probe.stderr}`);
  const observed = JSON.parse(probe.stdout);
  assert.equal(observed.out, true, 'process.stdout.isTTY must be true for a terminal-capable spawn');
  // stderr shares the single tty flag for now; per-stream TTY truth (stdout tty,
  // stderr pipe) is a deferred later AC and will tighten this assertion.
  assert.equal(observed.err, true, 'process.stderr.isTTY must be true for a terminal-capable spawn');
  assert.equal(observed.cols, 100, 'process.stdout.columns must carry the configured width');
  assert.equal(observed.rows, 30, 'process.stdout.rows must carry the configured height');
});

test('AC-1 default TTY semantics: uncaptured spawns face a terminal, capture-only stays pipe-shaped (BOLT-WC-006 resize step 1)', async (t) => {
  const outChunks = [];
  const { kernel, teardown } = await makeKernel({ stdout: (chunk) => outChunks.push(Buffer.from(chunk)) });
  t.after(teardown);
  // NEXARI-WC006-RESIZE-001 AC-1 (Challenger finding, review 2026-09-16): the
  // runtime's pre-existing rule is tty = !capture when the spawner says nothing,
  // and the builtins' process now reports that answer instead of a hardcoded
  // false. Pin BOTH default paths so the contract cannot silently drift:
  // - uncaptured (no tty, no capture) -> isTTY true + 80x24 defaults;
  // - capture-only -> isTTY false + 80x24 defaults, output captured not sunk.
  const probeScript = '-e', probeArgs = ['console.log(JSON.stringify({out: process.stdout.isTTY === true, cols: process.stdout.columns, rows: process.stdout.rows}))'];
  const interactive = await kernel.start('node', [probeScript, probeArgs[0]], {});
  assert.equal(interactive.code, 0, `uncaptured probe must exit 0, got ${interactive.code}: ${interactive.stderr}`);
  const seen = JSON.parse(Buffer.concat(outChunks).toString());
  assert.equal(seen.out, true, 'an uncaptured spawn faces a terminal (tty derives from !capture)');
  assert.equal(seen.cols, 80, 'columns fall back to 80 when the spawner sends none');
  assert.equal(seen.rows, 24, 'rows fall back to 24 when the spawner sends none');

  const captured = await kernel.start('node', [probeScript, probeArgs[0]], { capture: true });
  assert.equal(captured.code, 0, `captured probe must exit 0, got ${captured.code}: ${captured.stderr}`);
  const observed = JSON.parse(captured.stdout);
  assert.equal(observed.out, false, 'a capture-only spawn stays pipe-shaped (isTTY false)');
  assert.equal(observed.cols, 80, 'captured spawn still gets the 80-column default');
  assert.equal(observed.rows, 24, 'captured spawn still gets the 24-row default');
  assert.equal(outChunks.length, 1, 'captured output must not leak to the host stdout sink');
});

async function until(fn, timeoutMs, what) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(`timed out after ${timeoutMs}ms waiting for ${what}`);
}

// NEXARI-WC006-RESIZE-001 step 2 probe: every tick is a FRESH read of
// process.stdout's dimensions, printed as one JSON line to the host sink.
const resizeProbeScript =
  'let seq = 0; setInterval(() => { seq += 1; console.log(JSON.stringify({seq, cols: process.stdout.columns, rows: process.stdout.rows})); }, 60);';

function sinkLines(outChunks) {
  return Buffer.concat(outChunks)
    .toString()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

test('AC-2 resize control: a live terminal-capable process observes new dimensions (BOLT-WC-006 resize step 2)', async (t) => {
  const outChunks = [];
  const { kernel, teardown } = await makeKernel({ stdout: (chunk) => outChunks.push(Buffer.from(chunk)) });
  t.after(teardown);
  // kernel.resize(pid, columns, rows) updates a LIVE process's TTY dimensions
  // and the next observation sees them. The probe prints {seq, cols, rows} on a
  // timer (Challenger protocol, review 2026-09-16): seq>=1 is awaited BEFORE the
  // resize so the pre-state is truly observed, then a post-resize tick must show
  // 100x30 within a bounded window. SIGWINCH — telling the guest a resize
  // HAPPENED — is the next step of the spec and is deliberately not asserted.
  const pid = kernel.launch('node', ['-e', resizeProbeScript], {});
  assert.ok(pid > 0, 'launch must return a real pid');
  const lines = () => sinkLines(outChunks);
  await until(() => lines().some((o) => o.seq >= 1), 5000, 'the first probe tick');
  assert.equal(kernel.resize(pid, 100, 30), true, 'resize on a live pid must succeed');
  await until(
    () => lines().some((o) => o.seq >= 2 && o.cols === 100 && o.rows === 30),
    5000,
    'a post-resize tick observing 100x30',
  );
  kernel.stop(pid);
});

test('AC-2 resize control: invalid dims are refused and an exited pid is false (BOLT-WC-006 resize step 2)', async (t) => {
  const outChunks = [];
  const { kernel, teardown } = await makeKernel({ stdout: (chunk) => outChunks.push(Buffer.from(chunk)) });
  t.after(teardown);
  const pid = kernel.launch('node', ['-e', resizeProbeScript], {});
  assert.ok(pid > 0, 'launch must return a real pid');
  const lines = () => sinkLines(outChunks);
  await until(() => lines().some((o) => o.seq >= 1), 5000, 'the first probe tick');
  // Challenger finding (review 2026-09-16): the kernel refuses invalid dims the
  // same way it refuses a missing pid — returns false, posts nothing — so the
  // streams keep the values they booted with (80x24 defaults).
  for (const dims of [
    [0, 30],
    [100, -1],
    [1.5, 30],
    [100, 1001],
    ['100', 30],
  ]) {
    assert.equal(kernel.resize(pid, dims[0], dims[1]), false, `resize(${JSON.stringify(dims)}) must be refused`);
  }
  await until(() => lines().some((o) => o.seq >= 2), 5000, 'a post-refusal tick');
  const last = lines().filter((o) => o.seq >= 2).pop();
  assert.equal(last.cols, 80, 'columns must be unchanged after refusals');
  assert.equal(last.rows, 24, 'rows must be unchanged after refusals');
  kernel.stop(pid);
  assert.equal(kernel.resize(pid, 100, 30), false, 'resize on a stopped pid must return false');

  const done = await kernel.start('node', ['-e', ''], { capture: true });
  assert.equal(done.code, 0, `the short probe must exit 0, got ${done.code}: ${done.stderr}`);
  assert.equal(kernel.resize(done.pid, 100, 30), false, 'resize on an exited pid must return false');
});
