import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(root, 'runtime', 'vivari');

// Ledger-recorded candidate (@vivari/core@1.0.0, THIRD_PARTY_NOTICES.md).
const LEDGER_CANDIDATE_SHA = '2629c71097238400c45aefa213ef61df4794c2b7';
// Owned fork pin (see runtime/PATCHES.md); the submodule must not move.
const OWNED_FORK_GITLINK = '26f1d6222942a09411292ea6e55053f3729436ca';

const promotionPattern =
  /BOLT-WC-00[56][^\n]{0,120}\b(?:proven|compatible|passes|pass|supported|unblocked|succeeds?|works?)\b|\b(?:promotes?|proves?)\s+BOLT-WC-00[56]/i;

// Measured 2026-09-05 (git rev-list --count, complete history): the ledger
// candidate tag is 99 commits behind upstream master 9a89ff3, and the owned
// fork 26f1d62 is upstream master plus 2 local commits (101 behind the tag).
// Prose in the manifest may quote commit distances only when they match these
// measured counts; anything else fails closed like every other lineage claim.
const MEASURED_COMMIT_DISTANCES = {
  tagBehindMaster: 99,
  ownedBehindTag: 101,
  ownedAheadOfMaster: 2,
};

async function git(...args) {
  const { stdout } = await execFileAsync('git', ['-C', runtimeDir, ...args], { encoding: 'utf8' });
  return stdout;
}

async function gitInRoot(...args) {
  const { stdout } = await execFileAsync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return stdout;
}

/**
 * Probe the pinned candidate WITHOUT trusting the mutable v1.0.0 ref for
 * content: resolve the tag to a commit, assert it matches the ledger SHA,
 * then read every source byte from the resolved SHA.
 */
export async function probeSeam() {
  let candidateSha = null;
  try {
    candidateSha = (await git('rev-parse', 'v1.0.0^{commit}')).trim();
  } catch {
    candidateSha = null; // fail closed; validateSeamProbeReport reports the gap
  }

  const gitlinkOut = await gitInRoot('ls-tree', 'HEAD', 'runtime/vivari');
  const gitlinkSha = (/^160000 commit (\S+)/.exec(gitlinkOut))?.[1] ?? null;

  // A gitlink move staged in the index never reaches `ls-tree HEAD`, so the
  // pre-commit window would otherwise slip past the pin. Measure the index too
  // and fail closed on any staged move (mutation-test finding M1).
  const indexGitlinkOut = await gitInRoot('ls-files', '-s', 'runtime/vivari');
  const indexGitlinkSha = (/^160000 (\S+) 0\truntime\/vivari/.exec(indexGitlinkOut))?.[1] ?? null;

  const submoduleStatus = (await git('status', '--porcelain')).trim();
  const submoduleClean = submoduleStatus.length === 0;

  // Measure lineage against the OWNED fork pin (not a mutable ref) so the
  // migration-vs-upgrade decision is always derived from real git topology.
  let candidateAncestorOfOwned = false;
  try {
    await git('merge-base', '--is-ancestor', LEDGER_CANDIDATE_SHA, OWNED_FORK_GITLINK);
    candidateAncestorOfOwned = true;
  } catch {
    candidateAncestorOfOwned = false;
  }

  return {
    candidateSha,
    gitlinkSha,
    indexGitlinkSha,
    submoduleClean,
    lineage: { candidateAncestorOfOwned },
    sources: {},
  };
}

export async function loadCandidateSources(candidateSha, manifest) {
  const paths = new Set();
  for (const row of manifest.seam) {
    for (const item of row.evidence ?? []) {
      if (item.path) paths.add(item.path);
    }
  }
  const sources = {};
  for (const candidatePath of paths) {
    sources[candidatePath] = await git('show', `${candidateSha}:${candidatePath}`);
  }
  return sources;
}

export function validateSeamProbeReport(report, manifest) {
  if (!report || report.candidateSha == null) {
    throw new Error('the seam probe failed to resolve the pinned candidate SHA; refusing to evaluate the manifest');
  }
  if (report.candidateSha !== LEDGER_CANDIDATE_SHA || manifest.migration.candidate.sha !== LEDGER_CANDIDATE_SHA) {
    throw new Error(
      `the resolved tag ${report.candidateSha} does not match the ledger-recorded candidate ${LEDGER_CANDIDATE_SHA}; the v1.0.0 ref must never be trusted for content`,
    );
  }
  if (report.gitlinkSha !== OWNED_FORK_GITLINK) {
    throw new Error(
      `runtime/vivari must stay pinned to the owned fork ${OWNED_FORK_GITLINK} while the seam is evaluated (found ${report.gitlinkSha})`,
    );
  }
  if (report.indexGitlinkSha !== OWNED_FORK_GITLINK) {
    throw new Error(
      `the runtime/vivari gitlink staged in the index must also stay pinned to ${OWNED_FORK_GITLINK} (found ${report.indexGitlinkSha ?? 'no gitlink'})`,
    );
  }
  if (!report.submoduleClean) {
    throw new Error('the nested runtime/vivari submodule is not clean; resolve its uncommitted state first');
  }

  // The lineage flag must be a measured boolean, and it must agree with the
  // probe's own merge-base topology. A stale or prose-derived record fails
  // closed instead of steering the migration decision.
  if (report.lineage?.candidateAncestorOfOwned !== true && report.lineage?.candidateAncestorOfOwned !== false) {
    throw new Error('the seam probe must record lineage (candidateAncestorOfOwned); refusing to evaluate the manifest without measured git topology');
  }
  const declaredUnrelated = manifest.migration?.ownedFork?.unrelatedHistoryToCandidate;
  if (typeof declaredUnrelated !== 'boolean') {
    throw new Error('unrelatedHistoryToCandidate must be a boolean measured against the resolved candidate, not prose');
  }
  if (report.lineage.candidateAncestorOfOwned === declaredUnrelated) {
    throw new Error(
      `the manifest's unrelatedHistoryToCandidate=${declaredUnrelated} contradicts the probed lineage (candidateAncestorOfOwned=${report.lineage.candidateAncestorOfOwned}); fix the record to match measured git topology`,
    );
  }

  // Prose lineage records caused the original shallow-artifact confusion, so a
  // quoted "N commits" distance must agree with the measured counts or the
  // record is rejected outright.
  const quotedDistances = [
    ...JSON.stringify(manifest.migration ?? {}).matchAll(/(\d+)\s+commits?/g),
  ].map((match) => Number(match[1]));
  const allowed = new Set(Object.values(MEASURED_COMMIT_DISTANCES));
  const bogus = quotedDistances.filter((count) => !allowed.has(count));
  if (bogus.length > 0) {
    throw new Error(
      `the migration record quotes commit distance(s) ${bogus.join(', ')} that contradict the measured counts ` +
        `(tag behind master ${MEASURED_COMMIT_DISTANCES.tagBehindMaster}, owned behind tag ${MEASURED_COMMIT_DISTANCES.ownedBehindTag}, ` +
        `owned ahead of master ${MEASURED_COMMIT_DISTANCES.ownedAheadOfMaster}); correct the prose or re-measure before recording`,
    );
  }

  if (!Array.isArray(manifest.seam) || manifest.seam.length === 0) {
    throw new Error('the seam manifest must list at least one seam row');
  }

  // The capability note must be the exact canonical blocked statement; any
  // drift (weaker wording, promotion phrasing) is a failure.
  const CANONICAL_CAPABILITY_NOTE =
    'This manifest records the static migration seam only. It does not claim BOLT-WC-005 or BOLT-WC-006 compatibility; both remain blocked pending real Chrome E2E proof.';
  if ((manifest.capabilityNote ?? '') !== CANONICAL_CAPABILITY_NOTE) {
    throw new Error('the seam manifest capabilityNote must exactly state that BOLT-WC-005 and BOLT-WC-006 remain blocked');
  }
  // Promotion guard over everything else: no other field, note, or row may
  // claim BOLT-WC-005/006 success — only real Chrome E2E can.
  const manifestText = JSON.stringify(manifest);
  if (promotionPattern.test(manifestText.replace(CANONICAL_CAPABILITY_NOTE, ''))) {
    throw new Error('the seam manifest must not promote BOLT-WC-005 or BOLT-WC-006; real Chrome E2E proof is required first');
  }

  for (const row of manifest.seam) {
    if (!['supported', 'absent', 'shape-divergent'].includes(row.status)) {
      throw new Error(`seam row ${row.member} has an unknown status ${row.status}`);
    }
    if (!Array.isArray(row.evidence) || row.evidence.length === 0) {
      throw new Error(`seam row ${row.member} lacks evidence`);
    }
    const containsItems = row.evidence.filter((item) => item.contains != null);
    const absentItems = row.evidence.filter((item) => item.absent != null);
    if (row.status === 'supported') {
      if (absentItems.length > 0) {
        throw new Error(`static evidence cannot support a supported status for ${row.member}: absence evidence ${JSON.stringify(absentItems[0].absent)} contradicts it`);
      }
      if (containsItems.length === 0) {
        throw new Error(`a supported status for ${row.member} requires positive contains evidence`);
      }
    }
    if (row.status === 'absent' && absentItems.length === 0) {
      throw new Error(`an absent status for ${row.member} requires absence evidence`);
    }
    if (row.status === 'shape-divergent' && containsItems.length === 0) {
      throw new Error(`a shape-divergent status for ${row.member} requires positive contains evidence`);
    }
    for (const item of row.evidence) {
      if (!item.path || !item.path.startsWith('packages/core/src/')) {
        throw new Error(`seam row ${row.member} lacks a pinned evidence path under packages/core/src/`);
      }
      const content = report.sources[item.path];
      if (typeof content !== 'string') {
        throw new Error(`the seam probe has no source for ${item.path}; refusing to evaluate ${row.member}`);
      }
      if (item.contains != null && !content.includes(item.contains)) {
        if (row.status === 'supported') {
          throw new Error(`static evidence cannot support a supported status for ${row.member}: ${item.contains} is missing from the pinned candidate`);
        }
        throw new Error(`the pinned candidate does not contain ${JSON.stringify(item.contains)} required as evidence for ${row.member}`);
      }
      if (item.absent != null && content.includes(item.absent)) {
        throw new Error(`${JSON.stringify(item.absent)} exists in the pinned candidate, so ${row.member} cannot claim absence`);
      }
    }
  }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const manifest = JSON.parse(
    await readFile(new URL('../packages/vivari-adapter/upstream-vivari-1.0-seam.json', import.meta.url), 'utf8'),
  );
  const report = await probeSeam();
  report.sources = await loadCandidateSources(report.candidateSha, manifest);
  validateSeamProbeReport(report, manifest);
  console.log(`Vivari 1.0.0 seam manifest OK (candidate ${report.candidateSha.slice(0, 12)}, owned gitlink ${report.gitlinkSha.slice(0, 12)}; evaluated, not adopted)`);
}
