import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'openspec/config.yaml', 'openspec/project.md',
  'openspec/changes/add-bolt-compatible-vivari-runtime/proposal.md',
  'openspec/changes/add-bolt-compatible-vivari-runtime/design.md',
  'openspec/changes/add-bolt-compatible-vivari-runtime/tasks.md',
  'openspec/changes/add-bolt-compatible-vivari-runtime/specs/runtime-adapter/spec.md',
  'openspec/changes/add-bolt-compatible-vivari-runtime/specs/runtime-isolation/spec.md',
  'openspec/changes/add-bolt-compatible-vivari-runtime/specs/runtime-preview/spec.md'
];
await Promise.all(required.map((file) => access(path.join(root, file))));
console.log(`OpenSpec layout OK (${required.length} required artifacts)`);
