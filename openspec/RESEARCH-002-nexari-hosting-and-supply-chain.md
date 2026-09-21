# RESEARCH-002: Nexari Hosting and Supply-Chain Readiness for Bolt.DIY

**Status:** Research complete. This document records blockers and deployment facts; it authorizes no implementation.

## R-01 — Host isolation is a hard runtime prerequisite

Nexari's pinned Vivari runtime requires `window.crossOriginIsolated` and `SharedArrayBuffer`; it rejects boot before guest creation otherwise. The host response must send:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`credentialless` is an allowable COEP alternative at the browser-platform level, but Nexari's current lab and runtime contract use `require-corp` as the baseline. MDN confirms that COOP `same-origin` plus COEP `require-corp` or `credentialless` are required conditions for a cross-origin-isolated document and SharedArrayBuffer use.[1][2][3]

**Implication for Bolt.DIY:** all HTML responses, runtime-worker chunks, Wasm, service-worker assets, and any preview-host documents must be audited under these headers. Bolt's existing third-party assets/providers may be blocked if they do not opt into CORS/CORP. A header-on Bolt control run is required before replacing the runtime.

## R-02 — Preview hosting has three supported modes

The pinned Vivari source declares three choices.[5]

1. **Mode A, same origin:** IDE and preview share the Bolt origin. This is the only sensible first integration target: no second host and no cross-origin bridge.
2. **Mode B, shared preview origin:** set `previewOrigin` to a distinct HTTPS origin. That origin must serve `sw.js` and `__vv-bridge.html` with `COEP: credentialless`, `CORP: cross-origin`, and `Service-Worker-Allowed: /`.
3. **Mode C, wildcard per-port origin:** requires wildcard DNS/routing and the same bridge assets on each generated preview host. It gives stronger preview-to-preview isolation, but is not required for the first Bolt integration.

A service worker controls only requests in its scope, and a document must reload to be controlled after registration.[4] Therefore `sw.js` must be served from a scope covering preview routes, not merely copied into a static build directory.

**Recommendation:** begin with Mode A under a dedicated local COOP/COEP host. Defer a public `NEXARI_PREVIEW_ORIGIN` or wildcard domain decision until the facade and terminal spike pass.

## R-03 — Required build assets are explicit

The working Nexari browser lab serves, from the application origin:

```text
/sw.js                         Service worker, Service-Worker-Allowed: /
/assets/*                      runtime workers/Wasm assets
/vendor/*                      vendored runtime assets
```

Its Vite middleware applies COOP/COEP on all responses and rejects symlink traversal for vendor files. A Bolt deployment must provide an equivalent asset manifest and header policy; it cannot import Nexari as a bare TypeScript facade and expect worker/Wasm URLs to resolve.

## R-04 — Exact pin is currently retrievable; durable supply-chain ownership remains blocked (P0)

The Nexari superproject pins submodule `runtime/vivari` at:

```text
210d50d3f314b1fc6b148776ee24c2d48d8d022d
```

The prior clean integration worktree observation found the public server would not provide that object:

```text
remote error: upload-pack: not our ref 210d50d3f314b1fc6b148776ee24c2d48d8d022d
```

The current Nexari main worktree does contain the pinned source on a local branch. I preserved a **local read-only reference clone** at:

```text
/Users/openjaime/Projects/nexari-vivari-pinned-reference
```

That failure is no longer the current state. At **2026-09-21T10:12:07Z**, from this machine using `git version 2.50.1 (Apple Git-155)`, the exact command below exited `0` and resolved `FETCH_HEAD` to the literal pin:

```text
GIT_TERMINAL_PROMPT=0 git -C runtime/vivari fetch --no-tags origin 210d50d3f314b1fc6b148776ee24c2d48d8d022d
```

This is a single timestamped observation from one network position. It proves that the configured public origin served the exact object then; it does **not** prove that a fresh `git clone --recurse-submodules` or CI checkout is durable, nor that the upstream will retain an unadvertised SHA. The earlier contradictory fetch result itself demonstrates why availability from an owner-controlled public upstream is mutable.

**Required decision before Bolt-facing integration code:** publish or configure an owner-controlled private mirror/fork that contains commit `210d50d…`, then update the submodule URL/pin and provenance guard in one reviewed change. Do not silently repin to whatever the public upstream currently serves. The new `npm run check:vivari-submodule-pin` gate prevents a silent local repin but intentionally does not claim external retention.

## R-05 — Toolchain baseline

- Node: Bolt.DIY requires Node `>=18.18`; the local machine runs Node `v22.23.1`.
- pnpm: Bolt's declared package manager is available and the pinned reference checkout built/typechecked successfully.
- Nexari's build runner pins Rust `1.88.0-aarch64-apple-darwin`; that compiler is installed locally.
- Actual Vivari source builds also depend on the submodule contents and its vendored artifacts. The exact pin is presently fetchable, but no clean-clone/CI proof has established durable reproducibility; a fresh full build remains insufficient until the owner-controlled mirror decision is executed and verified.

## Execution impact

Keep **Delta 000 — restore reproducible pinned Vivari source** before existing Delta 001. It is a supply-chain/configuration task, not a semantic runtime rewrite. The immediate false blocker is reduced to a timestamped observation, but all Bolt-facing code remains blocked until an owner-controlled mirror has a deterministic clean-clone Judge result.

## Sources

[1] https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated
[2] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy
[3] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy
[4] https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
[5] https://raw.githubusercontent.com/maitrungduc1410/vivari/210d50d3f314b1fc6b148776ee24c2d48d8d022d/packages/core/src/types.ts
