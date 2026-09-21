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

**Status:** Blocked by owner decision; required before all code integration work

**Objective:** Make the exact runtime source checked out by Nexari reproducible on a clean machine and CI.

**Files:**
- Modify only after approval: `.gitmodules`, `runtime/vivari` gitlink, provenance ledger/tests, and CI checkout configuration as required.
- Do not modify semantic runtime source as part of this delta.

**Required decision:** provide an owner-controlled immutable mirror or private fork containing `210d50d3f314b1fc6b148776ee24c2d48d8d022d`. Do not replace the pin with a current public upstream tip merely to unblock checkout.

**Verification:**
```text
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

**Status:** Blocked by approval

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
