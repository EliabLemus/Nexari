import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export async function validateReleaseVersion({ rootDir, expectedVersion }) {
  if (!STABLE_SEMVER.test(expectedVersion)) {
    throw new Error(`Release version must be stable SemVer (X.Y.Z): ${expectedVersion}`);
  }

  const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
  if (packageJson.version !== expectedVersion) {
    throw new Error(`Release version ${expectedVersion} does not match package version ${packageJson.version}`);
  }

  const changelog = await readFile(path.join(rootDir, 'CHANGELOG.md'), 'utf8');
  const heading = `## [${expectedVersion}] - `;
  if (!changelog.split(/\r?\n/).some((line) => line.startsWith(heading))) {
    throw new Error(`CHANGELOG.md does not contain heading ${heading}YYYY-MM-DD`);
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
const thisPath = fileURLToPath(import.meta.url);
if (invokedPath === thisPath) {
  const expectedVersion = process.argv[2];
  if (!expectedVersion) {
    throw new Error('Usage: node scripts/check-release-version.mjs X.Y.Z');
  }
  await validateReleaseVersion({ rootDir: process.cwd(), expectedVersion });
  console.log(`Release metadata valid for ${expectedVersion}`);
}
