import { createVivariRuntime, loadPinnedVivariSdk } from '../../../packages/vivari-adapter/src/index.ts';

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const output = document.querySelector<HTMLPreElement>('#output')!;
const preview = document.querySelector<HTMLIFrameElement>('#preview')!;
const teardownButton = document.querySelector<HTMLButtonElement>('#teardown')!;
const rebootButton = document.querySelector<HTMLButtonElement>('#reboot')!;
let activeRuntime: ReturnType<typeof createVivariRuntime> | undefined;

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
};

async function bootRuntime() {
  if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    status.dataset.state = 'isolation-failed';
    status.dataset.errorCode = 'ISOLATION_REQUIRED';
    status.textContent = 'Isolation prerequisite failed';
    return;
  }
  status.dataset.state = 'booting';
  status.textContent = 'Booting pinned Vivari runtime…';
  teardownButton.disabled = true;
  rebootButton.disabled = true;
  const runtimeId = crypto.randomUUID();
  const runtime = createVivariRuntime({ id: runtimeId, loadSdk: loadPinnedVivariSdk });
  activeRuntime = runtime;
  await runtime.boot();
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
  if (snapshot.truncated) throw new Error('Vivari export proof unexpectedly truncated the project snapshot');
  status.dataset.fsExportProof = 'export-byte-exact-truncated-false';
  const stdinToken = 'nexari-stdin-round-trip';
  const stdinProcess = await runtime.spawn('node', ['stdin-echo.js']);
  const stdinWriter = stdinProcess.input.getWriter();
  await stdinWriter.write(stdinToken);
  await stdinWriter.close();
  let stdinOutput = '';
  for await (const chunk of stdinProcess.output) stdinOutput += chunk;
  if (!stdinOutput.includes(`stdin:${stdinToken}`)) {
    throw new Error('Vivari process stdin proof failed');
  }
  status.dataset.stdinProof = 'written-echoed';
  const processOptionsCwd = '/nexari-process-options';
  const processOptionsToken = 'nexari-process-option';
  const processOptionsArgument = 'nexari-process-argument';
  await runtime.fs.mkdir(processOptionsCwd);
  const processOptions = await runtime.spawn('node', ['../process-options.js', processOptionsArgument], {
    cwd: processOptionsCwd,
    env: { NEXARI_PROCESS_OPTION: processOptionsToken },
  });
  let processOptionsOutput = '';
  for await (const chunk of processOptions.output) processOptionsOutput += chunk;
  const processOptionsExit = await processOptions.exit;
  await runtime.fs.rm(processOptionsCwd, { recursive: true });
  const observedProcessOptions = JSON.parse(processOptionsOutput);
  if (processOptionsExit !== 0
    || observedProcessOptions.cwd !== processOptionsCwd
    || observedProcessOptions.option !== processOptionsToken
    || !observedProcessOptions.args.includes(processOptionsArgument)) {
    throw new Error('Vivari process cwd, environment or argument proof failed');
  }
  status.dataset.processOptionsProof = 'cwd-env-args-exit';
  runtime.on('port', (port, kind, url) => {
    if (kind === 'open' && port === 3111) status.dataset.portOpen = `${port}:${url}`;
  });
  runtime.on('server-ready', (port, url) => {
    void proveProcessCancellation(runtime).then(() => {
      if (runtime.state !== 'ready') return;
      preview.src = url;
      preview.hidden = false;
      status.dataset.runtimeId = runtimeId;
      status.dataset.state = 'ready';
      status.textContent = `Ready: in-VM HTTP server on ${port}`;
      write(`server-ready ${url}`);
      teardownButton.disabled = false;
    }).catch(reportRuntimeFailure);
  });
  const process = await runtime.spawn('node', ['server.js']);
  void process.exit.then((code) => { status.dataset.exitCode = String(code); });
  void (async () => {
    for await (const chunk of process.output) write(chunk);
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
