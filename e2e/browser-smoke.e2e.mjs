import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const cdpUrl = process.env.NEXARI_CHROME_CDP_URL;
if (!cdpUrl) {
  throw new Error('NEXARI_CHROME_CDP_URL is required; provide an explicitly approved isolated Chrome DevTools endpoint.');
}

const labUrl = 'http://127.0.0.1:4174';
const nonIsolatedLabUrl = 'http://127.0.0.1:4175';
const preview = spawn('npm', ['run', 'preview', '--', '--port', '4174'], {
  cwd: new URL('../labs/browser-smoke/', import.meta.url),
  stdio: ['ignore', 'pipe', 'pipe'],
});
const nonIsolatedPreview = spawn('npm', ['run', 'preview', '--', '--port', '4175'], {
  cwd: new URL('../labs/browser-smoke/', import.meta.url),
  env: { ...process.env, NEXARI_LAB_ISOLATION: 'off' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let previewOutput = '';
preview.stdout.on('data', (chunk) => { previewOutput += chunk; });
preview.stderr.on('data', (chunk) => { previewOutput += chunk; });
nonIsolatedPreview.stdout.on('data', (chunk) => { previewOutput += chunk; });
nonIsolatedPreview.stderr.on('data', (chunk) => { previewOutput += chunk; });
let browser;

try {
  await waitFor(() => fetch(labUrl).then((response) => response.ok));
  await waitFor(() => fetch(nonIsolatedLabUrl).then((response) => response.ok));
  const version = await (await fetch(`${cdpUrl}/json/version`)).json();
  browser = new WebSocket(version.webSocketDebuggerUrl);
  await once(browser, 'open');
  let nextId = 0;
  const pending = new Map();
  browser.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    browser.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  const sessionCommand = (method, params = {}) => command(method, params, sessionId);
  const evaluate = async (expression, awaitPromise = false) => {
    const result = await sessionCommand('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  await sessionCommand('Page.enable');
  await sessionCommand('Page.navigate', { url: nonIsolatedLabUrl });
  const isolationFailed = await waitFor(() => evaluate(`document.querySelector('#status')?.dataset.state === 'isolation-failed'`));
  assert.equal(isolationFailed, true, `non-isolated browser lab must fail closed before booting a guest:\n${previewOutput}`);
  assert.equal(await evaluate('crossOriginIsolated'), false, 'the negative browser proof must run without cross-origin isolation');
  assert.equal(await evaluate(`document.querySelector('#status')?.dataset.errorCode`), 'ISOLATION_REQUIRED', 'the host must surface the typed isolation failure');
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.isolationAdapterProof`),
    'adapter-rejected-before-sdk-load',
    'the negative browser proof must invoke the actual adapter and reject before loading the Vivari SDK',
  );
  assert.equal(
    await evaluate(`performance.getEntriesByType('resource').some(({ name }) => /\\/assets\\/dist-/.test(new URL(name).pathname))`),
    false,
    'a non-isolated browser context must not load the dynamically imported Vivari SDK chunk',
  );

  await sessionCommand('Page.navigate', { url: labUrl });
  const ready = await waitFor(() => evaluate(`document.querySelector('#status')?.dataset.state === 'ready'`), 120_000);
  assert.equal(ready, true, `browser lab never reached server-ready state:\n${previewOutput}`);
  assert.equal(await evaluate('crossOriginIsolated'), true, 'guest runtime must start only in an isolated browser context');
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.unsupportedBootOptionProof`),
    'coep-rejected-before-sdk-load',
    'an unsupported host boot option must reject in the browser before the Vivari SDK can load a guest',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.abortedBootProof`),
    'boot-aborted-terminated-before-fresh-runtime',
    'a caller-aborted boot of the pinned Vivari adapter must terminate cleanly before the next fresh browser runtime boots',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.fsInstanceIsolation`),
    'fresh-before-write',
    'a newly booted Vivari runtime must not inherit a filesystem marker from a prior runtime instance',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.workdirProof`),
    'root-cwd-observed',
    'the owned adapter must expose a stable workdir that a real guest process observes as its cwd',
  );
  const resourceOrigins = await evaluate(`Array.from(new Set(performance.getEntriesByType('resource').map(({ name }) => new URL(name).origin)))`);
  assert.deepEqual(resourceOrigins, [new URL(labUrl).origin], 'browser runtime assets must load only from the controlled lab origin');
  assert.equal(await evaluate(`document.querySelector('#preview')?.hidden`), false, 'preview must be visible only after server-ready');
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.serverReadyResponseProof`),
    'response-200-before-preview',
    'server-ready must not expose a preview until the host has observed a usable in-VM HTTP response',
  );
  assert.match(await evaluate(`document.querySelector('#preview')?.src`), /^http:\/\//, 'preview must have a runtime URL');
  assert.deepEqual(
    await evaluate(`fetch(document.querySelector('#preview').src).then(async (response) => ({
      status: response.status,
      body: await response.text(),
    }))`, true),
    { status: 200, body: 'Nexari runtime preview OK' },
    'the preview URL must serve the in-VM server payload through the controlled lab origin',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.fsProof`),
    'write-read-readdir-rm-readdir',
    'the owned Vivari filesystem bridge must complete a text CRUD round-trip before the server starts',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.fsWatchProof`),
    'path-watch-write-event-close',
    'the owned Vivari filesystem bridge must report a path watch event and allow the watcher to close before the server starts',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.fsBinaryProof`),
    'write-bytes-read-bytes-rm',
    'the owned Vivari filesystem bridge must round-trip binary payloads byte-for-byte before the server starts',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.fsMkdirProof`),
    'mkdir-p-readdir-write-rm-recursive-readdir',
    'the owned Vivari filesystem bridge must create, populate, and recursively remove a nested directory before the server starts',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.fsExportProof`),
    'export-byte-exact-truncated-false',
    'the owned Vivari export bridge must round-trip mounted files byte-exact without truncation before the server starts',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.fsExportNestedProof`),
    'nested-path-byte-exact',
    'the owned Vivari export bridge must recursively preserve a nested project file byte-exact before the server starts',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.capabilitiesProof`),
    'native_addons-docker-tcp_remote-udp-ssh-linux_binary-permission_changes-symlinks-text_search-unsupported-filesystem_watch-experimental',
    'the browser lab must explicitly disclose unsupported native, permission-change and symlink capabilities while filesystem watching remains experimental',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.stdinProof`),
    'written-echoed',
    'the owned Vivari process bridge must round-trip stdin through a real browser guest before the server starts',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.stdinExitProof`),
    'zero',
    'the stdin probe must terminate successfully after the host closes its writer',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.processOptionsProof`),
    'cwd-env-args-exit',
    'the owned Vivari process bridge must apply cwd, environment variables and arguments before the server starts',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.npmCommandUnavailableProof`),
    'command-not-found',
    'the owned Vivari process bridge must surface unavailable npm as an explicit typed error rather than silently degrading',
  );
  assert.match(
    await evaluate(`document.querySelector('#status')?.dataset.portOpen`),
    /^3111:\/preview\/3111\/$/,
    'the owned Vivari port-open event must reach the host with its controlled-origin preview path',
  );
  const previewUrl = await evaluate(`document.querySelector('#preview')?.src`);
  const runtimeId = await evaluate(`document.querySelector('#status')?.dataset.runtimeId`);
  const cancellationRecovered = await waitFor(() => evaluate(
    `document.querySelector('#status')?.dataset.killProof === 'killed-exited-output-closed-respawn-ok'`,
  ));
  assert.equal(
    cancellationRecovered,
    true,
    'the host must kill a stalled guest process, observe its exit and closed output, then spawn a new process without disturbing preview availability',
  );
  assert.deepEqual(
    await evaluate(`fetch(document.querySelector('#preview').src).then(async (response) => ({ status: response.status, body: await response.text() }))`, true),
    { status: 200, body: 'Nexari runtime preview OK' },
    'cancelling a stalled guest process must not disturb the ready preview route',
  );
  await evaluate('window.__nexariProvePreviewRecovery?.()', true);
  const previewRecovered = await waitFor(() => evaluate(
    `document.querySelector('#status')?.dataset.previewRecoveryProof === 'killed-port-close-respawn-server-ready-fetch-200'`,
  ));
  assert.equal(
    previewRecovered,
    true,
    'a live preview server must report its port close, then recover with a fresh server-ready response without tearing down the runtime',
  );

  await evaluate(`(() => {
    const preview = document.querySelector('#preview');
    const removeAttribute = preview.removeAttribute.bind(preview);
    let sourceClears = 0;
    preview.removeAttribute = (name) => {
      if (name === 'src') sourceClears++;
      return removeAttribute(name);
    };
    window.__nexariPreviewSourceClears = () => sourceClears;
  })()`);
  await evaluate(`document.querySelector('#teardown')?.click()`);
  const terminated = await waitFor(() => evaluate(`document.querySelector('#status')?.dataset.state === 'terminated'`));
  assert.equal(terminated, true, 'teardown must reach the terminated state');
  assert.equal(await evaluate(`document.querySelector('#status')?.dataset.runtimeId`), undefined, 'teardown must not leave the terminated runtime identity visible to the host');
  assert.equal(await evaluate(`document.querySelector('#preview')?.hasAttribute('src')`), false, 'teardown must clear the preview URL');
  assert.equal(await evaluate(`document.querySelector('#preview')?.hidden`), true, 'teardown must hide the preview');
  assert.equal(await evaluate(`window.__nexariPreviewSourceClears?.()`), 2, 'the adapter must clear the preview before the lab failure-safety fallback');
  const portClosed = await waitFor(() => evaluate(`document.querySelector('#status')?.dataset.portClose === '3111:/preview/3111/'`));
  assert.equal(
    portClosed,
    true,
    'teardown must forward the owned Vivari port-close event before the preview route disappears',
  );
  const previewRouteClosed = await waitFor(() => evaluate(`fetch(${JSON.stringify(previewUrl)}).then(async (response) =>
    !(response.status === 200 && await response.text() === 'Nexari runtime preview OK')
  ).catch(() => true)`, true));
  assert.equal(previewRouteClosed, true, 'teardown must stop serving the stale preview route');
  const processExited = await waitFor(() => evaluate(`document.querySelector('#status')?.dataset.exitCode !== undefined`));
  assert.equal(processExited, true, 'teardown must settle the spawned process exit');
  assert.match(await evaluate(`document.querySelector('#status')?.dataset.exitCode`), /^-?\d+$/, 'teardown must expose a numeric process exit code');
  const outputClosed = await waitFor(() => evaluate(`document.querySelector('#status')?.dataset.outputClosed === 'true'`));
  assert.equal(outputClosed, true, 'teardown must close process output so terminal consumers cannot hang');

  assert.equal(await evaluate(`document.querySelector('#reboot')?.disabled`), false, 'a terminated runtime must allow the lab host to create a fresh isolated runtime');
  await evaluate(`document.querySelector('#reboot')?.click()`);
  const rebooted = await waitFor(() => evaluate(`document.querySelector('#status')?.dataset.state === 'ready'`), 120_000);
  assert.equal(
    rebooted,
    true,
    `a fresh runtime must reach server-ready after the prior runtime is torn down; state=${await evaluate(`document.querySelector('#status')?.dataset.state`)} status=${await evaluate(`document.querySelector('#status')?.textContent`)}`,
  );
  const rebootPreviewUrl = await evaluate(`document.querySelector('#preview')?.src`);
  const rebootRuntimeId = await evaluate(`document.querySelector('#status')?.dataset.runtimeId`);
  assert.notEqual(rebootRuntimeId, runtimeId, 'a reboot must create a distinct Vivari runtime instance');
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.fsInstanceIsolation`),
    'fresh-before-write',
    'the rebooted Vivari runtime must start without the prior instance filesystem marker',
  );
  assert.equal(rebootPreviewUrl, previewUrl, 'the controlled-origin preview route is port-addressed and must remain stable across fresh runtime instances');
  assert.deepEqual(
    await evaluate(`fetch(document.querySelector('#preview').src).then(async (response) => ({ status: response.status, body: await response.text() }))`, true),
    { status: 200, body: 'Nexari runtime preview OK' },
    'a rebooted runtime preview must serve a fresh in-VM response',
  );

  await command('Target.closeTarget', { targetId });
  browser.close();
  console.log('browser lab E2E: PASS (ready server preview followed by safe teardown)');
} finally {
  browser?.close();
  preview.kill('SIGTERM');
  nonIsolatedPreview.kill('SIGTERM');
}

async function waitFor(check, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await check()) return true;
    } catch {
      // The local preview server and browser target start asynchronously.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

function once(target, event) {
  return new Promise((resolve, reject) => {
    target.addEventListener(event, resolve, { once: true });
    target.addEventListener('error', () => reject(new Error(`CDP socket error while waiting for ${event}`)), { once: true });
  });
}
