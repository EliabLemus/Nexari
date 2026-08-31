import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const cdpUrl = process.env.NEXARI_CHROME_CDP_URL;
if (!cdpUrl) {
  throw new Error('NEXARI_CHROME_CDP_URL is required; provide an explicitly approved isolated Chrome DevTools endpoint.');
}

const labUrl = 'http://127.0.0.1:4174';
const preview = spawn('npm', ['run', 'preview', '--', '--port', '4174'], {
  cwd: new URL('../labs/browser-smoke/', import.meta.url),
  stdio: ['ignore', 'pipe', 'pipe'],
});
let previewOutput = '';
preview.stdout.on('data', (chunk) => { previewOutput += chunk; });
preview.stderr.on('data', (chunk) => { previewOutput += chunk; });
let browser;

try {
  await waitFor(() => fetch(labUrl).then((response) => response.ok));
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
  await sessionCommand('Page.navigate', { url: labUrl });
  const ready = await waitFor(() => evaluate(`document.querySelector('#status')?.dataset.state === 'ready'`), 120_000);
  assert.equal(ready, true, `browser lab never reached server-ready state:\n${previewOutput}`);
  assert.equal(await evaluate('crossOriginIsolated'), true, 'guest runtime must start only in an isolated browser context');
  const resourceOrigins = await evaluate(`Array.from(new Set(performance.getEntriesByType('resource').map(({ name }) => new URL(name).origin)))`);
  assert.deepEqual(resourceOrigins, [new URL(labUrl).origin], 'browser runtime assets must load only from the controlled lab origin');
  assert.equal(await evaluate(`document.querySelector('#preview')?.hidden`), false, 'preview must be visible only after server-ready');
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
    await evaluate(`document.querySelector('#status')?.dataset.fsBinaryProof`),
    'write-bytes-read-bytes-rm',
    'the owned Vivari filesystem bridge must round-trip binary payloads byte-for-byte before the server starts',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.fsExportProof`),
    'export-byte-exact-truncated-false',
    'the owned Vivari export bridge must round-trip mounted files byte-exact without truncation before the server starts',
  );
  assert.equal(
    await evaluate(`document.querySelector('#status')?.dataset.stdinProof`),
    'written-echoed',
    'the owned Vivari process bridge must round-trip stdin through a real browser guest before the server starts',
  );
  assert.match(
    await evaluate(`document.querySelector('#status')?.dataset.portOpen`),
    /^3111:\/preview\/3111\/$/,
    'the owned Vivari port-open event must reach the host with its controlled-origin preview path',
  );
  const previewUrl = await evaluate(`document.querySelector('#preview')?.src`);

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
  assert.equal(await evaluate(`document.querySelector('#preview')?.hasAttribute('src')`), false, 'teardown must clear the preview URL');
  assert.equal(await evaluate(`document.querySelector('#preview')?.hidden`), true, 'teardown must hide the preview');
  assert.equal(await evaluate(`window.__nexariPreviewSourceClears?.()`), 2, 'the adapter must clear the preview before the lab failure-safety fallback');
  const previewRouteClosed = await waitFor(() => evaluate(`fetch(${JSON.stringify(previewUrl)}).then(async (response) =>
    !(response.status === 200 && await response.text() === 'Nexari runtime preview OK')
  ).catch(() => true)`, true));
  assert.equal(previewRouteClosed, true, 'teardown must stop serving the stale preview route');
  const processExited = await waitFor(() => evaluate(`document.querySelector('#status')?.dataset.exitCode !== undefined`));
  assert.equal(processExited, true, 'teardown must settle the spawned process exit');
  assert.match(await evaluate(`document.querySelector('#status')?.dataset.exitCode`), /^-?\d+$/, 'teardown must expose a numeric process exit code');
  const outputClosed = await waitFor(() => evaluate(`document.querySelector('#status')?.dataset.outputClosed === 'true'`));
  assert.equal(outputClosed, true, 'teardown must close process output so terminal consumers cannot hang');

  await command('Target.closeTarget', { targetId });
  browser.close();
  console.log('browser lab E2E: PASS (ready server preview followed by safe teardown)');
} finally {
  browser?.close();
  preview.kill('SIGTERM');
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
