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

test('BOLT-WC-005 is only marked proven with the positive browser shell proof, alongside the real vendored npm proof', async () => {
  const matrix = await readFile(matrixUrl, 'utf8');
  assert.match(
    matrix,
    /^\| BOLT-WC-005 \| must-have \| spawn: Runtime spawns node, npm and shell-like guest processes with arguments, cwd\/env and observable exit\. \| app\/lib\/runtime\/action-runner\.ts:395; app\/utils\/shell\.ts:7-89 \| e2e\/browser-smoke\.e2e\.mjs \(real node, lazy-loaded vendored npm cwd\/env\/args\/exit and guest `sh` printf: quoted format, exit 0, byte-exact stdout\) \| proven \(node, real vendored npm and the guest shell proven in the browser: `printf` with an explicit trailing-newline format exits 0 with byte-exact stdout; uninstalled commands still fail typed, `sh: seq: not found` \+ exit 127\) \|$/m,
    'BOLT-WC-005 may only leave the compatibility gate once the guest shell is proven positively in a real browser, alongside the already-proven vendored npm CLI',
  );
});

test('BOLT-WC-006 is only marked proven with the browser resize proof alongside its interactive-shell stdin, merged-output and kill legs', async () => {
  const matrix = await readFile(matrixUrl, 'utf8');
  assert.match(
    matrix,
    /^\| BOLT-WC-006 \| must-have \| terminal: Interactive shell process exposes input, merged output, terminal cols\/rows, resize and kill\. \| app\/utils\/shell\.ts:11-87; app\/lib\/stores\/terminal\.ts:50-61 \| e2e\/browser-smoke\.e2e\.mjs \(interactive guest `sh` REPL driven over streams: prompt-synced open-stdin keystrokes with echo-safe split markers, merged output with stream-tagged stderr from a nested one-shot shell, kill and closed merged stream; guest `node` probe asserting terminal dims 80x24 and a live `resize` to 100x30 acknowledged by a guest SIGWINCH handler; `interactive_terminal: experimental` capability\) \| proven \(all five legs browser-proven over the owned runtime: interactive-shell stdin, merged output with stream-tagged stderr, terminal cols\/rows at spawn, live resize acknowledged through SIGWINCH, and kill closing the merged stream; capability disclosed as `interactive_terminal: experimental`\) \|$/m,
    'BOLT-WC-006 may only leave the compatibility gate once every leg — stdin, merged output, cols/rows, resize and kill — is proven in a real browser over the owned runtime',
  );
});

test('BOLT-WC-006 structural audit: contract and core seams carry terminal dimensions only with adjacent browser-proof references', async () => {
  const contractSource = await readFile(new URL('../packages/runtime-contract/src/index.ts', import.meta.url), 'utf8');
  const runtimeSpawnOptions = await readFile(new URL('../runtime/vivari/packages/core/src/types.ts', import.meta.url), 'utf8');
  const runtimeProtocol = await readFile(new URL('../runtime/vivari/packages/protocol/syscall.js', import.meta.url), 'utf8');
  assert.match(
    contractSource,
    /resize\s*\??\s*[(:]|resize\s*\([^)]*\)\s*:\s*void[\s\S]{0,200}wc006ResizeProof/,
    'the runtime contract resize primitive must cite the browser resize proof (wc006ResizeProof) in an adjacent doc comment, or the BOLT-WC-006 browser evidence is missing',
  );
  assert.match(
    contractSource,
    /terminal\??:\s*RuntimeTerminalDimensions[\s\S]{0,200}wc006TtyDimsProof/,
    'the runtime contract terminal spawn option must cite the browser tty-dims proof (wc006TtyDimsProof) in an adjacent doc comment, or the BOLT-WC-006 browser evidence is missing',
  );
  assert.match(
    runtimeSpawnOptions,
    /terminal\??:\s*\{[\s\S]{0,120}columns[\s\S]{0,120}\}[\s\S]{0,200}wc006TtyDimsProof/,
    'the owned runtime spawn options gained terminal dimensions: they must cite the browser tty-dims proof (wc006TtyDimsProof) in an adjacent doc comment',
  );
  assert.doesNotMatch(runtimeProtocol, /\b(?:SIGWINCH|TIOCSWINSZ)\b/i, 'the owned runtime signal protocol gained a guest-visible resize primitive: prove terminal resize in a real browser against the owned runtime before relaxing the BOLT-WC-006 blocked row or this audit');
});

test('BOLT-WC-017 is only marked proven with the isolated and non-isolated browser-lab proof', async () => {
  const matrix = await readFile(matrixUrl, 'utf8');
  assert.match(
    matrix,
    /^\| BOLT-WC-017 \| must-have \| browser-support: Unsupported browser isolation states must be detectable and give a typed failure, not a blank preview\. \| Bolt issue #2070; app\/lib\/webcontainer\/index\.ts:21-30 \| e2e\/browser-smoke\.e2e\.mjs \(isolated and non-isolated origins; typed ISOLATION_REQUIRED failure before Vivari SDK load\) \| proven \|$/m,
    'BOLT-WC-017 needs the real browser-lab negative proof before it can leave the compatibility gate as unknown',
  );
});
