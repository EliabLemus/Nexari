import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(root, 'runtime', 'vivari');

export const CANDIDATE_SHA = '2629c71097238400c45aefa213ef61df4794c2b7';
export const OWNED_FORK_SHA = '26f1d6222942a09411292ea6e55053f3729436ca';

export function classifyLineage({ candidateAncestorOfOwned, ownedAncestorOfCandidate }) {
  if (candidateAncestorOfOwned && ownedAncestorOfCandidate) {
    throw new Error('contradictory ancestry: distinct candidate and owned commits cannot each be ancestors');
  }
  if (candidateAncestorOfOwned) {
    return { direction: 'candidate-ancestor', disposition: 'downgrade' };
  }
  if (ownedAncestorOfCandidate) {
    return { direction: 'candidate-descendant', disposition: 'upgrade' };
  }
  return { direction: 'unrelated', disposition: 'migration' };
}

async function git(...args) {
  return execFileAsync('git', ['-C', runtimeDir, ...args], { encoding: 'utf8' });
}

async function isAncestor(ancestor, descendant) {
  try {
    await git('merge-base', '--is-ancestor', ancestor, descendant);
    return true;
  } catch (error) {
    if (error.code === 1) return false;
    throw error;
  }
}

export async function probeCandidateAncestry() {
  const { stdout } = await git('rev-parse', 'v1.0.0^{commit}');
  const resolvedCandidateSha = stdout.trim();
  if (resolvedCandidateSha !== CANDIDATE_SHA) {
    throw new Error(`v1.0.0 resolved to ${resolvedCandidateSha}, expected pinned candidate ${CANDIDATE_SHA}`);
  }
  const [candidateAncestorOfOwned, ownedAncestorOfCandidate] = await Promise.all([
    isAncestor(CANDIDATE_SHA, OWNED_FORK_SHA),
    isAncestor(OWNED_FORK_SHA, CANDIDATE_SHA),
  ]);
  return {
    resolvedCandidateSha,
    candidateAncestorOfOwned,
    ownedAncestorOfCandidate,
    ...classifyLineage({ candidateAncestorOfOwned, ownedAncestorOfCandidate }),
  };
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const result = await probeCandidateAncestry();
  if (result.direction !== 'candidate-ancestor') {
    throw new Error(`expected published v1.0.0 to be an owned-fork ancestor; measured ${result.direction}`);
  }
  console.log(`Vivari v1.0.0 candidate ${result.resolvedCandidateSha} is an ancestor of owned fork ${OWNED_FORK_SHA}; adoption disposition: ${result.disposition}`);
}
