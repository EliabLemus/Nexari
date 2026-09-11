import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyLineage } from './check-upstream-vivari-1.0-ancestry.mjs';

test('classifies the published v1.0.0 candidate as an ancestor downgrade, never an unrelated migration', () => {
  assert.deepEqual(
    classifyLineage({ candidateAncestorOfOwned: true, ownedAncestorOfCandidate: false }),
    { direction: 'candidate-ancestor', disposition: 'downgrade' },
  );
});

test('rejects contradictory measured ancestry instead of inventing a migration disposition', () => {
  assert.throws(
    () => classifyLineage({ candidateAncestorOfOwned: true, ownedAncestorOfCandidate: true }),
    /contradictory ancestry/,
  );
});
