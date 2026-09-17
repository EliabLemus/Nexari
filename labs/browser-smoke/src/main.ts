import { createVivariRuntime, loadPinnedVivariSdk, resetPinnedVivariVfs } from '../../../packages/vivari-adapter/src/index.ts';

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const output = document.querySelector<HTMLPreElement>('#output')!;
const preview = document.querySelector<HTMLIFrameElement>('#preview')!;
const teardownButton = document.querySelector<HTMLButtonElement>('#teardown')!;
const rebootButton = document.querySelector<HTMLButtonElement>('#reboot')!;
let activeRuntime: ReturnType<typeof createVivariRuntime> | undefined;
let serverProcess: Awaited<ReturnType<ReturnType<typeof createVivariRuntime>['spawn']>> | undefined;

const write = (line: string) => { output.textContent += `${line}\n`; };
const project = {
  'server.js': { file: { contents: [
    "import { createServer } from 'node:http';",
    "const server = createServer((_, res) => { res.setHeader('content-type', 'text/plain'); res.end('Nexari runtime preview OK'); });",
    "server.listen(3111, () => console.log('ready'));",
  ].join('\n') } },
  'stdin-echo.js': { file: { contents: [
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => process.stdout.write(`stdin:${chunk}`));",
  ].join('\n') } },
  'stall.js': { file: { contents: [
    "process.stdout.write('stalled\\n');",
    'setInterval(() => {}, 1_000);',
  ].join('\n') } },
  'process-options.js': { file: { contents: [
    "process.stdout.write(JSON.stringify({ cwd: process.cwd(), option: process.env.NEXARI_PROCESS_OPTION, args: process.argv.slice(2) }));",
  ].join('\n') } },
  'tty-probe.js': { file: { contents: [
    "process.stdout.write(JSON.stringify({ tty: process.stdout.isTTY === true, cols: process.stdout.columns, rows: process.stdout.rows }));",
    "process.on('SIGWINCH', () => process.stdout.write(JSON.stringify({ winch: true, cols: process.stdout.columns, rows: process.stdout.rows })));",
    "let seq = 0;",
    "setInterval(() => { seq += 1; process.stdout.write(JSON.stringify({ seq })); }, 60);",
  ].join('\n') } },
  'package.json': { file: { contents: JSON.stringify({
    name: 'nexari-browser-smoke-fixture',
    private: true,
    scripts: { 'nexari-spawn-proof': 'node npm-spawn-proof.js' },
  }) } },
  'npm-spawn-proof.js': { file: { contents: [
    "process.stdout.write(`NEXARI_NPM_PROOF=${JSON.stringify({ cwd: process.cwd(), option: process.env.NEXARI_NPM_OPTION, args: process.argv.slice(2) })}\\n`);",
  ].join('\n') } },
};

async function bootRuntime() {
  if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    const runtime = createVivariRuntime({ id: crypto.randomUUID(), loadSdk: loadPinnedVivariSdk });
    try {
      await runtime.boot();
      throw new Error('Vivari adapter booted without the browser isolation prerequisite');
    } catch (error) {
      if (!(error instanceof Error) || (error as { code?: unknown }).code !== 'ISOLATION_REQUIRED') {
        throw error;
      }
    }
    status.dataset.state = 'isolation-failed';
    status.dataset.errorCode = 'ISOLATION_REQUIRED';
    status.dataset.isolationAdapterProof = 'adapter-rejected-before-sdk-load';
    status.textContent = 'Isolation prerequisite failed';
    return;
  }
  status.dataset.state = 'booting';
  status.textContent = 'Booting pinned Vivari runtime…';
  teardownButton.disabled = true;
  rebootButton.disabled = true;
  const credentiallessRuntime = createVivariRuntime({
    id: crypto.randomUUID(),
    loadSdk: loadPinnedVivariSdk,
  });
  await credentiallessRuntime.boot({ coep: 'credentialless' });
  if (credentiallessRuntime.state !== 'ready') {
    throw new Error('Vivari adapter did not boot after accepting credentialless COEP');
  }
  await credentiallessRuntime.teardown();
  // Widen the narrowed 'ready' type: teardown() mutates the live state value.
  const credentiallessPostTeardownState: string = credentiallessRuntime.state;
  if (credentiallessPostTeardownState !== 'terminated') {
    throw new Error('Vivari adapter teardown did not terminate after accepting credentialless COEP');
  }
  status.dataset.credentiallessCoepProof = 'accepted-and-torn-down';
  for (const [option, value] of [
    ['workdirName', 'nexari-project'],
    ['forwardPreviewErrors', true],
  ] as const) {
    const unsupportedRuntime = createVivariRuntime({
      id: crypto.randomUUID(),
      loadSdk: loadPinnedVivariSdk,
    });
    try {
      await unsupportedRuntime.boot({ [option]: value });
      throw new Error(`Vivari adapter accepted unsupported boot option: ${option}`);
    } catch (error) {
      if (!(error instanceof Error)
        || (error as { code?: unknown }).code !== 'UNSUPPORTED_CAPABILITY'
        || unsupportedRuntime.state !== 'created') {
        throw error;
      }
    }
  }
  status.dataset.unsupportedBootOptionsProof = 'workdirName-forwardPreviewErrors-rejected-before-sdk-load';
  const bootAbortController = new AbortController();
  const abortedBootRuntime = createVivariRuntime({ id: crypto.randomUUID(), loadSdk: loadPinnedVivariSdk });
  const abortedBoot = abortedBootRuntime.boot({ signal: bootAbortController.signal });
  bootAbortController.abort(new Error('Browser lab cancelled the pinned Vivari boot'));
  try {
    await abortedBoot;
    throw new Error('Vivari adapter completed a browser boot after caller cancellation');
  } catch (error) {
    if (!(error instanceof Error) || (error as { code?: unknown }).code !== 'BOOT_ABORTED'
      || abortedBootRuntime.state !== 'terminated') {
      throw error;
    }
  }
  status.dataset.abortedBootProof = 'boot-aborted-terminated-before-fresh-runtime';
  // This lab proves independent, short-lived runtime instances. Vivari's default
  // OPFS mirror is intentionally durable, so clear only this controlled lab's
  // origin-scoped state before constructing each fresh instance.
  await resetPinnedVivariVfs();
  const runtimeId = crypto.randomUUID();
  let initialServerReady = true;
  const runtime = createVivariRuntime({ id: runtimeId, loadSdk: loadPinnedVivariSdk });
  activeRuntime = runtime;
  const previewOrigin = window.location.origin;
  await runtime.boot({ previewOrigin });
  status.dataset.selfHostedPreviewOriginProof = previewOrigin;
  const capabilities = runtime.getCapabilities();
  // `interactive_terminal` is experimental: the terminal-dimension and live
  // resize surface below carries its browser proof. Everything else in this
  // list stays unsupported until a browser proof exists.
  const unsupportedCapabilityNames = ['native_addons', 'docker', 'tcp_remote', 'udp', 'ssh', 'linux_binary', 'permission_changes', 'symlinks', 'text_search'] as const;
  if (unsupportedCapabilityNames.some((name) => capabilities[name] !== 'unsupported')) {
    throw new Error('Vivari browser-runtime limitations must be explicitly unsupported');
  }
  if (capabilities.filesystem_watch !== 'experimental') {
    throw new Error('Vivari filesystem watching must be explicitly experimental until its browser proof passes');
  }
  if (capabilities.interactive_terminal !== 'experimental') {
    throw new Error('Vivari interactive terminal must stay experimental until its browser terminal-dimension and resize proof passes');
  }
  status.dataset.capabilitiesProof = `${unsupportedCapabilityNames.join('-')}-unsupported-interactive_terminal-experimental-filesystem_watch-experimental`;
  runtime.attachPreview(preview);
  await runtime.mount(project);
  const instanceMarkerPath = 'nexari-runtime-instance-marker.txt';
  const initialSnapshot = await runtime.export('/');
  if (initialSnapshot.files.some(({ path }) => path.replace(/^\//, '') === instanceMarkerPath)) {
    throw new Error('Vivari runtime instance inherited a filesystem marker from an earlier instance');
  }
  await runtime.fs.writeFile(`/${instanceMarkerPath}`, runtimeId);
  status.dataset.fsInstanceIsolation = 'fresh-before-write';
  const fsProofPath = '/nexari-fs-proof.txt';
  const fsProofContents = 'Nexari filesystem bridge proof';
  await runtime.fs.writeFile(fsProofPath, fsProofContents);
  const readBack = await runtime.fs.readFile(fsProofPath, 'utf8');
  const listedBeforeRemoval = await runtime.fs.readdir('/');
  await runtime.fs.rm(fsProofPath);
  const listedAfterRemoval = await runtime.fs.readdir('/');
  if (readBack !== fsProofContents || !listedBeforeRemoval.includes('nexari-fs-proof.txt') || listedAfterRemoval.includes('nexari-fs-proof.txt')) {
    throw new Error('Vivari filesystem CRUD proof failed');
  }
  status.dataset.fsProof = 'write-read-readdir-rm-readdir';
  const fsWatchProofPath = '/nexari-fs-watch-proof.txt';
  let resolveFsWatch: ((event: { kind: 'rename' | 'change'; path: string }) => void) | undefined;
  const fsWatchEvent = new Promise<{ kind: 'rename' | 'change'; path: string }>((resolve) => { resolveFsWatch = resolve; });
  const fsWatcher = runtime.fs.watch(fsWatchProofPath, (event) => { resolveFsWatch?.(event); });
  await runtime.fs.writeFile(fsWatchProofPath, 'Nexari filesystem watch proof');
  const watchedChange = await Promise.race([
    fsWatchEvent,
    new Promise<undefined>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  fsWatcher.close();
  await runtime.fs.rm(fsWatchProofPath);
  if (!watchedChange || watchedChange.path !== fsWatchProofPath || !['rename', 'change'].includes(watchedChange.kind)) {
    throw new Error('Vivari filesystem watch proof failed');
  }
  status.dataset.fsWatchProof = 'path-watch-write-event-close';
  const fsBinaryProofPath = '/nexari-fs-proof.bin';
  const fsBinaryPayload = new Uint8Array([0, 1, 127, 128, 254, 255]);
  await runtime.fs.writeFile(fsBinaryProofPath, fsBinaryPayload);
  const fsBinaryReadBack = await runtime.fs.readFile(fsBinaryProofPath);
  await runtime.fs.rm(fsBinaryProofPath);
  if (!(fsBinaryReadBack instanceof Uint8Array)
    || fsBinaryReadBack.length !== fsBinaryPayload.length
    || fsBinaryReadBack.some((byte, index) => byte !== fsBinaryPayload[index])) {
    throw new Error('Vivari binary filesystem proof failed');
  }
  status.dataset.fsBinaryProof = 'write-bytes-read-bytes-rm';
  const fsMkdirProofDirectory = '/nexari-dir-proof/nested';
  const fsMkdirProofRoot = '/nexari-dir-proof';
  await runtime.fs.mkdir(fsMkdirProofDirectory, { recursive: true });
  const listedAfterMkdir = await runtime.fs.readdir('/');
  await runtime.fs.writeFile(`${fsMkdirProofDirectory}/proof.txt`, 'Nexari nested directory proof');
  await runtime.fs.rm(fsMkdirProofRoot, { recursive: true });
  const listedAfterRecursiveRemoval = await runtime.fs.readdir('/');
  if (!listedAfterMkdir.includes('nexari-dir-proof') || listedAfterRecursiveRemoval.includes('nexari-dir-proof')) {
    throw new Error('Vivari nested directory lifecycle proof failed');
  }
  status.dataset.fsMkdirProof = 'mkdir-p-readdir-write-rm-recursive-readdir';
  const nestedExportDirectory = '/nexari-export-proof/nested';
  const nestedExportPath = `${nestedExportDirectory}/deep.bin`;
  const nestedExportPayload = new Uint8Array([7, 42, 128, 255]);
  await runtime.fs.mkdir(nestedExportDirectory, { recursive: true });
  await runtime.fs.writeFile(nestedExportPath, nestedExportPayload);
  const snapshot = await runtime.export('/');
  const exportedContents = new Map(snapshot.files.map(({ path, contents }) => [path, contents]));
  for (const [path, expectedContents] of Object.entries({
    'server.js': project['server.js'].file.contents,
    'stdin-echo.js': project['stdin-echo.js'].file.contents,
  })) {
    const contents = exportedContents.get(path);
    if (!(contents instanceof Uint8Array) || new TextDecoder().decode(contents) !== expectedContents) {
      throw new Error(`Vivari export proof failed for ${path}`);
    }
  }
  const nestedExportedContents = exportedContents.get('nexari-export-proof/nested/deep.bin');
  if (!(nestedExportedContents instanceof Uint8Array)
    || nestedExportedContents.length !== nestedExportPayload.length
    || nestedExportedContents.some((byte, index) => byte !== nestedExportPayload[index])) {
    throw new Error('Vivari recursive export proof failed for nested project file');
  }
  await runtime.fs.rm('/nexari-export-proof', { recursive: true });
  if (snapshot.truncated) throw new Error('Vivari export proof unexpectedly truncated the project snapshot');
  status.dataset.fsExportProof = 'export-byte-exact-truncated-false';
  status.dataset.fsExportNestedProof = 'nested-path-byte-exact';
  const stdinToken = 'nexari-stdin-round-trip';
  const stdinProcess = await runtime.spawn('node', ['stdin-echo.js']);
  const stdinWriter = stdinProcess.input.getWriter();
  await stdinWriter.write(stdinToken);
  await stdinWriter.close();
  let stdinOutput = '';
  for await (const chunk of stdinProcess.output) stdinOutput += chunk;
  const stdinExitCode = await stdinProcess.exit;
  if (!stdinOutput.includes(`stdin:${stdinToken}`)) {
    throw new Error('Vivari process stdin proof failed');
  }
  if (stdinExitCode !== 0) {
    throw new Error(`Vivari process stdin probe exited ${stdinExitCode}`);
  }
  status.dataset.stdinProof = 'written-echoed';
  status.dataset.stdinExitProof = 'zero';
  const processOptionsCwd = runtime.workdir;
  const processOptionsToken = 'nexari-process-option';
  const processOptionsArgument = 'nexari-process-argument';
  const processOptions = await runtime.spawn('node', ['process-options.js', processOptionsArgument], {
    cwd: processOptionsCwd,
    env: { NEXARI_PROCESS_OPTION: processOptionsToken },
  });
  let processOptionsOutput = '';
  for await (const chunk of processOptions.output) processOptionsOutput += chunk;
  const processOptionsExit = await processOptions.exit;
  const observedProcessOptions = JSON.parse(processOptionsOutput);
  if (processOptionsExit !== 0
    || observedProcessOptions.cwd !== processOptionsCwd
    || observedProcessOptions.option !== processOptionsToken
    || !observedProcessOptions.args.includes(processOptionsArgument)) {
    throw new Error('Vivari process cwd, environment or argument proof failed');
  }
  status.dataset.processOptionsProof = 'cwd-env-args-exit';
  const npmOptionsCwd = runtime.workdir;
  const npmOptionsToken = 'nexari-npm-option';
  const npmOptionsArgument = 'nexari-npm-argument';
  const npmProcess = await runtime.spawn('npm', ['run', 'nexari-spawn-proof', '--', npmOptionsArgument], {
    cwd: npmOptionsCwd,
    env: { NEXARI_NPM_OPTION: npmOptionsToken },
  });
  let npmOutput = '';
  for await (const chunk of npmProcess.output) npmOutput += chunk;
  const npmExitCode = await npmProcess.exit;
  const npmProof = npmOutput.match(/NEXARI_NPM_PROOF=(\{[^\n]+\})/)?.[1];
  if (!npmProof) {
    throw new Error(`Vivari real npm proof did not emit its guest marker: ${npmOutput}`);
  }
  const observedNpmOptions = JSON.parse(npmProof);
  if (npmExitCode !== 0
    || observedNpmOptions.cwd !== npmOptionsCwd
    || observedNpmOptions.option !== npmOptionsToken
    || !observedNpmOptions.args.includes(npmOptionsArgument)) {
    throw new Error('Vivari real npm cwd, environment, argument or exit proof failed');
  }
  status.dataset.npmSpawnProof = 'real-npm-run-cwd-env-args-exit';
  status.dataset.npmExitProof = 'zero';
  write(npmOutput);
  const shellToken = 'nexari-shell-process';
  // The audit-proven positive shape (scripts/check-runtime-shell-coreutils.test.mjs):
  // quoted format with an explicit trailing-newline escape — POSIX printf emits
  // exactly the format text, never an implicit newline.
  const shellProcess = await runtime.spawn('sh', ['-c', `printf '${shellToken}\\n'`]);
  let shellOutput = '';
  for await (const chunk of shellProcess.output) shellOutput += chunk;
  const shellExitCode = await shellProcess.exit;
  if (shellExitCode !== 0 || shellOutput !== `${shellToken}\n`) {
    throw new Error(`Vivari guest shell printf proof failed (exit ${shellExitCode}, output ${JSON.stringify(shellOutput)})`);
  }
  status.dataset.shellSpawnProof = 'printf-exit-0-exact-stdout';
  // BOLT-WC-006 partial proof: drive the guest shell's interactive REPL over its
  // real streams (no pty, no terminal dimensions — the capability stays
  // unsupported until resize exists). The writer is never closed, so the shell
  // stays parked at its prompt exactly like a live terminal session.
  const interactiveShell = await runtime.spawn('sh');
  const interactiveWriter = interactiveShell.input.getWriter();
  let interactiveMerged = '';
  let interactiveMergedClosed = false;
  void (async () => {
    try {
      for await (const chunk of interactiveShell.output) interactiveMerged += chunk;
    } catch {
      // A faulted stream still ends the merged view.
    } finally {
      interactiveMergedClosed = true;
    }
  })();
  let interactiveStderr = '';
  void (async () => {
    try {
      for await (const chunk of interactiveShell.stderr) interactiveStderr += chunk;
    } catch {
      // A faulted stream still ends the stderr view.
    }
  })();
  // Prompt-sync before typing: the REPL announces itself with its cyan prompt,
  // proving the raw-stdin line editor is attached before keystrokes are sent.
  const promptSynced = await waitFor(() => interactiveMerged.includes('\x1b[36m') && interactiveMerged.includes('$'), 15_000);
  if (!promptSynced) {
    interactiveShell.kill();
    throw new Error('Vivari interactive guest shell never printed its prompt');
  }
  // Echo-safe markers: the REPL echoes every typed keystroke verbatim, so each
  // marker is typed as quote fragments. Echo can never contain the dequoted
  // marker; only real execution (the sh lexer strips quotes) can emit it.
  interactiveWriter.write("echo nexari-'interactive-'stdin-proof\r");
  if (!(await waitFor(() => interactiveMerged.includes('nexari-interactive-stdin-proof'), 15_000))) {
    interactiveShell.kill();
    throw new Error('Vivari interactive guest shell never executed keystrokes from its still-open stdin');
  }
  status.dataset.wc006InteractiveStdinProof = 'prompt-synced-open-stdin-executed';
  // Merged-output leg: an unknown command reaches runSimple's cp.spawn, whose
  // ENOENT path writes `sh: <cmd>: not found` to stderr. The chunk must arrive
  // BOTH stream-tagged on the stderr view and interleaved on the merged view.
  interactiveWriter.write("nexari-'missing-'stderr-proof\r");
  if (!(await waitFor(() => interactiveStderr.includes('nexari-missing-stderr-proof'), 15_000))) {
    interactiveShell.kill();
    throw new Error('Vivari interactive guest shell never emitted a stderr-tagged error chunk');
  }
  if (!interactiveMerged.includes('nexari-missing-stderr-proof')) {
    interactiveShell.kill();
    throw new Error('Vivari interactive merged output view lost the stderr-tagged chunk');
  }
  status.dataset.wc006InteractiveMergedProof = 'stderr-tagged-interleaved-merged';
  // Kill leg: terminate the parked REPL, observe a settled exit and a closed
  // merged stream, so terminal consumers can never hang on a killed session.
  interactiveShell.kill();
  const interactiveExit = await Promise.race([
    interactiveShell.exit,
    new Promise<never>((_, reject) => setTimeout(
      () => reject(new Error('Vivari interactive guest shell never settled its exit after kill')),
      15_000,
    )),
  ]);
  if (!Number.isInteger(interactiveExit)) {
    throw new Error(`Vivari interactive guest shell reported a non-integer exit: ${interactiveExit}`);
  }
  const mergedClosedAfterKill = await waitFor(() => interactiveMergedClosed, 5_000);
  if (!mergedClosedAfterKill) {
    throw new Error('Vivari interactive merged output stream never closed after kill');
  }
  status.dataset.wc006InteractiveKillProof = 'killed-exited-merged-closed';
  // BOLT-WC-006 final legs: terminal dimensions at spawn and live resize,
  // proven against the owned runtime by a dedicated guest `node` probe —
  // never the REPL, and never after a kill leg (Challenger ordering finding).
  const ttyProbe = await runtime.spawn('node', ['tty-probe.js'], { terminal: { columns: 80, rows: 24 } });
  let ttyMerged = '';
  void (async () => {
    try {
      for await (const chunk of ttyProbe.output) ttyMerged += chunk;
    } catch {
      // A faulted stream still ends the merged view.
    }
  })();
  try {
    // Dimensions BEFORE resize: the live guest must observe its spawn-time
    // 80x24 terminal on the real stdout streams (wc006TtyDimsProof).
    const dimsObserved = await waitFor(() => /\{"tty":true,"cols":80,"rows":24\}/.test(ttyMerged), 15_000);
    if (!dimsObserved) {
      throw new Error(`Vivari guest node probe never observed its 80x24 spawn terminal: ${ttyMerged}`);
    }
    status.dataset.wc006TtyDimsProof = 'spawn-terminal-80x24';
    // Live resize: the host moves the terminal to 100x30 and the guest's
    // SIGWINCH handler acknowledges the NEW dimensions — dims are applied
    // before the event, coalesced like Unix pending signals (wc006ResizeProof).
    ttyProbe.resize({ columns: 100, rows: 30 });
    const resizeAcked = await waitFor(() => /\{"winch":true,"cols":100,"rows":30\}/.test(ttyMerged), 15_000);
    if (!resizeAcked) {
      throw new Error(`Vivari guest node probe never acknowledged the live 100x30 resize through SIGWINCH: ${ttyMerged}`);
    }
    status.dataset.wc006ResizeProof = 'sigwinch-ack-100x30';
  } finally {
    ttyProbe.kill();
    const probeExit = await Promise.race([
      ttyProbe.exit,
      new Promise<never>((_, reject) => setTimeout(
        () => reject(new Error('Vivari tty probe never settled its exit after kill')),
        15_000,
      )),
    ]);
    if (!Number.isInteger(probeExit)) {
      throw new Error(`Vivari tty probe reported a non-integer exit: ${probeExit}`);
    }
  }
  if (capabilities.interactive_terminal !== 'experimental') {
    throw new Error('Vivari interactive terminal must be disclosed as experimental once its browser terminal proof passes');
  }
  status.dataset.interactiveTerminalCapabilityProof = 'experimental';
  if (runtime.workdir !== '/' || observedProcessOptions.cwd !== runtime.workdir) {
    throw new Error('Vivari stable workdir proof failed');
  }
  status.dataset.workdirProof = 'root-cwd-observed';
  runtime.on('port', (port, kind, url) => {
    if (port !== 3111) return;
    if (kind === 'open') status.dataset.portOpen = `${port}:${url}`;
    if (kind === 'close') status.dataset.portClose = `${port}:${url}`;
  });
  runtime.on('server-ready', (port, url) => {
    if (!initialServerReady) return;
    initialServerReady = false;
    void proveProcessCancellation(runtime).then(async () => {
      if (runtime.state !== 'ready') return;
      const response = await fetch(url);
      const body = await response.text();
      if (!response.ok || body !== 'Nexari runtime preview OK') {
        throw new Error('Vivari server-ready event did not expose a usable preview response');
      }
      if (runtime.state !== 'ready') return;
      status.dataset.serverReadyResponseProof = 'response-200-before-preview';
      preview.src = url;
      preview.hidden = false;
      status.dataset.runtimeId = runtimeId;
      status.dataset.state = 'ready';
      status.textContent = `Ready: in-VM HTTP server on ${port}`;
      write(`server-ready ${url}`);
      teardownButton.disabled = false;
      (globalThis as typeof globalThis & { __nexariProvePreviewRecovery?: () => Promise<void> }).__nexariProvePreviewRecovery =
        () => provePreviewRecovery(runtime).catch((error) => {
          reportRuntimeFailure(error);
          throw error;
        });
    }).catch(reportRuntimeFailure);
  });
  serverProcess = await runtime.spawn('node', ['server.js']);
  void serverProcess.exit.then((code) => { status.dataset.exitCode = String(code); });
  void (async () => {
    for await (const chunk of serverProcess!.output) write(chunk);
    status.dataset.outputClosed = 'true';
  })();
}

async function proveProcessCancellation(runtime: ReturnType<typeof createVivariRuntime>) {
  const stalled = await runtime.spawn('node', ['stall.js']);
  stalled.kill();
  await stalled.exit;
  for await (const _chunk of stalled.output) {
    // Draining after kill proves terminal consumers observe stream completion.
  }
  const recoveryToken = 'nexari-process-recovery';
  const recovered = await runtime.spawn('node', ['stdin-echo.js']);
  const recoveryWriter = recovered.input.getWriter();
  await recoveryWriter.write(recoveryToken);
  await recoveryWriter.close();
  let recoveryOutput = '';
  for await (const chunk of recovered.output) recoveryOutput += chunk;
  if (!recoveryOutput.includes(`stdin:${recoveryToken}`)) {
    throw new Error('Vivari process cancellation recovery proof failed');
  }
  status.dataset.killProof = 'killed-exited-output-closed-respawn-ok';
}

async function provePreviewRecovery(runtime: ReturnType<typeof createVivariRuntime>) {
  const staleServer = serverProcess;
  if (!staleServer || runtime.state !== 'ready') return;
  delete status.dataset.portClose;
  staleServer.kill();
  await staleServer.exit;
  const portClosed = await waitFor(() => status.dataset.portClose === '3111:/preview/3111/');
  if (!portClosed || runtime.state !== 'ready') {
    throw new Error('Vivari preview server did not report its port closing before recovery');
  }
  const recoveredReady = new Promise<string>((resolve) => {
    const detach = runtime.on('server-ready', (port, url) => {
      if (port !== 3111) return;
      detach();
      resolve(url);
    });
  });
  serverProcess = await runtime.spawn('node', ['server.js']);
  void serverProcess.exit.then((code) => { status.dataset.exitCode = String(code); });
  void (async () => {
    for await (const chunk of serverProcess!.output) write(chunk);
    status.dataset.outputClosed = 'true';
  })();
  const url = await Promise.race([
    recoveredReady,
    new Promise<never>((_, reject) => setTimeout(
      () => reject(new Error('Vivari preview server recovery never reached server-ready')),
      15_000,
    )),
  ]);
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok || body !== 'Nexari runtime preview OK' || runtime.state !== 'ready') {
    throw new Error('Vivari preview server recovery did not expose a fresh usable response');
  }
  preview.src = url;
  status.dataset.previewRecoveryProof = 'killed-port-close-respawn-server-ready-fetch-200';
  // The teardown assertions must observe the replacement process, not the
  // intentionally killed server that established this recovery proof.
  delete status.dataset.portClose;
  delete status.dataset.exitCode;
  delete status.dataset.outputClosed;
}

async function waitFor(check: () => boolean, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

async function assertTerminatedOperation(operation: Promise<unknown>, label: string) {
  try {
    await operation;
    throw new Error(`Vivari adapter accepted ${label} after termination`);
  } catch (error) {
    if (!(error instanceof Error) || (error as { code?: unknown }).code !== 'TORN_DOWN') {
      throw error;
    }
  }
}

async function proveTerminatedLifecycle(runtime: ReturnType<typeof createVivariRuntime>) {
  await runtime.teardown();
  await assertTerminatedOperation(runtime.boot(), 'boot');
  await assertTerminatedOperation(runtime.fs.writeFile('/nexari-after-teardown.txt', 'blocked'), 'fs.writeFile');
  await assertTerminatedOperation(runtime.spawn('node', ['server.js']), 'spawn');
}

teardownButton.addEventListener('click', async () => {
  const runtime = activeRuntime;
  if (!runtime) return;
  teardownButton.disabled = true;
  rebootButton.disabled = true;
  try {
    await runtime.teardown();
  } catch (error) {
    status.dataset.state = 'failed';
    status.textContent = `Runtime teardown failed: ${error instanceof Error ? error.message : String(error)}`;
    teardownButton.disabled = false;
    return;
  } finally {
    preview.removeAttribute('src');
    preview.hidden = true;
  }
  activeRuntime = undefined;
  delete status.dataset.runtimeId;
  status.dataset.state = 'terminated';
  status.textContent = 'Runtime terminated; preview detached';
  try {
    await proveTerminatedLifecycle(runtime);
    status.dataset.terminatedLifecycleProof = 'repeat-teardown-boot-fs-spawn-torn-down';
  } catch (error) {
    status.dataset.state = 'failed';
    status.textContent = `Terminated lifecycle proof failed: ${error instanceof Error ? error.message : String(error)}`;
    return;
  }
  rebootButton.disabled = false;
});

rebootButton.addEventListener('click', () => {
  void bootRuntime().catch(reportRuntimeFailure);
});

function reportRuntimeFailure(error: unknown) {
  status.dataset.state = 'failed';
  status.textContent = `Runtime failed: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
}

void bootRuntime().catch(reportRuntimeFailure);
