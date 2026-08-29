import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lab = path.join(root, 'labs', 'browser-smoke');
for (const relative of ['index.html', 'src/main.ts', 'vite.config.ts', 'package.json']) {
  await access(path.join(lab, relative));
}
const source = await readFile(path.join(lab, 'src/main.ts'), 'utf8');
for (const needle of ['createVivariRuntime', 'loadPinnedVivariSdk', 'crossOriginIsolated', 'SharedArrayBuffer', 'attachPreview', 'server-ready', 'server.listen', 'teardown']) {
  if (!source.includes(needle)) throw new Error(`browser lab must exercise ${needle}`);
}
if (source.includes('Vivari.boot')) throw new Error('browser lab must boot Vivari only through the adapter seam');
if (source.includes('detachPreview();')) throw new Error('browser lab teardown must exercise adapter-owned preview cleanup rather than detach previews itself');
if (!source.includes("await runtime.teardown();") || !source.includes("finally {\n      preview.removeAttribute('src');\n      preview.hidden = true;\n    }")) {
  throw new Error('browser lab must clear the preview iframe even when adapter teardown fails');
}
if (!source.includes("catch (error) {\n      status.dataset.state = 'failed';\n      status.textContent = `Runtime teardown failed: ${error instanceof Error ? error.message : String(error)}`;")) {
  throw new Error('browser lab must report teardown failure after clearing the preview rather than leaving a stale ready state');
}
if (!source.includes("teardownButton.disabled = false;\n      return;")) {
  throw new Error('browser lab must re-enable teardown after cleanup failure so adapter-owned cleanup can be retried');
}
if (source.includes("}, { once: true });")) {
  throw new Error('browser lab must not discard its teardown handler after a failed cleanup retry path');
}
const adapter = await readFile(path.join(root, 'packages', 'vivari-adapter', 'src', 'index.ts'), 'utf8');
for (const needle of ["import('@vivari/core')", 'Vivari.boot', 'server-ready']) {
  if (!adapter.includes(needle)) throw new Error(`adapter must own the Vivari SDK seam for ${needle}`);
}
for (const relative of ['labs/browser-smoke/src/main.ts', 'labs/browser-smoke/src/sdk.ts']) {
  const candidate = await readFile(path.join(root, relative), 'utf8');
  if (candidate.includes('@vivari/core')) throw new Error(`${relative} must not import Vivari directly; the adapter owns the fork boundary`);
}
const config = await readFile(path.join(lab, 'vite.config.ts'), 'utf8');
for (const needle of ['Cross-Origin-Opener-Policy', 'same-origin', 'Cross-Origin-Embedder-Policy', 'require-corp', 'Service-Worker-Allowed']) {
  if (!config.includes(needle)) throw new Error(`browser lab must serve ${needle}`);
}
console.log('browser lab static contract: PASS');
