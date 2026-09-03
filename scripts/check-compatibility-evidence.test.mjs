import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const matrixUrl = new URL('../compatibility/bolt-compatibility-matrix.md', import.meta.url);

test('BOLT-WC-017 is only marked proven with the isolated and non-isolated browser-lab proof', async () => {
  const matrix = await readFile(matrixUrl, 'utf8');
  assert.match(
    matrix,
    /^\| BOLT-WC-017 \| must-have \| browser-support: Unsupported browser isolation states must be detectable and give a typed failure, not a blank preview\. \| Bolt issue #2070; app\/lib\/webcontainer\/index\.ts:21-30 \| e2e\/browser-smoke\.e2e\.mjs \(isolated and non-isolated origins; typed ISOLATION_REQUIRED failure before Vivari SDK load\) \| proven \|$/m,
    'BOLT-WC-017 needs the real browser-lab negative proof before it can leave the compatibility gate as unknown',
  );
});
