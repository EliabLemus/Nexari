import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const matrixUrl = new URL('../compatibility/bolt-compatibility-matrix.md', import.meta.url);

test('BOLT-WC-002 remains explicitly blocked while preview injection and diagnostics lack browser evidence', async () => {
  const matrix = await readFile(matrixUrl, 'utf8');
  assert.match(
    matrix,
    /^\| BOLT-WC-002 \| must-have \| preview-diagnostics: Runtime accepts preview script injection and emits preview diagnostics to the host\. \| app\/lib\/webcontainer\/index\.ts:37-57 \| e2e\/preview-diagnostics\.spec\.ts \| blocked \(preview script injection and preview diagnostics are unsupported; `forwardPreviewErrors` rejects before SDK load\) \|$/m,
    'BOLT-WC-002 must not remain unknown once the adapter explicitly rejects its only exposed preview-diagnostics boot option before SDK load',
  );
});

test('BOLT-WC-003 is only marked proven with the browser-lab filesystem CRUD proof', async () => {
  const matrix = await readFile(matrixUrl, 'utf8');
  assert.match(
    matrix,
    /^\| BOLT-WC-003 \| must-have \| filesystem: Filesystem supports readFile, writeFile, mkdir, readdir and rm with text and binary payloads\. \| app\/lib\/stores\/files\.ts:554-888; app\/lib\/hooks\/useGit\.ts:191-311 \| e2e\/browser-smoke\.e2e\.mjs \(text CRUD, byte-exact binary read\/write and nested recursive directory lifecycle\) \| proven \|$/m,
    'BOLT-WC-003 needs the real browser-lab filesystem proof before it can leave the compatibility gate as unknown',
  );
});

test('BOLT-WC-004 is only marked proven with the browser-lab stable workdir proof', async () => {
  const matrix = await readFile(matrixUrl, 'utf8');
  assert.match(
    matrix,
    /^\| BOLT-WC-004 \| must-have \| workdir: Runtime exposes a stable workdir used for path translation by actions, persistence and git\. \| app\/lib\/runtime\/action-runner\.ts:317-466; app\/lib\/hooks\/useGit\.ts:87-138 \| e2e\/browser-smoke\.e2e\.mjs \(real guest process observes the adapter's stable root workdir\) \| proven \|$/m,
    'BOLT-WC-004 needs the real browser-lab workdir observation before it can leave the compatibility gate as unknown',
  );
});

test('BOLT-WC-017 is only marked proven with the isolated and non-isolated browser-lab proof', async () => {
  const matrix = await readFile(matrixUrl, 'utf8');
  assert.match(
    matrix,
    /^\| BOLT-WC-017 \| must-have \| browser-support: Unsupported browser isolation states must be detectable and give a typed failure, not a blank preview\. \| Bolt issue #2070; app\/lib\/webcontainer\/index\.ts:21-30 \| e2e\/browser-smoke\.e2e\.mjs \(isolated and non-isolated origins; typed ISOLATION_REQUIRED failure before Vivari SDK load\) \| proven \|$/m,
    'BOLT-WC-017 needs the real browser-lab negative proof before it can leave the compatibility gate as unknown',
  );
});

test('BOLT-WC-005 and BOLT-WC-006 remain blocked until their complete Chrome E2E contracts exist', async () => {
  const matrix = await readFile(matrixUrl, 'utf8');
  assert.match(
    matrix,
    /^\| BOLT-WC-005 \| must-have \| spawn: Runtime spawns node, npm and shell-like guest processes with arguments, cwd\/env and observable exit\. \| app\/lib\/runtime\/action-runner\.ts:395; app\/utils\/shell\.ts:7-89 \| e2e\/browser-smoke\.e2e\.mjs \(real node cwd\/env\/args\/exit; npm command-not-found typed failure; pinned `sh` diagnostic exit 127\) \| blocked \(node proven; npm unavailable; shell unavailable: `sh` reports `printf` not found and exits 127\) \|$/m,
    'BOLT-WC-005 cannot leave blocked without guest npm args/cwd/env/output/exit Chrome evidence',
  );
  assert.match(
    matrix,
    /^\| BOLT-WC-006 \| must-have \| terminal: Interactive shell process exposes input, merged output, terminal cols\/rows, resize and kill\. \| app\/utils\/shell\.ts:11-87; app\/lib\/stores\/terminal\.ts:50-61 \| e2e\/browser-smoke\.e2e\.mjs \(actual shell diagnostic plus explicit `interactive_terminal: unsupported` capability\) \| blocked \(explicitly unavailable; no interactive shell, terminal dimensions, or resize support is claimed\) \|$/m,
    'BOLT-WC-006 cannot leave blocked without interactive stdin/output/resize/kill/exit Chrome evidence',
  );
});
