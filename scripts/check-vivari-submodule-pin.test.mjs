import assert from 'node:assert/strict';
import test from 'node:test';
import { PINNED_VIVARI_SHA, validatePinnedVivariSubmodule } from './check-vivari-submodule-pin.mjs';

const expectedGitlink = `160000 commit ${PINNED_VIVARI_SHA}\truntime/vivari`;

test('accepts only the literal owned Vivari gitlink and checkout SHA', () => {
  assert.doesNotThrow(() => validatePinnedVivariSubmodule({
    gitlink: `${expectedGitlink}\n`,
    submoduleHead: `${PINNED_VIVARI_SHA}\n`,
  }));
});

test('rejects a silently repinned Vivari gitlink', () => {
  assert.throws(
    () => validatePinnedVivariSubmodule({
      gitlink: `160000 commit ${'0'.repeat(40)}\truntime/vivari`,
      submoduleHead: PINNED_VIVARI_SHA,
    }),
    /gitlink must remain/,
  );
});

test('rejects a checkout that differs from the committed gitlink', () => {
  assert.throws(
    () => validatePinnedVivariSubmodule({
      gitlink: expectedGitlink,
      submoduleHead: '0'.repeat(40),
    }),
    /HEAD must remain/,
  );
});
