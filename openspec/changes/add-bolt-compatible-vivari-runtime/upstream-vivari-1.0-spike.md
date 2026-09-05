# Vivari 1.0.0 upstream-update feasibility contract

**Task:** `NEXARI-UPSTREAM-001`
**Driver:** OpenAI Codex / `gpt-5.6-sol`
**Challenger:** Z.AI / `glm-5.3` (read-only pre-mortem and final review; locked assignment)
**Judge:** deterministic local commands
**Base:** Nexari `5d3db6d79803b462b688588d65cbaadde2f66b2a`; owned runtime `26f1d6222942a09411292ea6e55053f3729436ca`

## Decision boundary

The public npm metadata for `@vivari/core@1.0.0` identifies MIT source tag
`2629c71097238400c45aefa213ef61df4794c2b7`. The tag was fetched from the public
upstream on 2026-09-04T19:20:19Z and its `LICENSE` checksum is recorded in
`THIRD_PARTY_NOTICES.md`.

**Topology correction (2026-09-05):** the original "unrelated histories" conclusion
below was an artifact of a stale `.git/shallow` boundary at `9a89ff3` in the nested
`runtime/vivari` clone: parse-level commands (`merge-base`, `rev-list`) grafted the
boundary commit into a fake root while raw object bytes retained the true parent
`f390cde`. After restoring the missing ancestor objects and removing the stale
boundary, both clones agree on complete history:

```text
git merge-base 2629c710 26f1d622  ->  2629c710 (the tag itself)
is-ancestor 2629c710 26f1d622     ->  true (strict ancestor)
owned..candidate                  ->  0 commits
candidate..owned                  ->  101 commits (v1.0.0-101-g26f1d62)
owned -> candidate diff           ->  473 files, +3,978/-149,751
```

`@vivari/core@1.0.0` is a **strict ancestor** of the owned fork: upstream master
`9a89ff3` descends from the tag, and the owned runtime is upstream master plus two
local commits (1 file, +10/-2). Adopting the published 1.0.0 would be a reverse
migration that discards 325 commits of upstream progress plus the local fixes. The
decision boundary below is retained as a historical record; the seam guard now
measures lineage itself (`merge-base --is-ancestor`) and fails closed on any
manifest that contradicts the measured topology.

~~This is **not** an incremental update: neither candidate nor current owned
runtime is an ancestor of the other. A direct comparison from current owned
runtime to the tag changes 129 runtime/core files (1,894 insertions and 58,708
deletions), including the process/kernel surface and removal of terminal-related
implementation.~~ (Superseded by the correction above; the 129-file figure was
computed against the corrupted graph.)

## Objective

Decide whether a later isolated migration may be attempted without weakening the
two remaining capability gates, BOLT-WC-005 and BOLT-WC-006.

## Non-goals

- No Bolt.DIY code, StackBlitz runtime artifacts, deployment, publication,
  credentials, remote push, tag, or release.
- No in-place reset of `runtime/vivari`, package-manager workaround, or adapter
  compatibility claim based on the package version, README, or static API.
- No matrix status change without the named real Chrome evidence.

## Frozen acceptance gates for a later adoption slice

1. Record public source URL, exact SHA/version, retrieval timestamp, license and
   retained-source checksum in the provenance ledger **before** changing runtime
   code. The candidate row above satisfies this only for evaluation, not adoption.
2. Start from clean `main`, fetch `origin`, and use a dedicated worktree/branch;
   never modify the existing runtime in place until all gates pass.
3. First add focused RED tests for every adapter/API difference actually touched.
   No behavior change may precede its failing focused test.
4. Produce a Chrome E2E with a new temporary `--user-data-dir`, CDP bound only
   to `127.0.0.1`, passed solely through `NEXARI_CHROME_CDP_URL`. Verify the CDP
   endpoint before use, terminate only that launched Chrome, and remove only that
   temporary profile.
5. Mark BOLT-WC-005 proven only when that browser runs actual `npm` with explicit
   arguments, `cwd`, environment, merged observable output and observed exit.
   A command-not-found error, a host npm command, or a static source assertion is
   a blocked result.
6. Mark BOLT-WC-006 proven only when the browser proves an interactive shell:
   stdin delivery, merged stdout/stderr, initial cols/rows, resize observation,
   kill and observable exit. Missing any one keeps it blocked with the exact
   typed failure/capability gap.
7. Before commit: focused RED→GREEN tests, adapter contract tests, `npm run build`,
   relevant Chrome E2E, `git diff --check`, `npm run check:scope`, secret/path
   scope check, and clean status. Then obtain a fresh read-only Challenger review
   and re-run affected Judge gates. Never push.

## Test plan

| Gate | Exact evidence | Pass condition |
|---|---|---|
| Candidate topology | `git merge-base --is-ancestor` both directions | Both results are recorded; non-linearity means migration review, not blind update. |
| Public provenance | `git show v1.0.0:LICENSE | shasum -a 256` plus registry metadata | MIT text and recorded checksum/gitHead match. |
| Adapter surface | Focused TypeScript test using the new `Vivari` exports | Existing boot/mount/spawn/fs/event/teardown contract remains explicit; any difference is adapted or rejected. |
| WC-005 browser proof | New assertion in `e2e/browser-smoke.e2e.mjs` | Guest `npm` executes with args/cwd/env and output + exit are observed. |
| WC-006 browser proof | New assertion in `e2e/browser-smoke.e2e.mjs` | Interactive guest shell proves stdin, merged output, dimensions, resize, kill and exit. |
| Regression/safety | `npm test && npm run build && git diff --check && npm run check:scope` | All pass; no out-of-scope source or external side effect. |

## Present outcome

Candidate remains **blocked from adoption**, but for the corrected reason: the
published tag is an ancestor of the owned fork, so adopting it would be a reverse
migration (downgrade) that discards 325 upstream commits and the owned local
fixes, and its static evidence is still insufficient for either remaining
capability. BOLT-WC-005 remains blocked (`npm` unavailable in the current browser
proof); BOLT-WC-006 remains blocked (interactive terminal explicitly
unsupported). The compatibility matrix is deliberately unchanged. If capability
work ever requires upstream code, the correct seam is the owned fork's own base
(`9a89ff3`), not the older npm tag.

## Challenger pre-mortem record

GLM-5.3 read-only pre-mortem: verified v1.0.0 resolves to ledger SHA
`2629c71097238400c45aefa213ef61df4794c2b7` (commit, ancestor of upstream master
`9a89ff328b87ad0fb6a180d4401ea418c180cbe7`), reproduced the candidate source
reads from the resolved SHA, and confirmed the guard fails closed on tag
mismatch, submodule move, and promotion leakage. Verdict: PASS with one low
finding — this feasibility report was untracked in the spike worktree and is now
deliberately committed on this seam branch (Challenger model line corrected to
the locked glm-5.3 assignment). Driver synthesis: accepted without exception.