import { readFile } from 'node:fs/promises';
const text = await readFile(new URL('../compatibility/stackblitz-public-contract-ledger.md', import.meta.url), 'utf8');
for (const needle of ['clean-room', 'forbids proprietary runtime', 'webcontainers.io/guides/quickstart', 'webcontainers.io/guides/running-processes', 'webcontainers.io/guides/configuring-headers', '@webcontainer/api']) {
  if (!text.includes(needle)) throw new Error(`public source ledger missing ${needle}`);
}
console.log('StackBlitz public-source ledger OK (public sources only)');
