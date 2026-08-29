import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_NPM_PUBLICATION = /(?:npm|pnpm|yarn)\s+publish|npm\s+token|registry-url\s*:|NODE_AUTH_TOKEN\s*:/i;

export function assertNoNpmPublication(workflowContents) {
  if (FORBIDDEN_NPM_PUBLICATION.test(workflowContents)) {
    throw new Error('npm package publication is forbidden in Nexari workflows');
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  const rootDir = path.resolve(path.dirname(thisPath), '..');
  const workflowDir = path.join(rootDir, '.github', 'workflows');
  for (const filename of await readdir(workflowDir)) {
    if (!/\.ya?ml$/i.test(filename)) continue;
    assertNoNpmPublication(await readFile(path.join(workflowDir, filename), 'utf8'));
  }
  console.log('Workflow safety OK (no npm package publication)');
}
