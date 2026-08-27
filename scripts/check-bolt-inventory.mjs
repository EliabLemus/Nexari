import { readFile } from 'node:fs/promises';
const file = new URL('../compatibility/bolt-webcontainers-inventory.json', import.meta.url);
const data = JSON.parse(await readFile(file, 'utf8'));
const ids = new Set();
if (data.source.commit !== '2e254ac19a696394030601bc602f54945b12bfc4') throw new Error('Bolt commit is not pinned');
if (!Array.isArray(data.requirements) || data.requirements.length < 17) throw new Error('incomplete requirement inventory');
for (const row of data.requirements) {
  if (!/^BOLT-WC-\d{3}$/.test(row.id) || ids.has(row.id)) throw new Error(`invalid or duplicate requirement ${row.id}`);
  ids.add(row.id);
  for (const key of ['priority', 'statement', 'bolt_source', 'proof', 'nexari_status']) if (!row[key]) throw new Error(`${row.id} missing ${key}`);
}
console.log(`Bolt inventory OK (${ids.size} requirements; ${[...ids].filter((id) => id <= 'BOLT-WC-017').length} stable IDs)`);
