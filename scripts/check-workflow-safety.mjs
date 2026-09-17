import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_NPM_PUBLICATION = /(?:npm|pnpm|yarn)\s+publish|npm\s+token|registry-url\s*:|NODE_AUTH_TOKEN\s*:/i;
const BROWSER_E2E_RUN = /run:.*npm run test:browser-lab/;
// The pin must sit in the same workflow step as the browser E2E run, be an
// absolute path, and actually name a Chrome binary — a bare `google-chrome`
// or an unrelated absolute binary does not pin a Chrome for the owned runner.
const CHROME_PIN = /^\s*NEXARI_CHROME_BIN:\s*\/\S*chrome\S*\s*$/i;
// The browser lab runner spawns and owns its own loopback-only Chrome with a
// fresh profile; workflows must never hand the E2E child a pre-chosen CDP
// endpoint (even a loopback one, which would bypass ephemeral-port ownership).
// Covers YAML mapping (`NEXARI_CHROME_CDP_URL:`) and shell assignment
// (`NEXARI_CHROME_CDP_URL=`, `export NEXARI_CHROME_CDP_URL=`) forms.
const WORKFLOW_CDP_ASSIGNMENT = /(?:^|\s)NEXARI_CHROME_CDP_URL\s*(?::|=)/;

export function assertNoNpmPublication(workflowContents) {
  if (FORBIDDEN_NPM_PUBLICATION.test(workflowContents)) {
    throw new Error('npm package publication is forbidden in Nexari workflows');
  }
}

function backwardStepLines(lines, runIndex, radius = 4) {
  const out = [];
  for (let j = runIndex - 1; j >= 0 && j >= runIndex - radius; j--) {
    if (/^\s*-\s/.test(lines[j])) break;
    out.push(lines[j]);
  }
  return out;
}

function forwardStepLines(lines, runIndex, radius = 4) {
  const out = [];
  for (let j = runIndex + 1; j < lines.length && j <= runIndex + radius; j++) {
    if (/^\s*-\s/.test(lines[j]) || /^\S/.test(lines[j])) break;
    out.push(lines[j]);
  }
  return out;
}

export function assertBrowserE2eChromePin(workflowContents) {
  const lines = workflowContents.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!BROWSER_E2E_RUN.test(lines[i])) continue;
    const stepLines = [lines[i], ...backwardStepLines(lines, i), ...forwardStepLines(lines, i)];
    if (!stepLines.some((line) => CHROME_PIN.test(line))) {
      throw new Error('Every test:browser-lab workflow step must pin NEXARI_CHROME_BIN to an absolute Chrome path in the same step');
    }
  }
}

export function assertNoWorkflowCdpAssignment(workflowContents) {
  if (WORKFLOW_CDP_ASSIGNMENT.test(workflowContents)) {
    throw new Error('Nexari workflows must not assign NEXARI_CHROME_CDP_URL; the browser lab runner owns its loopback-only Chrome');
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  const rootDir = path.resolve(path.dirname(thisPath), '..');
  const workflowDir = path.join(rootDir, '.github', 'workflows');
  for (const filename of await readdir(workflowDir)) {
    if (!/\.ya?ml$/i.test(filename)) continue;
    const contents = await readFile(path.join(workflowDir, filename), 'utf8');
    assertNoNpmPublication(contents);
    assertNoWorkflowCdpAssignment(contents);
    assertBrowserE2eChromePin(contents);
  }
  console.log('Workflow safety OK (no npm package publication; browser E2E pins owned loopback-only Chrome)');
}
