import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSeamProbeReport } from './check-upstream-vivari-1.0-seam.mjs';

const CANDIDATE_SHA = '2629c71097238400c45aefa213ef61df4794c2b7';
const OWNED_SHA = '26f1d6222942a09411292ea6e55053f3729436ca';

const VALID_MANIFEST = {
  migration: {
    candidate: { package: '@vivari/core', version: '1.0.0', sha: CANDIDATE_SHA },
    ownedFork: { unrelatedHistoryToCandidate: false, lineageDirection: 'candidate-ancestor' },
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
    indexGitlinkSha: OWNED_SHA,
    submoduleClean: true,
    lineage: {
      candidateAncestorOfOwned: true,
      ownedAncestorOfCandidate: false,
      distances: {
        tagBehindMaster: 99,
        ownedAheadOfTag: 101,
        ownedAheadOfMaster: 2,
      },
    },
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

test('rejects a probe report without live measured lineage distances', () => {
  const report = baseReport();
  delete report.lineage.distances;
  assert.throws(
    () => validateSeamProbeReport(report, VALID_MANIFEST),
    /must record measured lineage distances/,
  );
});

test('requires the directionally correct owned-ahead-of-tag distance label', () => {
  const report = baseReport();
  report.lineage.distances.ownedBehindTag = report.lineage.distances.ownedAheadOfTag;
  delete report.lineage.distances.ownedAheadOfTag;
  assert.throws(
    () => validateSeamProbeReport(report, VALID_MANIFEST),
    /must record measured lineage distances/,
  );
});

test('rejects non-numeric live measured lineage distances', () => {
  const report = baseReport();
  report.lineage.distances.tagBehindMaster = '99';
  assert.throws(
    () => validateSeamProbeReport(report, VALID_MANIFEST),
    /must record measured lineage distances/,
  );
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

test('fails closed when a gitlink move off the pin is staged in the index', () => {
  const report = baseReport();
  report.indexGitlinkSha = CANDIDATE_SHA;
  assert.throws(
    () => validateSeamProbeReport(report, VALID_MANIFEST),
    /gitlink staged in the index must also stay pinned/,
  );
});

test('fails closed when the index no longer records the runtime/vivari gitlink', () => {
  const report = baseReport();
  report.indexGitlinkSha = null;
  assert.throws(
    () => validateSeamProbeReport(report, VALID_MANIFEST),
    /gitlink staged in the index must also stay pinned/,
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

test('accepts a truthful related candidate that descends from the owned fork', () => {
  const report = baseReport();
  report.lineage.candidateAncestorOfOwned = false;
  report.lineage.ownedAncestorOfCandidate = true;
  const manifest = structuredClone(VALID_MANIFEST);
  manifest.migration.ownedFork.lineageDirection = 'candidate-descendant';
  assert.doesNotThrow(() => validateSeamProbeReport(report, manifest));
});

test('rejects a probe report that never measured both lineage directions', () => {
  const report = baseReport();
  delete report.lineage.ownedAncestorOfCandidate;
  assert.throws(
    () => validateSeamProbeReport(report, VALID_MANIFEST),
    /must record both lineage directions/,
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

test('rejects a migration record quoting a commit distance that contradicts the measured counts', () => {
  const manifest = structuredClone(VALID_MANIFEST);
  manifest.migration.lineageNote = 'Upstream master descends from the tag (325 commits later).';
  assert.throws(
    () => validateSeamProbeReport(baseReport(), manifest),
    /quotes commit distance\(s\) 325 that contradict the measured counts/,
  );
});

test('accepts migration prose that quotes only measured commit distances', () => {
  const manifest = structuredClone(VALID_MANIFEST);
  manifest.migration.lineageNote =
    'The tag is 99 commits behind upstream master; the owned fork is 101 commits behind the tag and 2 ahead of master.';
  assert.doesNotThrow(() => validateSeamProbeReport(baseReport(), manifest));
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

test('rejects promotion phrased as unblocked, succeeds, or works', () => {
  const promotions = [
    'BOLT-WC-006 unblocked by static seam',
    'BOLT-WC-006 succeeds in this build',
    'BOLT-WC-005 works without Chrome',
  ];

  for (const promotion of promotions) {
    const manifest = structuredClone(VALID_MANIFEST);
    // Keep the probe to one row: otherwise a later, unrelated `supported`
    // status can accidentally satisfy the guard's broad 120-character scan.
    manifest.seam = [manifest.seam[0]];
    manifest.seam[0].note = promotion;
    assert.throws(
      () => validateSeamProbeReport(baseReport(), manifest),
      /must not promote BOLT-WC-005 or BOLT-WC-006/,
      promotion,
    );
  }
});

test('rejects every residual BOLT-WC-005/006 reference outside the canonical blocked note', () => {
  for (const note of [
    'BOLT-WC-005 is green according to this static seam',
    'BOLT-WC-006 is validated by candidate source inspection',
    `BOLT-WC-005 ${'x'.repeat(121)} is proven`,
  ]) {
    const manifest = structuredClone(VALID_MANIFEST);
    manifest.seam = [manifest.seam[0]];
    manifest.seam[0].note = note;
    assert.throws(
      () => validateSeamProbeReport(baseReport(), manifest),
      /must not promote BOLT-WC-005 or BOLT-WC-006/,
      note,
    );
  }
});
