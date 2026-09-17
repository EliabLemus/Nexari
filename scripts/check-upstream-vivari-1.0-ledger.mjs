import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const requiredNeedles = [
  '### Evaluated, not adopted: `@vivari/core@1.0.0`',
  'Public source: https://github.com/maitrungduc1410/vivari.git',
  'Published package metadata: https://registry.npmjs.org/@vivari/core/1.0.0',
  'Package version / gitHead: 1.0.0 / 2629c71097238400c45aefa213ef61df4794c2b7',
  'Git reference retrieved: refs/tags/v1.0.0',
  'Retrieved at: 2026-09-04T19:20:19Z',
  'License: MIT (tagged LICENSE SHA-256: 30a6c0cfc55b5c36932f8438db7925460283f72c75b5f7d32efbeaadb9b75d73)',
  'Disposition: not adopted; migration candidate only.',
];
const narrowClaim = 'does not claim that BOLT-WC-005 or BOLT-WC-006 is compatible, and it cannot change either status without the required real Chrome proof';
const prohibitedCapabilityPromotion = /BOLT-WC-00[56][^\n]{0,100}\b(?:compatible|proven|passes?)\b|\b(?:compatible|proven|passes?)\b[^\n]{0,100}BOLT-WC-00[56]|\b(?:promotes?|proves?)\s+BOLT-WC-00[56]/i;

export function validateUpstreamVivari100Ledger(text) {
  for (const needle of requiredNeedles) {
    if (!text.includes(needle)) throw new Error(`Vivari 1.0.0 source ledger missing ${needle}`);
  }
  if (!text.includes(narrowClaim)) throw new Error('Vivari 1.0.0 source ledger missing narrow permitted claim');
  if (prohibitedCapabilityPromotion.test(text.replace(narrowClaim, ''))) throw new Error('Vivari 1.0.0 source ledger contains unproven BOLT-WC capability promotion');
}

async function git(...args) {
  const { stdout } = await execFileAsync('git', ['-C', new URL('../runtime/vivari/', import.meta.url).pathname, ...args], { encoding: 'utf8' });
  return stdout;
}

export async function validatePinnedCandidate(gitCommand = git, expectedLicenseSha256 = '30a6c0cfc55b5c36932f8438db7925460283f72c75b5f7d32efbeaadb9b75d73') {
  const commit = (await gitCommand('rev-parse', 'v1.0.0^{commit}')).trim();
  if (commit !== '2629c71097238400c45aefa213ef61df4794c2b7') throw new Error(`Vivari v1.0.0 resolves to unexpected commit ${commit}`);
  // Resolve the tag once, then address the exact object. Reusing v1.0.0 here
  // would leave a tag-move window between provenance resolution and license read.
  const license = await gitCommand('show', `${commit}:LICENSE`);
  const licenseSha256 = createHash('sha256').update(license).digest('hex');
  if (licenseSha256 !== expectedLicenseSha256) throw new Error(`Vivari v1.0.0 LICENSE has unexpected SHA-256 ${licenseSha256}`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const text = await readFile(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');
  validateUpstreamVivari100Ledger(text);
  await validatePinnedCandidate();
  console.log('Vivari 1.0.0 source ledger OK (evaluated, not adopted; no compatibility promotion)');
}
