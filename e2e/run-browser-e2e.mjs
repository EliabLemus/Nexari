// Disposable E2E runner for this slice only. Launches a fresh temporary Chrome
// with CDP bound to 127.0.0.1, exposes the endpoint solely through
// NEXARI_CHROME_CDP_URL, runs the browser lab E2E, then terminates only the
// Chrome it created and removes only its temporary profile.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = mkdtempSync(path.join('/tmp', 'nexari-chrome-profile-red.'));

// Claim an unbound 127.0.0.1 port before spawning so the readiness probe below
// can only ever succeed against the Chrome this runner started (a foreign
// listener makes the draw fail and retries instead).
function isPortFree(candidate) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(candidate, '127.0.0.1');
  });
}
let port = 0;
for (let attempt = 0; attempt < 10 && port === 0; attempt += 1) {
  const candidate = 9400 + Math.floor(Math.random() * 400);
  if (await isPortFree(candidate)) port = candidate;
}
if (port === 0) {
  rmSync(profile, { recursive: true, force: true });
  throw new Error('no free localhost port available for the disposable Chrome CDP endpoint');
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  `--user-data-dir=${profile}`,
  '--remote-debugging-address=127.0.0.1',
  `--remote-debugging-port=${port}`,
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });

const cdpUrl = `http://127.0.0.1:${port}`;
let ready = false;
for (let i = 0; i < 50 && !ready; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  ready = await fetch(`${cdpUrl}/json/version`).then((response) => response.ok).catch(() => false);
}
if (!ready) {
  chrome.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
  throw new Error(`Chrome CDP endpoint never became ready at ${cdpUrl}`);
}

let exitCode = 1;
try {
  const child = spawn('npm', ['run', 'test:browser-lab'], {
    cwd: root,
    env: { ...process.env, NEXARI_CHROME_CDP_URL: cdpUrl },
    stdio: 'inherit',
  });
  const [code] = await once(child, 'exit');
  exitCode = code;
} finally {
  chrome.kill('SIGTERM');
  await Promise.race([once(chrome, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (chrome.exitCode == null && chrome.signalCode == null) chrome.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
}
console.log(`RED RUNNER EXIT: ${exitCode}`);
process.exit(exitCode === 0 ? 0 : 1);
