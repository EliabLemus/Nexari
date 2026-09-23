# DELTAS — SPEC-002 Bolt.DIY → Nexari Runtime Integration

**Status:** Prepared. All code deltas are blocked pending owner go-ahead.

## Environment prepared

- **Nexari integration worktree:** `/Users/openjaime/Projects/nexari-boltdiy-integration`
  - branch: `nexari/boltdiy-integration-spec-20260920`
  - base: `0e1c8d0`
- **Read-only Bolt.DIY reference:** `/Users/openjaime/Projects/bolt.diy-nexari-reference`
  - pinned upstream commit: `2e254ac19a696394030601bc602f54945b12bfc4`
- **Read-only pinned Vivari recovery reference:** `/Users/openjaime/Projects/nexari-vivari-pinned-reference`
  - preserves Nexari's locally available submodule commit `210d50d3f314b1fc6b148776ee24c2d48d8d022d`.
- **P0 environment blocker:** a clean `git submodule update --init --recursive` cannot obtain that SHA from the public upstream configured in `.gitmodules`. The integration worktree must not build against its accidentally fetched substitute checkout.
- No Bolt application files, runtime implementation files, environment files, credentials, remotes, or deployments have been changed.

## Delta 000 — Restore reproducible pinned Vivari source

**Status:** Blocked — the public origin does not currently serve the exact pin to a clean repository; durable supply-chain ownership requires an owner decision

**Objective:** Make the exact runtime source checked out by Nexari reproducible on a clean machine and CI.

**Files:**
- Modify only after approval: `.gitmodules`, `runtime/vivari` gitlink, provenance ledger/tests, and CI checkout configuration as required.
- Do not modify semantic runtime source as part of this delta.

**Clean-source retrieval failure (2026-09-21T10:55:04Z):** an ephemeral empty repository at `/private/tmp/nexari-vivari-pin-probe.*`, with `origin` set to `https://github.com/maitrungduc1410/vivari.git`, ran `GIT_TERMINAL_PROMPT=0 git -C <empty> fetch --no-tags origin 210d50d3f314b1fc6b148776ee24c2d48d8d022d`. It exited `128` with `fatal: remote error: upload-pack: not our ref 210d50d3f314b1fc6b148776ee24c2d48d8d022d`. The temporary repository was deleted; the integration worktree was not mutated. This is a direct clean-repository fetch observation, not a full clone result and not a claim that the pin is permanently unavailable. It supersedes the earlier local-checkout fetch as evidence of clean retrieval: a local checkout can retain the object even while the public origin refuses to serve it anew.

**Required decision for durable CI/release:** provide an owner-controlled immutable mirror or private fork containing `210d50d3f314b1fc6b148776ee24c2d48d8d022d`. Do not replace the pin with a current public upstream tip merely to unblock checkout. Bolt-facing code remains blocked pending that durability decision; the current observation permits only reversible local source/test work.

**Current mirror candidate (not yet adopted):** GitHub REST creation returned `EliabLemus/nexari-vivari-provenance-20260922` on 2026-09-22, but the subsequent authenticated Git publication attempt failed with `403 Write access to repository not granted`. This is not mirror evidence. Do not change `.gitmodules` or the provenance ledger to this URL until the exact pin has passed an empty-repository fetch from it.

**Verification:**
```text
npm run check:vivari-submodule-pin  # committed gitlink and checkout remain the exact pin
rm -rf <fresh-clone>
git clone --recurse-submodules <Nexari fork> <fresh-clone>
git -C <fresh-clone>/runtime/vivari rev-parse HEAD  # exact approved SHA
git -C <fresh-clone> status --short                 # clean
npm ci && npm run build:vivari && npm run build
```

**Acceptance:** a fresh clone obtains the reviewed SHA without local object sharing, and the provenance guard identifies the exact source/mirror.

## Delta 001 — Freeze the observed Bolt runtime seam

**Status:** Ready to start after approval

**Objective:** Turn actual Bolt call sites into a narrow, explicit compatibility interface and prove the baseline before swapping any backend.

**Files:**
- Create: `app/lib/runtime/browser-runtime.ts`
- Create: `app/lib/runtime/browser-runtime.spec.ts`
- Modify: `app/lib/webcontainer/index.ts`
- Modify: imports in `app/lib/runtime/action-runner.ts`, `app/lib/stores/files.ts`, `app/lib/stores/previews.ts`, `app/lib/hooks/useGit.ts`, `app/utils/shell.ts`, deployment clients, and search UI only as compiler identifies them.

**TDD steps:**
1. Write a failing type/behavior test describing the minimal facade methods and events.
2. Run `pnpm test -- browser-runtime` and confirm the missing interface failure.
3. Extract only structural types; keep `stackblitz` behavior unchanged.
4. Run `pnpm test`, `pnpm run typecheck`, and manually boot the existing runtime.

**Acceptance:** Existing WebContainer backend keeps passing unchanged; the compiler produces one owned interface inventory rather than multiple imports of `@webcontainer/api`.

## Delta 002 — P0 terminal feasibility spike

**Status:** Spike complete; contract tests green (6/6). Delta 001 remains the prerequisite for facade implementation.

**Objective:** Resolve the difference between Bolt's `/bin/jsh --osc` protocol and Nexari's proven interactive `sh` before any broad refactor.

**Files:**
- Create: `app/lib/runtime/nexari-terminal-spike.spec.ts`
- Create or modify: `app/lib/runtime/nexari-runtime-facade.ts`
- Modify only after a green spike: `app/utils/shell.ts`

**TDD steps:**
1. Capture the essential Bolt terminal contract: ready signal, input, streamed output, command completion, cancellation, dimensions, resize.
2. Run it against the existing Bolt backend as a control.
3. Run it against a small Nexari facade prototype.
4. If JSH/OSC cannot be proven, write failing tests for the replacement protocol and update `BoltShell` to use the facade's supported semantics; do not emulate undocumented APIs.

**Acceptance:** The test does not rely on an OSC sequence unless Nexari demonstrably emits it. Commands report exit code/output and a stale/aborted command cannot revive the UI.

**Spike outcome (2026-09-22, kernel-level, pinned submodule 210d50d):** Nexari's clean-room `sh` does **not** emit OSC 654, and the interactive REPL never surfaces exit codes (`drain()` discards `runLine`'s status; no `$?` expansion). The replacement contract is now pinned by `scripts/check-bolt-terminal-contract.test.mjs` (wired into `npm test`; 6 tests, green): readiness gates on the one-time banner `Vivari shell — type commands, Enter to run.\n` plus structural ANSI prompt draws (no byte-exact prompt pin); the command lane is echoed output followed by a later prompt redraw (the `waitTillOscCode('prompt')` replacement); exit codes ride the separate `sh -c` exec lane via `kernel.start` (success leg pinned here; exit-3 and typed-127 legs remain pinned by `scripts/check-runtime-shell-coreutils.test.mjs`); Ctrl+C SIGINTs the foreground child, restores the prompt, and the REPL stays answerable — with the numeric child exit code deliberately unasserted because the REPL cannot surface it; stale `sendStdin` to a stopped/unknown pid returns `false` and revives nothing. Every test also asserts the stream contains no `\x1b]654;` sequence, making "no OSC dependency" falsifiable. Challenger pre-mortem verdict: `REVISE_CONTRACT`; all five risk clusters (banner-over-prompt gate, two-lane cwd/env divergence, honest AC-4 observables, uncaptured stdin lane with `finally` teardown, duplicate/negative-case trimming) were accepted and are reflected in the test file. Facade design consequence: Bolt's `BoltShell` must be replaced behind the facade (prompt-gated interactive lane + `sh -c` exit-capture lane), not emulated with OSC.

## Delta 003 — Backend selector and facade

**Status:** Blocked by Delta 001 and Delta 002

**Objective:** Add an explicit `nexari` development backend behind a default-preserving selector.

**Files:**
- Create: `app/lib/runtime/nexari-runtime-facade.ts`
- Create: `app/lib/runtime/nexari-runtime-facade.spec.ts`
- Modify: `app/lib/webcontainer/index.ts`
- Modify: `package.json` and lockfile only if an approved, pinned Nexari package dependency is selected.
- Modify: `.env.example` only; never commit `.env` or `.env.local`.

**Design constraints:**
- Validate `NEXARI_PREVIEW_ORIGIN` before boot.
- Map `cols` → `columns` at the facade edge.
- Adapt supported filesystem watch events; never call an `internal` runtime API.
- Map `preview-error` to the existing Bolt alert payload locally.
- Preserve hot-module replacement state without retaining a terminated runtime.

**Acceptance:** `stackblitz` remains the default; `nexari` boots only on isolated pages, contains no import of `@webcontainer/api`, and reports typed errors visibly.

## Delta 004 — Preview routing and diagnostics

**Status:** Blocked by Delta 003 and owner decision on preview domain

**Objective:** Replace hard-coded `*.local-credentialless.webcontainer-api.io` parsing with backend-agnostic preview metadata.

**Files:**
- Modify: `app/routes/webcontainer.preview.$id.tsx`
- Modify: `app/components/workbench/Preview.tsx`
- Modify: `app/lib/stores/previews.ts`
- Create: focused unit tests for preview URL construction and popup/reload behavior.

**TDD steps:**
1. Add tests that reproduce current StackBlitz URL behavior.
2. Add a failing Nexari URL case from a configured self-hosted origin.
3. Move preview state to `{ url, runtimeId?, port }` rather than parsing an SDK-specific host name.
4. Attach the actual iframe to Nexari and relay only authenticated diagnostics.

**Acceptance:** in-frame preview, reload, open-in-new-tab/window, port switching, and same-origin error alert succeed in Chrome. A malicious cross-origin frame cannot produce an alert.

## Delta 005 — Git/export/deploy flow validation

**Status:** Blocked by Delta 003

**Objective:** Demonstrate that Bolt's real project workflows survive the adapter boundary.

**Files:**
- Create: `e2e/nexari-boltdiy.e2e.ts` (or the established Bolt E2E location after repo inspection)
- Create: a minimal fixture project, no networked package install required except explicitly controlled fixture needs.
- Modify: `app/lib/hooks/useGit.ts`, deployment clients only if test evidence identifies an actual facade mismatch.

**Test flow:**
1. Boot on a COOP/COEP page.
2. Mount/write text and binary files.
3. Start an approved fixture server and observe port/server-ready.
4. Run a command, then cancel/restart it.
5. Load preview, raise a same-origin diagnostic, and verify the Bolt alert.
6. Clone/export a small public fixture and compare bytes.
7. Teardown; assert late events and stale preview messages are inert.
8. Repeat boot without isolation; assert typed pre-boot failure.

**Acceptance:** all steps pass in a fresh Chrome profile; temporary processes/profiles are cleaned up.

## Delta 006 — Documentation and release gate

**Status:** Blocked by Deltas 003–005

**Objective:** Make the integration operable without over-claiming production readiness.

**Files:**
- Modify: Bolt fork README/docs with exact self-hosted headers, preview-origin configuration, known limits, and local test command.
- Modify: Nexari compatibility matrix only after concrete browser evidence exists.
- Create: integration runbook with rollback selector back to `stackblitz`.

**Acceptance:** a clean machine/environment can reproduce development setup without secrets in Git; all commands pass; no external deployment or push occurs without separate owner authorization.

## Judge commands after each non-trivial code delta

```text
# Bolt.DIY pinned reference/fork
pnpm test
pnpm run typecheck
pnpm run build

# Nexari
npm run build
npm run test:browser-lab

git diff --check
git status --short
```

## Explicit stop condition

No application source changes begin until the owner gives a direct start signal. The next action after approval is **Delta 001, then Delta 002**; do not jump to preview UI work before the terminal spike passes.
