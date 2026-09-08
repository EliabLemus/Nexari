---
id: NEXARI-WC006-RESIZE-001
status: completed-terminal-capability
roles:
  driver: openai-codex/gpt-5.6-sol
  challenger: zai/glm-5.3
  judge: deterministic
base_outer: 5d3db6d79803b462b688588d65cbaadde2f66b2a
base_vivari: 26f1d6222942a09411292ea6e55053f3729436ca
---

# WC-006 terminal dimensions, resize, and SIGWINCH

## Objective

Close the sole remaining BOLT-WC-006 gap. A guest interactive process must expose real terminal dimensions, receive a scoped host resize, update its dimensions, and observe `SIGWINCH`. The outer Nexari Chrome lab must prove this with output produced by the guest itself.

## Non-goals

- Do **not** adopt or pin to upstream v1.0.0 (`2629c710`): it is an older strict ancestor of the owned fork.
- Do not alter unrelated terminal, process, package-manager, preview, or adapter behavior.
- No credentials, network access, push, tag, release, or deployment.
- Do not weaken existing WC-005/WC-006 assertions or convert a failure into a silent pass.

## Relevant files

- `e2e/run-browser-e2e.mjs` — create this disposable runner if absent: it must launch only its own temporary localhost-CDP Chrome, build the lab with the workspace-safe Vite invocation, run the existing E2E under `NEXARI_CHROME_CDP_URL`, then terminate only its Chrome and remove only its temporary profile.
- `runtime/vivari/packages/protocol/syscall.js` — source of truth for the shared-memory pending-signal ABI; must add SIGWINCH without altering existing SIGINT/SIGTERM behavior.
- `runtime/vivari/packages/runtime/signals.js` — guest signal subscription/dispatch surface built on the protocol ABI.
- `runtime/vivari/packages/runtime/builtins/process.js` — guest `process` stream TTY fields and signal/event surface.
- `runtime/vivari/packages/runtime/index.js` — runtime process construction and inbound control dispatch.
- `runtime/vivari/packages/core/src/workers/process-worker.ts` — worker bridge and pre-ready control queue.
- `runtime/vivari/packages/core/src/workers/kernel-worker.ts` — routes browser-process controls to the kernel.
- `runtime/vivari/packages/kernel-host/kernel.js` — owns PIDs and routes controls to live process workers.
- `runtime/vivari/packages/core/src/process.ts` / `types.ts` — public SDK process resize API if necessary for the Chrome lab.
- `runtime/vivari/packages/**/test*` — add focused runtime/protocol tests in the established nearby test location.
- `labs/browser-smoke/src/main.ts` and `e2e/browser-smoke.e2e.mjs` — live Chrome evidence only.
- `compatibility/bolt-compatibility-matrix.md`, `openspec/changes/add-bolt-compatible-vivari-runtime/upstream-vivari-1.0-spike.md` — update evidence/status only after a passing browser proof.

## Acceptance criteria

- **AC-1 — Initial TTY:** A process spawned as terminal-capable observes `process.stdout.isTTY === true`, with configured positive finite integer `columns` and `rows`.
- **AC-2 — Resize and signal:** A resize reaches only its matching live PID, updates guest dimensions, and delivers `SIGWINCH` via the real existing signal/event-loop transport. Chrome E2E must see guest output that proves initial dimensions, resized dimensions, and SIGWINCH.
- **AC-3 — Fail closed:** Invalid dimensions (non-finite, non-integer, zero/negative, unreasonable) and unknown/exited processes do not cause crashes, cross-process effects, or false green output.
- **AC-4 — Lifecycle:** An early control message queued before process-ready survives; existing stdin, merged output, exact REPL command output, kill → 143, and output closure behavior remain intact.
- **AC-5 — Scope/lineage:** The feature is committed in the nested `runtime/vivari` fork; the outer commit changes only its gitlink and authorized evidence/tests/docs. The pin moves forward from `26f1d62` to the owned feature commit, never to upstream `2629c710`.

## Challenger pre-mortem synthesis

The Challenger did not emit the required verdict before its 600-second budget expired, so it is **not** a PASS. Its durable read-only inspection identified the real seams; the Driver incorporated these risks into this frozen contract:

1. `SIGWINCH` must not reuse the existing default-action behavior for `SIGTERM`/`SIGINT`: an unhandled resize signal must be ignored, never finalize the process. Add a focused regression test for this.
2. The initial terminal dimensions must travel in the immutable process launch spec. Resize must travel by a process control message and must survive the existing pre-ready queue in `process-worker.ts`.
3. The browser-facing request must address the runtime by `execId`, then the kernel resolves it through its own `pidByExec` table. Never accept a page-provided PID as authority.
4. Dimension validation must occur at every trust boundary. Accept only finite, positive integers within an explicit reasonable maximum; invalid input is rejected/no-op and cannot alter another process.
5. The browser proof must observe a guest handler output, not merely a host control message or a changed JS object.

## TDD execution order

1. Add one focused failing test for initial terminal dimensions; run it and capture expected RED.
2. Implement only enough to pass, then rerun focused test.
3. Add one focused failing test for a resize delivered before ready and guest-observable SIGWINCH; run RED.
4. Implement the smallest end-to-end protocol/API path, rerun GREEN.
5. Add a focused invalid/unknown PID test if it does not already cover AC-3, capture RED, then green it.
6. Add/strengthen the outer live Chrome E2E after the nested runtime path is proven. Do not fake the guest observation with host assertions.

## Authorized modifications

- Authorized: the relevant files above, focused tests, Chrome lab/e2e, compatibility matrix, the existing change record files under `openspec/changes/add-bolt-compatible-vivari-runtime/`, and this spec's Result section.
- Do not edit other outer source packages unless a TypeScript compile error demonstrates it is necessary; then record the exact blocker rather than improvising.

## Judge

```text
# focused tests named by the implementation
cd runtime/vivari && <focused-test-command>
cd runtime/vivari && npm run typecheck:sdk && npm run build:sdk
cd /private/tmp/nexari-wc006-terminal-resize && node e2e/run-browser-e2e.mjs
cd /private/tmp/nexari-wc006-terminal-resize && npm test && npm run build
cd /private/tmp/nexari-wc006-terminal-resize && git diff --check && npm run check:scope
# inspect git status --short in outer and nested repos; verify no secrets and gitlink topology
```

## Result

- Status: terminal capability complete; BOLT-WC-006 remains typed-blocked on the separate interactive-shell requirement.
- Summary: Implemented configured initial TTY dimensions, an execId-scoped SDK resize request, kernel PID resolution, ordered pre-ready worker delivery, guest dimension updates, and `SIGWINCH` through the runtime signal queue. Dimensions are validated at the SDK, kernel-worker, kernel, process-worker, and guest boundaries with an explicit maximum of 10,000. Unhandled `SIGWINCH` is ignored and existing SIGINT/SIGTERM behavior remains covered. The public Nexari adapter now exposes terminal spawn and resize, and the isolated Chrome proof observed guest-produced `tty:true:132x43` followed by `resize:101x29:SIGWINCH`. The compatibility matrix records this exact evidence without falsely promoting BOLT-WC-006: the pinned `sh` still cannot satisfy Bolt's interactive-shell requirement.
- Files modified:
  - Outer: `packages/runtime-contract/**`, `packages/vivari-adapter/**`, `labs/browser-smoke/src/main.ts`, `e2e/browser-smoke.e2e.mjs`, `e2e/run-browser-e2e.mjs`, `compatibility/bolt-compatibility-matrix.md`, `tasks/NEXARI-WC006-RESIZE-001-SPEC.md`.
  - Nested source/test: `packages/protocol/syscall.js`, `packages/runtime/signals.js`, `packages/runtime/builtins/process.js`, `packages/runtime/index.js`, `packages/runtime/boot.js`, `packages/kernel-host/kernel.js`, `packages/core/src/workers/process-worker.ts`, `packages/core/src/workers/kernel-worker.ts`, `packages/core/src/process.ts`, `packages/core/src/types.ts`, `packages/core/src/index.ts`, `scripts/spike-terminal-resize.mjs`.
  - Generated SDK build output was produced only by the required build command and remains unversioned/ignored.
- RED evidence (each command was run from `runtime/vivari` unless shown otherwise):
  1. `node scripts/spike-terminal-resize.mjs` → exit 1:
     ```text
     AssertionError [ERR_ASSERTION]: configured terminal stdout must be a TTY

     false !== true
     ```
  2. `node scripts/spike-terminal-resize.mjs` → exit 1:
     ```text
     TypeError: signals.resize is not a function
         at file:///private/tmp/nexari-wc006-terminal-resize/runtime/vivari/scripts/spike-terminal-resize.mjs:52:9
     ```
  3. `node scripts/spike-terminal-resize.mjs` → exit 1:
     ```text
     TypeError: kernel.resize is not a function
         at file:///private/tmp/nexari-wc006-terminal-resize/runtime/vivari/scripts/spike-terminal-resize.mjs:87:21
     ```
  4. `node scripts/spike-terminal-resize.mjs` → exit 1:
     ```text
     AssertionError [ERR_ASSERTION]: initial dimensions must travel in the immutable spawn request
     + actual - expected
     ...
     -   terminal: {
     -     columns: 132,
     -     rows: 43
     -   },
     ```
- GREEN evidence:
  - `cd runtime/vivari && node scripts/spike-terminal-resize.mjs` → exit 0:
    ```text
    terminal resize spike: PASS
    ```
  - `cd runtime/vivari && node scripts/spike-terminal-resize.mjs && node scripts/spike-signals.mjs` → exit 0; final output:
    ```text
    terminal resize spike: PASS
    ...
    PASS — 0 failing check(s)
    ```
  - `cd runtime/vivari && npm run typecheck:sdk && npm run build:sdk` → exit 0; both SDK workspaces typechecked and Vite/TypeScript builds completed (`✓ built in 216ms`, `✓ built in 8ms`).
  - `cd /private/tmp/nexari-wc006-terminal-resize && npm test` → exit 0; final checks:
    ```text
    Scope OK (isolated Nexari project; no vendored Bolt or StackBlitz package)
    vivari build runner contract: PASS
    browser lab static contract: PASS
    ```
  - `cd /private/tmp/nexari-wc006-terminal-resize && npm run build` → exit 0; typecheck and the complete outer test suite passed (91 adapter/linkage subtests, all repository contract checks green).
  - `cd /private/tmp/nexari-wc006-terminal-resize && git diff --check && npm run check:scope && git -C runtime/vivari diff --check` → exit 0:
    ```text
    Scope OK (isolated Nexari project; no vendored Bolt or StackBlitz package)
    ```
  - `cd /private/tmp/nexari-wc006-terminal-resize && npm --prefix labs/browser-smoke exec -- vite build --configLoader runner` → exit 0 with no output. This only proves the strengthened lab bundles; it is not Chrome evidence.
- Browser/infrastructure evidence:
  - With Human Owner approval, `node e2e/run-browser-e2e.mjs` → exit 0:
    ```text
    browser lab E2E: PASS (ready server preview followed by safe teardown)
    ```
  - The disposable runner used only an owned temporary Chrome profile and a random loopback-only CDP port. Post-run verification found `profiles_remaining=0` and `processes_remaining=0`.
- Lineage/status: the nested feature and outer adapter evidence are ready for local commits. No push, tag, release, dependency installation, or external network action occurred. BOLT-WC-006 remains blocked solely because the pinned `sh` cannot provide Bolt's required interactive shell; terminal dimensions/resize/SIGWINCH are now publicly exposed and browser-proven.
