import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'artifacts', 'browser-stack');
const packages = [
  { name: '@nexari/runtime-contract', dir: 'packages/runtime-contract', allowed: /^(package\.json|dist\/.+)$/ },
  { name: '@vivari/core', dir: 'runtime/vivari/packages/core', allowed: /^(package\.json|README\.md|dist\/.+)$/ },
  { name: '@nexari/vivari-adapter', dir: 'packages/vivari-adapter', allowed: /^(package\.json|dist\/.+)$/ },
];

async function packOne(pkg) {
  const cwd = path.join(repoRoot, pkg.dir);
  const { stdout } = await execFile('npm', ['pack', '--json', '--pack-destination', outputDir], {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  const [entry] = JSON.parse(stdout);
  if (!entry?.filename || !Array.isArray(entry.files)) {
    throw new Error(`pack-browser-stack: npm pack returned no manifest for ${pkg.name}`);
  }
  const unexpected = entry.files.map((file) => file.path).filter((file) => !pkg.allowed.test(file));
  if (unexpected.length) {
    throw new Error(`${pkg.name}: unexpected packed files: ${unexpected.join(', ')}`);
  }
  if (!entry.files.some((file) => file.path === 'dist/index.js')) {
    throw new Error(`${pkg.name}: tarball lacks dist/index.js`);
  }
  return { name: pkg.name, filename: entry.filename, version: entry.version, files: entry.files.map((file) => file.path) };
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const manifest = [];
for (const pkg of packages) manifest.push(await packOne(pkg));

const adapter = manifest.find((pkg) => pkg.name === '@nexari/vivari-adapter');
const contract = manifest.find((pkg) => pkg.name === '@nexari/runtime-contract');
const core = manifest.find((pkg) => pkg.name === '@vivari/core');
const adapterManifest = JSON.parse(await readFile(path.join(repoRoot, 'packages/vivari-adapter/package.json'), 'utf8'));
if (adapterManifest.dependencies?.['@nexari/runtime-contract'] !== contract.version || adapterManifest.dependencies?.['@vivari/core'] !== core.version) {
  throw new Error('adapter dependencies must pin the packed runtime-contract and Vivari core versions exactly');
}

// Prove the three tarballs resolve as a clean consumer without repo symlinks.
const consumer = await mkdtemp(path.join(tmpdir(), 'nexari-browser-stack-consumer-'));
try {
  await writeFile(path.join(consumer, 'package.json'), '{"type":"module","private":true}\n');
  await execFile('npm', [
    'install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock',
    path.join(outputDir, contract.filename),
    path.join(outputDir, core.filename),
    path.join(outputDir, adapter.filename),
  ], { cwd: consumer, maxBuffer: 10 * 1024 * 1024 });
  await execFile('node', ['--input-type=module', '--eval', "await import('@nexari/vivari-adapter')"], { cwd: consumer });
} finally {
  await rm(consumer, { recursive: true, force: true });
}

await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify({ packages: manifest }, null, 2)}\n`);
console.log(`pack-browser-stack: ${manifest.map((pkg) => pkg.filename).join(', ')}`);
