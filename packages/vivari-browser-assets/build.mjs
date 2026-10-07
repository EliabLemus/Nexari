import { cp, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, '../..');
const distDir = path.join(packageDir, 'dist');
const coreAssets = path.join(repoRoot, 'runtime', 'vivari', 'packages', 'core', 'dist', 'assets');
const studioPublic = path.join(repoRoot, 'runtime', 'vivari', 'packages', 'studio', 'public');

async function assertRegularTree(root) {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    const metadata = await lstat(candidate);

    if (metadata.isSymbolicLink()) {
      throw new Error(`Browser asset source must not contain symlinks: ${candidate}`);
    }

    if (metadata.isDirectory()) {
      await assertRegularTree(candidate);
    } else if (!metadata.isFile()) {
      throw new Error(`Browser asset source must contain only files and directories: ${candidate}`);
    }
  }
}

async function copyDirectory(source, destination) {
  await assertRegularTree(source);
  await cp(source, destination, { recursive: true, dereference: false, force: true });
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await copyDirectory(coreAssets, path.join(distDir, 'assets'));
await copyDirectory(path.join(studioPublic, 'vendor'), path.join(distDir, 'vendor'));

for (const filename of ['sw.js', '__vv-bridge.html', '__vv-preview-boot.html']) {
  await cp(path.join(filename === 'sw.js' ? coreAssets : studioPublic, filename), path.join(distDir, filename), {
    dereference: false,
    force: true,
  });
}
