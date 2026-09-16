import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker, MessageChannel } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

// Focused deterministic audit for the BOLT-WC-005 shell leg: boots the owned
// Vivari runtime's Node-mode kernel (Rust/Wasm VFS worker + process workers,
// no adapter, no browser) and pins EXACTLY what the guest `sh` can and cannot
// do today. The compatibility matrix rows for BOLT-WC-005/BOLT-WC-006 stay
// `blocked` and the browser lab asserts `sh printf` exits 127
// (labs/browser-smoke/src/main.ts, shellCommandUnavailableProof); this file is
// the runtime-level counterpart so the pinned failure cannot silently change:
// - shell builtins work (echo, pwd, exit codes, && / || sequencing);
// - external coreutils installed under /bin resolve (ls);
// - external programs NOT in the clean-room coreutils set fail typed
//   (`sh: printf: not found` + exit 127) — the exact gap the matrix records.
//
// If a future change ships a printf coreutil or alters the typed failure, this
// file fails first; a positive browser proof (AC-4) remains the only path that
// may unblock the matrix row. The kernel source is the pinned submodule;
// nothing here may patch it at test time.

const runtimeRoot = fileURLToPath(new URL('../runtime/vivari/', import.meta.url));
const kernelUrl = new URL('packages/kernel-host/kernel.js', `file://${runtimeRoot}`);
const kernelFsUrl = new URL('packages/kernel-host/kernel-fs.js', `file://${runtimeRoot}`);
const workerTransferUrl = new URL('packages/kernel-host/worker-transfer.js', `file://${runtimeRoot}`);
const fsWorkerUrl = new URL('scripts/fs-worker.mjs', `file://${runtimeRoot}`);
const processWorkerUrl = new URL('scripts/process-worker.mjs', `file://${runtimeRoot}`);

async function makeKernel() {
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

  const kernel = new Kernel({ fs: kernelFs.fs, spawnWorker });
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
  assert.ok(!listing.stdout.split('\n').includes('printf.js'), 'printf must NOT be installed (pinned WC-005 gap)');
});

test('guest sh proves builtins: echo literal, exit codes and cwd via pwd', async (t) => {
  const { kernel, teardown } = await makeKernel();
  t.after(teardown);
  const echo = await runShell(kernel, 'echo nexari-shell-process');
  assert.equal(echo.code, 0, `echo must exit 0, got ${echo.code}`);
  assert.equal(echo.stdout, 'nexari-shell-process\n');
  const status = await runShell(kernel, 'exit 3');
  assert.equal(status.code, 3, 'sh -c exit 3 must propagate exit code 3');
  const cwd = await kernel.start('sh', ['-c', 'pwd'], { cwd: '/work', capture: true });
  assert.equal(cwd.code, 0, `pwd must exit 0, got ${cwd.code}`);
  assert.equal(cwd.stdout.trim(), '/work', 'sh -c pwd must report exactly the cwd passed to spawn');
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
  const printf = await runShell(kernel, 'printf nexari-shell-process');
  assert.equal(printf.code, 127, `printf must exit 127 until a browser proof unblocks it, got ${printf.code}`);
  assert.equal(printf.stdout, '', 'a not-found command must not emit stdout');
  assert.equal(printf.stderr, 'sh: printf: not found\n', 'the failure must stay typed exactly as the matrix records it');
});
