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

test('BOLT-WC-005 is only marked proven with the bounded browser-lab node, npm, and shell proof', async () => {
  const matrix = await readFile(matrixUrl, 'utf8');
  assert.match(
    matrix,
    /^\| BOLT-WC-005 \| must-have \| spawn: Runtime spawns node, npm and shell-like guest processes with arguments, cwd\/env and observable exit\. \| app\/lib\/runtime\/action-runner\.ts:395; app\/utils\/shell\.ts:7-89 \| e2e\/browser-smoke\.e2e\.mjs \(real node cwd\/env\/args\/exit; real vendored npm@10\.9\.2 `npm run` with npm arguments, cwd, env and observed exit; real guest `sh -c`: quoted `node -e` argv, cwd, env, `&&` sequencing, `>` redirect with `cat`\/`rm`, observed exit 0, plus `sh -c 'false'` exit 1\) \| proven \(minimal POSIX-ish shell: no `\$VAR` expansion, globs, background `&` or subshells; interactive terminal remains blocked under BOLT-WC-006\) \|$/m,
    'BOLT-WC-005 must retain its specific browser evidence and disclose its bounded shell limitation',
  );
});

test('BOLT-WC-006 remains blocked until browser evidence includes terminal dimensions and resize', async () => {
  const matrix = await readFile(matrixUrl, 'utf8');
  assert.match(
    matrix,
    /^\| BOLT-WC-006 \| must-have \| terminal: Interactive shell process exposes input, merged output, terminal cols\/rows, resize and kill\. \| app\/utils\/shell\.ts:11-87; app\/lib\/stores\/terminal\.ts:50-61 \| e2e\/browser-smoke\.e2e\.mjs \(real interactive guest `sh` REPL: prompt shown, typed stdin line executed — marker observed as an exact output line, merged output, kill with observed exit 143; plus typed dimension capture: guest `process\.stdout` is `isTTY:false` with fixed `columns:80`\/`rows:24` constants and no resize path\) \| blocked \(interactive stdin\/merged output\/kill proven in-browser; terminal cols\/rows are fixed constants with no resize support — the dimension\/resize sub-capability remains unproven\) \|$/m,
    'BOLT-WC-006 must remain blocked while the browser proof records fixed dimensions and no resize path',
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
