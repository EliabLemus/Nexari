import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { terminateChild } from './browser-smoke-cleanup.mjs';

const chromeBin = process.env.NEXARI_CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ephemeralCdpPort = 0;

export function chromeArguments(profileDir, port = ephemeralCdpPort) {
  return [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
  ];
}

export function validateLoopbackCdpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw codedError('CDP_LOOPBACK_REQUIRED', 'NEXARI_CHROME_CDP_URL must be a valid http://127.0.0.1 URL.');
  }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
    throw codedError('CDP_LOOPBACK_REQUIRED', 'NEXARI_CHROME_CDP_URL must be bound only to http://127.0.0.1.');
  }
  return url;
}

export function cdpUrlFromDevToolsActivePort(contents) {
  const [port] = contents.split(/\r?\n/, 1);
  if (!/^[1-9]\d{0,4}$/.test(port ?? '') || Number(port) > 65_535) {
    throw codedError('CDP_OWNERSHIP_REQUIRED', 'Owned Chrome did not write a valid DevToolsActivePort file.');
  }
  return validateLoopbackCdpUrl(`http://127.0.0.1:${port}`);
}

async function main() {
  const profileDir = await mkdtemp(path.join(tmpdir(), 'nexari-chrome-'));
  const chrome = spawn(chromeBin, chromeArguments(profileDir), { stdio: ['ignore', 'pipe', 'pipe'] });
  let chromeOutput = '';
  chrome.stdout.on('data', (chunk) => { chromeOutput += chunk; });
  chrome.stderr.on('data', (chunk) => { chromeOutput += chunk; });
  try {
    const cdpUrl = await waitForOwnedCdp(profileDir);
    await runE2e(cdpUrl);
  } catch (error) {
    const detail = chromeOutput ? `\nChrome output:\n${chromeOutput}` : '';
    throw new Error(`${error instanceof Error ? error.message : String(error)}${detail}`);
  } finally {
    await terminateChild(chrome);
    await rm(profileDir, { recursive: true, force: true });
  }
}

async function waitForOwnedCdp(profileDir) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const contents = await readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8');
      const cdpUrl = cdpUrlFromDevToolsActivePort(contents);
      const response = await fetch(new URL('/json/version', cdpUrl));
      if (response.ok) return cdpUrl;
    } catch {
      // Owned Chrome has not yet written and bound its loopback CDP endpoint.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw codedError('CDP_START_TIMEOUT', 'Owned Chrome did not expose its loopback CDP endpoint within 30 seconds.');
}

function runE2e(cdpUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./browser-smoke.e2e.mjs', import.meta.url))], {
      env: { ...process.env, NEXARI_CHROME_CDP_URL: cdpUrl.href.replace(/\/$/, '') },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`browser E2E exited code=${code} signal=${signal}`));
    });
  });
}

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
