import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
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

  // The generated inventory must mirror the curated matrix exactly: every
  // requirement's proof and status equals the matrix row it was derived from.
  const inventory = JSON.parse(await readFile(new URL('../compatibility/bolt-webcontainers-inventory.json', import.meta.url), 'utf8'));
  const matrix = await readFile(new URL('../compatibility/bolt-compatibility-matrix.md', import.meta.url), 'utf8');
  const curated = new Map();
  for (const line of matrix.split('\n')) {
    const match = line.match(/^\| (BOLT-WC-\d{3}) \|/);
    if (!match) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    curated.set(cells[0], { proof: cells[4], status: cells[5] });
  }
  assert.equal(inventory.requirements.length, curated.size, 'inventory and curated matrix must cover the same requirements');
  for (const requirement of inventory.requirements) {
    const row = curated.get(requirement.id);
    assert.ok(row, `inventory row ${requirement.id} is missing from the curated matrix`);
    assert.equal(requirement.proof, row.proof, `${requirement.id} proof must equal the curated matrix row`);
    assert.equal(requirement.nexari_status, row.status, `${requirement.id} status must equal the curated matrix row`);
  }
});
