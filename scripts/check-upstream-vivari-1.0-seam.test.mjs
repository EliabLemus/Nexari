import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSeamProbeReport } from './check-upstream-vivari-1.0-seam.mjs';

const CANDIDATE_SHA = '2629c71097238400c45aefa213ef61df4794c2b7';
const OWNED_SHA = '26f1d6222942a09411292ea6e55053f3729436ca';

const VALID_MANIFEST = {
  migration: {
    candidate: { package: '@vivari/core', version: '1.0.0', sha: CANDIDATE_SHA },
    ownedFork: { unrelatedHistoryToCandidate: false },
    lineageNote: 'v1.0.0 is a strict ancestor of the owned fork (101 commits behind).',
  },
  capabilityNote:
    'This manifest records the static migration seam only. It does not claim BOLT-WC-005 or BOLT-WC-006 compatibility; both remain blocked pending real Chrome E2E proof.',
  seam: [
    {
      member: 'boot',
      status: 'supported',
      evidence: [{ path: 'packages/core/src/vivari.ts', contains: 'static async boot' }],
    },
    {
      member: 'process.kill',
      status: 'supported',
      evidence: [{ path: 'packages/core/src/process.ts', contains: 'kill(): void' }],
    },
    {
      member: 'fs.watch',
      status: 'absent',
      evidence: [
        { path: 'packages/core/src/fs.ts', contains: 'export class FileSystemAPI' },
        { path: 'packages/core/src/fs.ts', absent: 'watch' },
      ],
    },
  ],
};

function baseReport() {
  return {
    candidateSha: CANDIDATE_SHA,
    gitlinkSha: OWNED_SHA,
    submoduleClean: true,
    lineage: { candidateAncestorOfOwned: true },
    sources: {
      'packages/core/src/vivari.ts': 'export class Vivari {\n  static async boot(options = {}) {\n  }\n}',
      'packages/core/src/process.ts': 'export class VivariProcess {\n  kill(): void {\n  }\n}',
      'packages/core/src/fs.ts': 'export class FileSystemAPI {\n}',
    },
  };
}

test('accepts a report whose status column matches the pinned candidate sources', () => {
  assert.doesNotThrow(() => validateSeamProbeReport(baseReport(), VALID_MANIFEST));
});

test('fails closed when the probe never resolved the candidate SHA', () => {
  const report = baseReport();
  report.candidateSha = null;
  assert.throws(
    () => validateSeamProbeReport(report, VALID_MANIFEST),
    /probe failed to resolve the pinned candidate SHA/,
  );
});

test('fails closed when the resolved tag does not match the ledger-recorded SHA', () => {
  const report = baseReport();
  report.candidateSha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  assert.throws(
    () => validateSeamProbeReport(report, VALID_MANIFEST),
    /does not match the ledger-recorded/,
  );
});

test('fails closed when the submodule carries uncommitted state', () => {
  const report = baseReport();
  report.submoduleClean = false;
  assert.throws(
    () => validateSeamProbeReport(report, VALID_MANIFEST),
    /nested runtime\/vivari submodule is not clean/,
  );
});

test('fails closed when the submodule moved off the owned fork pin', () => {
  const report = baseReport();
  report.gitlinkSha = CANDIDATE_SHA;
  assert.throws(
    () => validateSeamProbeReport(report, VALID_MANIFEST),
    /must stay pinned to the owned fork/,
  );
});

test('rejects a manifest whose unrelatedHistoryToCandidate contradicts the probed lineage', () => {
  const report = baseReport();
  report.lineage.candidateAncestorOfOwned = false;
  assert.throws(
    () => validateSeamProbeReport(report, VALID_MANIFEST),
    /contradicts the probed lineage/,
  );
});

test('rejects a probe report that never measured lineage', () => {
  const report = baseReport();
  delete report.lineage;
  assert.throws(
    () => validateSeamProbeReport(report, VALID_MANIFEST),
    /must record lineage/,
  );
});

test('rejects a manifest lineage flag that is not a boolean', () => {
  const manifest = structuredClone(VALID_MANIFEST);
  manifest.migration.ownedFork.unrelatedHistoryToCandidate = 'false';
  assert.throws(
    () => validateSeamProbeReport(baseReport(), manifest),
    /unrelatedHistoryToCandidate must be a boolean/,
  );
});

test('rejects a supported status that static evidence cannot support', () => {
  const report = baseReport();
  const manifest = structuredClone(VALID_MANIFEST);
  manifest.seam[2] = {
    member: 'fs.watch',
    status: 'supported',
    evidence: [
      { path: 'packages/core/src/fs.ts', contains: 'export class FileSystemAPI' },
      { path: 'packages/core/src/fs.ts', absent: 'watch' },
    ],
  };
  assert.throws(
    () => validateSeamProbeReport(report, manifest),
    /static evidence cannot support a supported status/,
  );
});

test('rejects an absent status whose needle actually exists', () => {
  const report = baseReport();
  const manifest = structuredClone(VALID_MANIFEST);
  manifest.seam[2] = {
    member: 'fs.watch',
    status: 'absent',
    evidence: [{ path: 'packages/core/src/fs.ts', absent: 'watch' }],
  };
  report.sources['packages/core/src/fs.ts'] = 'export class FileSystemAPI {\n  watch(path) {\n  }\n}';
  assert.throws(
    () => validateSeamProbeReport(report, manifest),
    /exists in the pinned candidate/,
  );
});

test('rejects manifest rows without a pinned evidence path', () => {
  const report = baseReport();
  const manifest = structuredClone(VALID_MANIFEST);
  delete manifest.seam[0].evidence[0].path;
  assert.throws(
    () => validateSeamProbeReport(report, manifest),
    /lacks a pinned evidence path/,
  );
});

test('rejects any manifest that promotes BOLT-WC-005/006', () => {
  const report = baseReport();
  const manifest = structuredClone(VALID_MANIFEST);
  manifest.seam[0].note = 'BOLT-WC-005 proven by the seam manifest';
  assert.throws(
    () => validateSeamProbeReport(report, manifest),
    /must not promote BOLT-WC-005 or BOLT-WC-006/,
  );
});
