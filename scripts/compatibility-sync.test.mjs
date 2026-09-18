import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('generate:compatibility output stays in sync with the curated compatibility gate', async () => {
  let npmRun;
  try {
    npmRun = await run('npm', ['run', '--silent', 'generate:compatibility'], { cwd: repoRoot });
  } catch (error) {
    npmRun = { stdout: error.stdout ?? '', stderr: error.stderr ?? String(error) };
  }
  const { stdout } = await run('git', ['status', '--porcelain', '--', 'compatibility'], { cwd: repoRoot });
  const drift = stdout.trim();
  assert.equal(
    drift,
    '',
    `generate:compatibility must not dirty the compatibility gate (generator exit ${npmRun.stdout === '' ? 'nonzero' : 'zero'}); drift:\n${drift}\n--- generator stderr ---\n${npmRun.stderr}`,
  );
});
