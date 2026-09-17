import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePinnedCandidate, validateUpstreamVivari100Ledger } from './check-upstream-vivari-1.0-ledger.mjs';

const validLedger = `
### Evaluated, not adopted: \`@vivari/core@1.0.0\`

\`\`\`text
Public source: https://github.com/maitrungduc1410/vivari.git
Published package metadata: https://registry.npmjs.org/@vivari/core/1.0.0
Package version / gitHead: 1.0.0 / 2629c71097238400c45aefa213ef61df4794c2b7
Git reference retrieved: refs/tags/v1.0.0
Retrieved at: 2026-09-04T19:20:19Z
License: MIT (tagged LICENSE SHA-256: 30a6c0cfc55b5c36932f8438db7925460283f72c75b5f7d32efbeaadb9b75d73)
Disposition: not adopted; migration candidate only.
\`\`\`

This public-source record supports only provenance and candidate evaluation. It does not claim that BOLT-WC-005 or BOLT-WC-006 is compatible, and it cannot change either status without the required real Chrome proof.
`;

test('accepts the exact evaluated-not-adopted Vivari 1.0.0 provenance record', () => {
  assert.doesNotThrow(() => validateUpstreamVivari100Ledger(validLedger));
});

test('rejects a candidate record that could promote WC-005 or WC-006 without Chrome proof', () => {
  assert.throws(
    () => validateUpstreamVivari100Ledger(validLedger.replace('does not claim that BOLT-WC-005 or BOLT-WC-006 is compatible, and it cannot change either status without the required real Chrome proof', 'proves BOLT-WC-005 and BOLT-WC-006 compatible')),
    /narrow permitted claim/,
  );
});

test('rejects a compatibility promotion even when the required disclaimer remains', () => {
  assert.throws(
    () => validateUpstreamVivari100Ledger(`${validLedger}\nBOLT-WC-005 is compatible with the candidate runtime.`),
    /unproven BOLT-WC capability promotion/,
  );
});

test('rejects a reversed-order compatibility claim about BOLT-WC-005 or BOLT-WC-006', () => {
  assert.throws(
    () => validateUpstreamVivari100Ledger(`${validLedger}\nThe candidate runtime is compatible with BOLT-WC-006.`),
    /unproven BOLT-WC capability promotion/,
  );
});

test('reads the candidate license by the resolved pinned SHA, never through the mutable tag again', async () => {
  const calls = [];
  await validatePinnedCandidate(async (...args) => {
    calls.push(args);
    if (args.join(' ') === 'rev-parse v1.0.0^{commit}') {
      return '2629c71097238400c45aefa213ef61df4794c2b7\n';
    }
    if (args.join(' ') === 'show 2629c71097238400c45aefa213ef61df4794c2b7:LICENSE') {
      return 'MIT License\n';
    }
    throw new Error(`unexpected git invocation: ${args.join(' ')}`);
  }, '267f7a2e19dfa9df99af774520985a0e521925293ea5b7e767ab06969d06bf91');
  assert.deepEqual(calls, [
    ['rev-parse', 'v1.0.0^{commit}'],
    ['show', '2629c71097238400c45aefa213ef61df4794c2b7:LICENSE'],
  ]);
});
