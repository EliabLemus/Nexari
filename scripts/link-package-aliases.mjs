import { access, lstat, mkdir, readdir, readlink, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Create root node_modules symlinks so the repository's own Node test suites
 * and Vite builds resolve the bare package specifiers the adapter source and
 * its emitted dist now carry (`@nexari/runtime-contract`, `@vivari/core`).
 *
 * This is a development-resolution seam only: the published artifact remains
 * the versioned tarball produced by scripts/pack-browser-stack.mjs, which
 * declares real dependencies. The script is idempotent — an existing link is
 * kept when it already points at the right target, otherwise it is recreated.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const aliases = [
  // Consumed at runtime by the adapter dist (value imports of the contract).
  { name: '@nexari/runtime-contract', target: 'packages/runtime-contract' },
  // Consumed at runtime by the adapter's SDK loader (dynamic import).
  { name: '@vivari/core', target: 'runtime/vivari/packages/core' },
];

const nodeModules = path.join(repoRoot, 'node_modules');
await mkdir(nodeModules, { recursive: true });

for (const alias of aliases) {
  const linkPath = path.join(nodeModules, ...alias.name.split('/'));
  const targetPath = path.join(repoRoot, alias.target);
  const relativeTarget = path.relative(path.dirname(linkPath), targetPath);

  await access(targetPath);

  let current;
  try {
    current = await readlink(linkPath);
  } catch {
    current = undefined;
  }

  if (current !== undefined) {
    const resolvedCurrent = path.resolve(path.dirname(linkPath), current);
    if (resolvedCurrent === targetPath) {
      console.log(`link-package-aliases: ${alias.name} already linked`);
      continue;
    }
    await rm(linkPath, { recursive: true });
  } else {
    try {
      await lstat(linkPath);
      throw new Error(
        `link-package-aliases: refusing to replace existing non-symlink ${linkPath}; ` +
          'remove it explicitly or use a clean install directory',
      );
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
      // Nothing exists at the path — fall through and link.
    }
  }

  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(relativeTarget, linkPath, 'dir');
  console.log(`link-package-aliases: linked ${alias.name} -> ${alias.target}`);
}

// Fail loudly when a linked package has no dist yet: a missing emit would turn
// the next test run into a confusing resolution error.
for (const alias of aliases) {
  const distDir = path.join(repoRoot, alias.target, 'dist');
  try {
    await access(distDir);
    await readdir(distDir);
  } catch {
    throw new Error(`link-package-aliases: ${alias.target}/dist is missing — build the package first`);
  }
}

console.log('link-package-aliases: OK');
