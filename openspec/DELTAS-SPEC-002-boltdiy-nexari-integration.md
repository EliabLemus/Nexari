# DELTAS — SPEC-002 Bolt.DIY → Nexari Runtime Integration

**Status:** In progress. Reversible Nexari-side contract and adapter work is authorized; no Bolt checkout integration, remote publication, deployment, or runtime pin change is authorized.

## Environment prepared

- **Nexari integration worktree:** `/Users/openjaime/Projects/nexari-boltdiy-integration`
  - branch: `nexari/boltdiy-integration-spec-20260920`
  - current verified terminal-seam commit: `1f1684c9e432d3e790354ef5cf5a18797fe24146`
- **Read-only Bolt.DIY reference:** `/Users/openjaime/Projects/bolt.diy-nexari-reference`
  - pinned upstream commit: `2e254ac19a696394030601bc602f54945b12bfc4`
- **Read-only pinned Vivari recovery reference:** `/Users/openjaime/Projects/nexari-vivari-pinned-reference`
  - preserves Nexari's locally available submodule commit `210d50d3f314b1fc6b148776ee24c2d48d8d022d`.
- **Pinned source provenance:** `runtime/vivari` now resolves through the owner-controlled private mirror `EliabLemus/nexari-vivari-provenance-20260922`. The exact gitlink remains the reviewed SHA; credentialed CI must be granted read access to this private repository.
- No Bolt application files, runtime implementation files, environment files, credentials, remotes, or deployments have been changed.

## Delta 000 — Restore reproducible pinned Vivari source

**Status:** Complete — the public origin remains historically unavailable, but the reviewed pin is preserved in an owner-controlled private mirror and independently retrievable by credentialed clean repositories.

**Objective:** Make the exact runtime source checked out by Nexari reproducible on a clean machine and CI.

**Files:**
- Modify only after approval: `.gitmodules`, `runtime/vivari` gitlink, provenance ledger/tests, and CI checkout configuration as required.
- Do not modify semantic runtime source as part of this delta.

**Clean-source retrieval failure (2026-09-21T10:55:04Z):** an ephemeral empty repository at `/private/tmp/nexari-vivari-pin-probe.*`, with `origin` set to `https://github.com/maitrungduc1410/vivari.git`, ran `GIT_TERMINAL_PROMPT=0 git -C <empty> fetch --no-tags origin 210d50d3f314b1fc6b148776ee24c2d48d8d022d`. It exited `128` with `fatal: remote error: upload-pack: not our ref 210d50d3f314b1fc6b148776ee24c2d48d8d022d`. The temporary repository was deleted; the integration worktree was not mutated. This is a direct clean-repository fetch observation, not a full clone result and not a claim that the pin is permanently unavailable. It supersedes the earlier local-checkout fetch as evidence of clean retrieval: a local checkout can retain the object even while the public origin refuses to serve it anew.

**Durable CI/release condition:** credentialed CI must be granted read access to the owner-controlled immutable mirror. Do not replace the pin with a current public upstream tip merely to unblock checkout. The pin-retrieval decision is resolved; Bolt-facing work remains a separately scoped integration decision.

**Historical mirror failure (preserved):** GitHub REST creation returned `EliabLemus/nexari-vivari-provenance-20260922` on 2026-09-22, but an earlier authenticated Git publication attempt failed with `403 Write access to repository not granted`. It was not evidence of retrievability.

**Mirror adoption proof (2026-09-22T22:15:49-0600):** after owner authorization, the exact object was published as `refs/heads/provenance/pinned-210d50d3f314` in `https://github.com/EliabLemus/nexari-vivari-provenance-20260922.git`. An ephemeral empty repository, using this machine's authorized Git credentials, fetched that ref and resolved `FETCH_HEAD` to `210d50d3f314b1fc6b148776ee24c2d48d8d022d`; `git fsck --no-dangling --no-progress` passed. `.gitmodules` now uses this mirror with no branch-tracking key, so the committed gitlink is authoritative. Private CI must use a credential with read access to this mirror.

**Verification:**
```text
npm run check:vivari-submodule-pin  # owner-controlled mirror plus committed gitlink/checkout remain exact
rm -rf <fresh-clone>
git clone --recurse-submodules <Nexari fork> <fresh-clone>
git -C <fresh-clone>/runtime/vivari rev-parse HEAD  # exact approved SHA
git -C <fresh-clone> status --short                 # clean
npm ci && npm run build:vivari && npm run build
```

**Acceptance:** a credentialed fresh clone obtains the reviewed SHA without local object sharing, and the provenance guard identifies the exact source/mirror without tracking a mutable branch.

## Delta 001 — Freeze the observed Bolt runtime seam

**Status:** Nexari-side seam inventory and owned contract are complete. Bolt application call-site migration remains a separately scoped Bolt integration task; it is no longer blocked by pinned-source reproducibility.

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

**Status:** Complete on the Nexari side. The JSH/OSC spike and replacement adapter are both committed; they do not integrate into the Bolt checkout.

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

**Spike outcome (2026-09-22, kernel-level, pinned submodule `210d50d`):** Nexari's clean-room `sh` does **not** emit OSC 654, and the interactive REPL never surfaces exit codes (`drain()` discards `runLine`'s status; no `$?` expansion). `scripts/check-bolt-terminal-contract.test.mjs` pins the replacement protocol (six tests, wired into `npm test`): readiness is the one-time banner `Vivari shell — type commands, Enter to run.\n` plus structural ANSI prompt draws; command completion is echoed output followed by a later prompt redraw; exit codes use a separate `sh -c` exec lane; Ctrl+C restores the prompt and the REPL remains answerable; stale `sendStdin` is inert. Every test asserts the stream contains no `\x1b]654;` sequence.

The executable adapter is committed in `1f1684c` as `packages/vivari-adapter/src/terminal-seam.ts`. It creates an option-less interactive `sh` REPL exposing raw guest output and a distinct `sh -c` execution lane that returns split stdout/stderr plus the numeric exit code, forwarding only explicit `cwd`, `env`, and `signal`. Its focused adapter tests cover stale/idempotent REPL teardown, rejected exit/stdin, split output/non-zero exit, explicit option forwarding, stream failure propagation, and pre-aborted exec requests. The final Challenger review returned `PASS`; its only observations were non-blocking optional hardening for stream-failure cleanup and pre-existing script wiring scope. Facade design consequence: Bolt's `BoltShell` must be replaced behind the facade (prompt-gated interactive lane + `sh -c` exit-capture lane), not emulated with OSC.

## Delta 003 — Backend selector and facade

**Status:** Implemented on the Bolt integration fork (local branch `nexari/runtime-facade-slice-001`, HEAD `247ff4f`, 2026-09-25) — final guest injection and any runtime cutover remain owner-gated. Delta 001 and Delta 002 were complete on the Nexari side; the Bolt-side selector/facade slice is code-complete with deterministic gates green, and all 17 Bolt compatibility rows (BOLT-WC-001…017) are browser-proven in `compatibility/bolt-compatibility-matrix.md`.

**Adapter update (2026-09-24, cast-free composition):** The earlier "structural match" claim held only component-wise. A strict-tsc probe proved the adapter's `createVivariRuntime` was NOT assignable to the Bolt fork's injected factory parameter: the fork's `VivariSdkLike.boot` deliberately returns `Promise<unknown>`, and through contravariance the adapter's narrower `loadSdk` demand broke factory-level assignment. Fix (adapter-side, no Bolt changes): `VivariAdapterOptions.loadSdk` now accepts `() => Promise<VivariSdkLike>` where `VivariSdkLike.boot` returns `Promise<unknown>`; the adapter validates the booted guest's structural contract (fs.readFile/writeFile/readdir/mkdir/rm, spawn, teardown — all functions) at the single boot trust boundary and fails typed `BOOT_FAILED` on malformed guests. A strict-tsc probe (TypeScript 5.8.3 via the fork toolchain) proves `createVivariGuestFactory({ loadSdk: loadPinnedVivariSdk, createVivariRuntime })` composes cast-free. Adapter gates: typecheck green, focused shape-validation tests 7/7, suite 108/108. The final Bolt-side injection and linking of `@nexari/vivari-adapter` remain owner decisions.

**Independent cross-verification (2026-09-24, Bolt-fork-side probe):** The cast-free composition claim was re-probed from the opposite direction by the integration harness: a temporary strict-tsc probe inside the Bolt fork itself (fork `tsconfig.json`: strict, Bundler resolution, TypeScript 5.8.3) composed the fork's own `createVivariGuestFactory` with the adapter's `dist` exports passed directly — `createVivariGuestFactory({ id, loadSdk: loadPinnedVivariSdk, createVivariRuntime })` — and typechecked with zero assertions (tsc exit 0). Because the real `createVivariRuntime` return flowed through the fork's factory parameter, this also structurally proves the adapter's `BrowserRuntime` satisfies the fork's `VivariGuestRuntimeLike` (fs read/write/readdir/mkdir/rm, spawn, teardown) at factory level. Adapter gates re-verified independently on `516f5be`: `typecheck:vivari-adapter` exit 0, `test:vivari-adapter` exit 0 (0 fail). Owner decisions unchanged: Bolt-side injection, adapter linking, preview strategy.

**ActionShell slice on the Bolt fork (2026-09-25, HEAD `d7ef3b9`, 14 commits over `origin/main`):** the fork routed shell/start actions through a runtime-agnostic `ActionShell` seam (`app/lib/runtime/action-shell.ts`): the StackBlitz lane preserves BoltShell's historical `ExecutionResult`/preemption-callback semantics exactly, while the Nexari lane (`nexari-action-shell.ts`) adapts its `sh -c` execution onto the same contract with caller cancellation on a separate fourth `signal` argument. Slice-scope invariants held: no `@webcontainer/api` import on the nexari path (repo-wide import guard test), StackBlitz control path unchanged, no preview/terminal/cutover work. Challenger final review returned `PASS` (239 s, 8/8 calls, 5/5 ACs covered with file:line evidence); of its two LOW findings, one was accepted with documented rationale (post-ready rejection preferred over the legacy silent undefined path) and one was fixed (terminated-state now throws the typed terminated marker, pinned by a new test). Judge gates re-verified in-situ at `d7ef3b9` on 2026-09-25: full suite 149/149, `tsc` exit 0, lint exit 0, production build exit 0, `git diff --check` clean, `git status --short` clean. This slice completes the authorized Bolt-side adapter scope (boot, fs basics, action execution); all remaining Bolt-side steps are owner-gated decisions.

**Backend-aware ActionShell selection (2026-09-25, HEAD `247ff4f`, 15 commits over `origin/main`):** the workbench action pipeline now selects the `ActionShell` implementation by runtime backend (`app/lib/runtime/action-shell-selector.ts`). The StackBlitz branch returns the historical BoltShell adapter without ever touching the runtime promise — a tracking-thenable test pins zero attached handlers, closing the new-unhandled-rejection vector. The `nexari` branch resolves the app runtime promise per guard call (idempotent; two resolutions per action are expected and safe), verifies the resolved value structurally as the `NexariBrowserRuntime` facade (`runActionCommand`/`teardown`/`boot` functions plus a string `state`; WebContainer-shaped or malformed values fail typed `NexariActionShellSelectionError`), propagates rejections by identity (e.g. `NexariBootNotConfiguredError`), and delegates to the facade adapter — a poisoned-BoltShell test proves BoltShell is never touched on that path. Selection source of truth is the module-scope `runtimeBackend` const, now exported from `app/lib/webcontainer/index.ts`; the HMR cache tag `webcontainerContext.backend` is explicitly never used (undefined until boot). Challenger: pre-mortem `READY` (9 risks: rejected-promise propagation, stackblitz-branch promise hygiene, poisoned-terminal pinning, structural-predicate discrimination, source-of-truth staleness — all incorporated), final review `PASS` (5/5 ACs, 0 findings). Judge gates at `247ff4f`: full suite 159/159, `tsc` exit 0, lint exit 0, production build exit 0, `git diff --check` clean, `git status` = exactly the 4 slice files. Scope: selection wiring only — the nexari path still cannot boot (guest injection + `@nexari/vivari-adapter` linking remain owner decisions); StackBlitz stays the default backend with unchanged behavior.

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

The owner has authorized reversible Nexari-side contract, adapter, and test work. No Bolt application source changes begin without a separately explicit Bolt integration authorization and the required integration/preview-hosting decisions. Do not jump to preview UI work before that scope exists.
