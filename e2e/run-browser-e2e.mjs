// Disposable runner for the live browser proof. It owns the Chrome process,
// CDP port, and temporary profile it creates, and cleans up only those items.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(path.join(tmpdir(), 'nexari-browser-e2e-chrome.'));

async function reserveFreeLoopbackPort() {
  const server = createServer();
  server.unref();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('failed to reserve a free 127.0.0.1 port for Chrome CDP');
  }
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
  const [code, signal] = await once(child, 'exit');
  if (code !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed${signal ? ` with ${signal}` : ` with exit code ${code}`}`);
  }
}

async function terminateOwnedChrome(chrome) {
  if (!chrome || chrome.exitCode != null || chrome.signalCode != null) return;
  const exited = once(chrome, 'exit');
  if (!chrome.kill('SIGTERM')) return;
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (graceful || chrome.exitCode != null || chrome.signalCode != null) return;
  if (chrome.kill('SIGKILL')) await exited;
}

let chrome;
let cleanupPromise;
const cleanup = () => cleanupPromise ??= (async () => {
  await terminateOwnedChrome(chrome);
  rmSync(profile, { recursive: true, force: true });
})();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  });
}

try {
  const port = await reserveFreeLoopbackPort();
  const cdpUrl = `http://127.0.0.1:${port}`;
  chrome = spawn(chromeExecutable, [
    `--user-data-dir=${profile}`,
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  let ready = false;
  for (let attempt = 0; attempt < 100 && !ready; attempt += 1) {
    if (chrome.exitCode != null || chrome.signalCode != null) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
    ready = await fetch(`${cdpUrl}/json/version`)
      .then((response) => response.ok)
      .catch(() => false);
  }
  if (!ready) throw new Error(`owned Chrome CDP endpoint never became ready at ${cdpUrl}`);

  const childEnvironment = { ...process.env };
  delete childEnvironment.NEXARI_CHROME_CDP_URL;
  await run('npm', [
    'exec', '--', 'vite', 'build', '--configLoader', 'runner',
  ], { cwd: path.join(root, 'labs/browser-smoke'), env: childEnvironment });
  await run(process.execPath, ['e2e/browser-smoke.e2e.mjs'], {
    env: { ...childEnvironment, NEXARI_CHROME_CDP_URL: cdpUrl },
  });
} finally {
  await cleanup();
}
