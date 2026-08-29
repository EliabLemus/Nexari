import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateReleaseVersion } from './check-release-version.mjs';

async function fixture({ version = '0.1.0', changelogVersion = version } = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'nexari-release-version-'));
  await writeFile(path.join(rootDir, 'package.json'), `${JSON.stringify({ name: 'nexari', version }, null, 2)}\n`);
  await writeFile(path.join(rootDir, 'CHANGELOG.md'), `# Changelog\n\n## [${changelogVersion}] - 2026-08-29\n\n- Test release.\n`);
  return rootDir;
}

async function withFixture(options, callback) {
  const rootDir = await fixture(options);
  try {
    await callback(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('accepts a stable SemVer release when package and changelog agree', async () => {
  await withFixture({}, async (rootDir) => {
    await assert.doesNotReject(() => validateReleaseVersion({ rootDir, expectedVersion: '0.1.0' }));
  });
});

test('rejects a release input that differs from package.json', async () => {
  await withFixture({ version: '0.1.0' }, async (rootDir) => {
    await assert.rejects(
      () => validateReleaseVersion({ rootDir, expectedVersion: '0.1.1' }),
      /does not match package version/,
    );
  });
});

test('rejects a changelog heading that differs from package.json', async () => {
  await withFixture({ version: '0.1.0', changelogVersion: '0.1.1' }, async (rootDir) => {
    await assert.rejects(
      () => validateReleaseVersion({ rootDir, expectedVersion: '0.1.0' }),
      /does not contain heading/,
    );
  });
});

test('rejects prerelease and invalid release versions', async () => {
  await withFixture({ version: '0.1.0-dev', changelogVersion: '0.1.0-dev' }, async (rootDir) => {
    await assert.rejects(
      () => validateReleaseVersion({ rootDir, expectedVersion: '0.1.0-dev' }),
      /stable SemVer/,
    );
    await assert.rejects(
      () => validateReleaseVersion({ rootDir, expectedVersion: 'release-1' }),
      /stable SemVer/,
    );
  });
});
