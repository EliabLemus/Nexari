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

test('BOLT-WC-006 remains blocked on cols/rows resize while its interactive-shell stdin, merged-output and kill legs are browser-proven on the guest REPL', async () => {
  const matrix = await readFile(matrixUrl, 'utf8');
  assert.match(
    matrix,
    /^\| BOLT-WC-006 \| must-have \| terminal: Interactive shell process exposes input, merged output, terminal cols\/rows, resize and kill\. \| app\/utils\/shell\.ts:11-87; app\/lib\/stores\/terminal\.ts:50-61 \| e2e\/browser-smoke\.e2e\.mjs \(interactive guest `sh` REPL driven over streams: prompt-synced open-stdin keystrokes with echo-safe split markers, merged output with stream-tagged stderr from a nested one-shot shell, kill and closed merged stream; explicit `interactive_terminal: unsupported` capability\) \| blocked \(interactive-shell stdin, merged output and kill are browser-proven on the guest `sh` REPL over streams — no pty is involved and the `interactive_terminal` capability stays unsupported; remaining gap: terminal cols\/rows and resize only, structurally absent per scoped audit: runtime contract lacks resize, core spawn options lack terminal dimensions, syscall protocol lacks SIGWINCH or TIOCSWINSZ\) \|$/m,
    'BOLT-WC-006 may only narrow its blocked rationale once interactive-shell stdin, merged output and kill are proven in a real browser over the owned runtime, and it must stay blocked while resize remains structurally absent',
  );
});

test('BOLT-WC-006 structural audit: named declaration seams still expose no resize, dimensions or SIGWINCH primitive', async () => {
  const contractSource = await readFile(new URL('../packages/runtime-contract/src/index.ts', import.meta.url), 'utf8');
  const runtimeSpawnOptions = await readFile(new URL('../runtime/vivari/packages/core/src/types.ts', import.meta.url), 'utf8');
  const runtimeProtocol = await readFile(new URL('../runtime/vivari/packages/protocol/syscall.js', import.meta.url), 'utf8');
  assert.doesNotMatch(contractSource, /\b(?:resize|setWindowSize)\s*\??\s*[:(]/, 'the runtime contract gained a resize primitive: prove terminal resize in a real browser against the owned runtime before relaxing the BOLT-WC-006 blocked row or this audit');
  assert.doesNotMatch(runtimeSpawnOptions, /\b(?:terminal|columns|rows|pty|winsize)\s*\??\s*:/i, 'the owned runtime spawn options gained terminal dimensions: prove them in a real browser before relaxing the BOLT-WC-006 blocked row or this audit');
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
