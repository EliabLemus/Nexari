# SPEC-002: Bolt.DIY → Nexari Runtime Integration

**Status:** Approved — owner decisions resolved 2026-09-25 (see Owner decisions, below). Implementation proceeds on the private fork; upstream push still requires explicit owner go-ahead.

## Owner decisions (resolved 2026-09-25)

1. **Integration ownership:** private fork. EXECUTED: `EliabLemus/bolt-diy-nexari-runtime` (private), pushed at `1c481c7` with full history (unshallowed from upstream `2e254ac`, which is still upstream HEAD — no rebase needed).
2. **Full WebContainer replacement:** the goal is to replace WebContainer entirely, not to keep a dual-backend flag forever. The runtime facade/backend selector is the migration path; remaining surfaces to port to Nexari (currently fail-closed): preview, filesystem watchers, search, deploy, interactive terminal. `VITE_RUNTIME_BACKEND` remains as migration switch and is removed only when all surfaces pass acceptance on Nexari.
3. **Preview hosting:** Tailscale Funnel + Caddy pattern (same as Pulse), dedicated preview domain with wildcard/port routing, without disturbing existing publications. Exact domain to be chosen at implementation time (proposal: `preview.nexus-2.tailf73d68.ts.net`).
4. **Dependency form:** versioned tarball package (not submodule, not workspace nesting).

## Goal

Allow a self-hosted, pinned Bolt.DIY checkout to select Nexari's Vivari-backed browser runtime instead of the proprietary `@webcontainer/api`, while preserving Bolt's working filesystem, shell, preview, Git, export, and failure-reporting flows.

## Evidence baseline

The reference checkout is `stackblitz-labs/bolt.diy` commit `2e254ac19a696394030601bc602f54945b12bfc4` at `/Users/openjaime/Projects/bolt.diy-nexari-reference`. Bolt currently boots `WebContainer` with `coep: 'credentialless'`, `workdirName`, and `forwardPreviewErrors`; fetches and injects an inspector script; then listens to `preview-message`.[2]

Nexari's current owned contract already accepts the three boot options, exposes filesystem/process/port/preview-diagnostic lifecycle primitives, requires cross-origin isolation, and provides explicit teardown. It does **not** claim to be drop-in type-compatible with `@webcontainer/api`.

## Current findings

1. **Boot options are compatible, but the interface is not.** Bolt statically imports `WebContainer` and the pinned `@webcontainer/api` package.[1][2] Nexari's `BrowserRuntime` uses a deliberately narrower owned contract.
2. **Preview routing is the principal UI gap.** Bolt's dedicated preview route constructs `https://<id>.local-credentialless.webcontainer-api.io`; its workbench also parses that domain to build popup routes.[3][4] Nexari must use a configured self-hosted preview origin, so these assumptions must be removed.
3. **Preview diagnostics require event translation.** Bolt expects `setPreviewScript()` plus `preview-message`; Nexari provides an origin/source/nonce-bound `preview-error` event. The integration must preserve Bolt's error alert UX without exposing an untrusted iframe message channel.
4. **Terminal behavior is not proven as a direct match.** Bolt starts `/bin/jsh --osc`, waits for OSC 654 `interactive`, and passes `{ terminal: { cols, rows } }`. Nexari proves an interactive `sh` with `{ columns, rows }`; it does not yet prove JSH/OSC compatibility. This is a P0 spike, not an assumption.
5. **Filesystem watching is a semantic adapter job.** Bolt calls the WebContainer-internal `watchPaths`, while Nexari exposes a supported watcher API. The integration must translate events; it must not copy or import WebContainer internals.

## Scope

### In scope
- A small Bolt-side `NexariRuntimeFacade` that implements only the observed Bolt-facing subset needed by its app code.
- Backend selection behind an explicit dev-only runtime flag, defaulting to the existing WebContainer backend until Nexari passes end-to-end acceptance.
- Self-hosted preview-origin configuration and removal of StackBlitz-domain parsing from popup/route paths.
- Explicit translations for process terminal dimensions, preview diagnostics, filesystem watches, server/port events, export, and teardown.
- Automated contract tests plus a real-browser Bolt.DIY smoke flow against a COOP/COEP host.

### Out of scope
- Vendoring or modifying StackBlitz's SDK.
- Any connection to `bolt.new`, StackBlitz production services, or StackBlitz authentication.
- Publishing, deploying, pushing, or changing Bolt.DIY upstream.
- Claiming support for native addons, Docker, SSH, ELF binaries, or arbitrary outbound sockets.

## Requirements

### R1 — Isolated, opt-in backend selection
- [ ] Bolt loads Nexari only when an explicit local configuration value selects `nexari`; existing behavior remains the default and control path.
- [ ] The app fails before guest boot with a visible typed `ISOLATION_REQUIRED` alert when COOP/COEP isolation is absent.
- [ ] No secret is committed; preview origins and provider keys remain environment-only.

### R2 — Minimal compatibility facade
- [ ] The facade has a compile-checked interface defined from actual Bolt call sites, not from the full proprietary SDK type.
- [ ] It maps boot, mount, `workdir`, file read/write/mkdir/readdir/rm, spawn, export, `server-ready`, `port`, watch, and teardown.
- [ ] It does not import `@webcontainer/api`, its internals, or StackBlitz-hosted runtime resources when backend=`nexari`.

### R3 — Terminal/action correctness
- [ ] A failing contract test captures the observed Bolt shell protocol before replacement.
- [ ] The chosen implementation either proves a Nexari shell protocol equivalent to Bolt's command lifecycle or replaces the JSH-specific layer with a bounded Nexari-native execution path.
- [ ] Initial terminal dimensions and resize normalize Bolt's `cols`/`rows` to Nexari's `columns`/`rows`; cancellation and exit status remain visible to actions.

### R4 — Preview and diagnostics
- [ ] A configured `NEXARI_PREVIEW_ORIGIN` is validated as an HTTPS origin without path, query, fragment, or credentials.
- [ ] No UI code derives a URL from `*.webcontainer-api.io` when backend=`nexari`.
- [ ] Preview attachment, reload, new-tab, and popup paths operate from actual runtime URLs.
- [ ] Same-origin preview errors and unhandled rejections reach Bolt's existing alert UI only when opted in; forged origin/source/nonce messages do not.

### R5 — Files, watches, Git, and export
- [ ] Bolt's file store receives translated watcher events and closes watcher resources on chat/runtime teardown.
- [ ] `useGit` can clone a small public fixture, edit, enumerate, and export a repository through Nexari's filesystem facade.
- [ ] Binary file contents remain byte-exact across write/read/export.

### R6 — Release evidence
- [ ] Unit/type tests cover each translation seam.
- [ ] A clean Chrome E2E test runs Bolt.DIY under valid COOP/COEP headers: boot → write files → run a command → start preview → receive a diagnostic → stop/restart → export.
- [ ] The same E2E run proves non-isolated boot fails before an SDK/guest starts.
- [ ] Existing Bolt tests and Nexari `npm run build` stay green.

## Architecture

```text
Bolt.DIY workbench
  └─ runtime selector (default: stackblitz; opt-in: nexari)
      └─ NexariRuntimeFacade (Bolt-shaped, owned by integration)
          └─ Nexari BrowserRuntime contract
              └─ Vivari adapter + pinned owned Vivari fork
                  └─ self-hosted preview origin
```

The facade is intentionally located in the integration layer, not in Nexari's generic runtime contract. Bolt-specific semantics such as JSH/OSC handling and UI alert payloads must not contaminate the reusable runtime.

## Acceptance gates

1. **P0 feasibility gate:** terminal spike resolves the JSH/OSC mismatch with a passing test or a documented replacement design.
2. **P1 security gate:** valid isolated origin succeeds; non-isolated origin fails typed before guest boot; preview relay rejects forged messages.
3. **P1 functional gate:** filesystem, shell/action, preview, port events, Git/export, and teardown pass in real Chrome.
4. **P1 regression gate:** `pnpm test`, `pnpm run typecheck`, `pnpm run build` in the pinned Bolt checkout and `npm run build` in Nexari pass.
5. **P2 operational gate:** no production deployment, no upstream push, and no source-code edits outside the dedicated integration worktree without owner approval.

## Owner decisions needed before implementation

1. **Integration ownership:** maintain a private fork of Bolt.DIY or propose an upstreamable adapter PR. Recommendation: private fork first; upstream only after a stable external contract.
2. **Preview hosting:** choose the self-hosted HTTPS preview base domain and how its wildcard/port routing is provisioned. This cannot be guessed; it is a deployment boundary.
3. **Terminal path:** accept replacing Bolt's JSH-specific protocol if the P0 spike shows it is not portable. Recommendation: replace it behind the facade rather than emulate undocumented WebContainer internals.
4. **Dependency form:** consume Nexari as a versioned package versus a Git submodule/workspace. Recommendation: package/tarball boundary; do not nest unrelated repositories.

## Sources

[1] https://raw.githubusercontent.com/stackblitz-labs/bolt.diy/main/package.json
[2] https://raw.githubusercontent.com/stackblitz-labs/bolt.diy/2e254ac19a696394030601bc602f54945b12bfc4/app/lib/webcontainer/index.ts
[3] https://raw.githubusercontent.com/stackblitz-labs/bolt.diy/2e254ac19a696394030601bc602f54945b12bfc4/app/routes/webcontainer.preview.%24id.tsx
[4] https://raw.githubusercontent.com/stackblitz-labs/bolt.diy/2e254ac19a696394030601bc602f54945b12bfc4/app/components/workbench/Preview.tsx
