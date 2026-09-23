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

## R-04 — Exact pin is retrievable from an owner-controlled private mirror (resolved P0)

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

At **2026-09-21T10:55:04Z**, an ephemeral empty repository under `/private/tmp/nexari-vivari-pin-probe.*` was initialized and configured with `origin` `https://github.com/maitrungduc1410/vivari.git`. The exact clean-repository fetch below exited `128`:

```text
GIT_TERMINAL_PROMPT=0 git -C <empty> fetch --no-tags origin 210d50d3f314b1fc6b148776ee24c2d48d8d022d
fatal: remote error: upload-pack: not our ref 210d50d3f314b1fc6b148776ee24c2d48d8d022d
```

The temporary repository was deleted and the integration worktree was not mutated. This was a direct empty-repository fetch, not a full `git clone --recurse-submodules` result and not a claim that the pin is permanently unavailable. A prior **2026-09-21T10:12:07Z** fetch from the pre-existing local `runtime/vivari` checkout resolved `FETCH_HEAD` to the literal pin, but that checkout already retained local objects; it does not establish clean-source retrieval. The contradictory observations demonstrate why availability from this owner-controlled public upstream is mutable and cannot be treated as reproducible CI evidence.

**Resolved decision before Bolt-facing integration code:** preserve commit `210d50d…` in an owner-controlled private mirror, then update the submodule URL and provenance guard in one reviewed change. Do not silently repin to whatever the public upstream currently serves. The `npm run check:vivari-submodule-pin` gate prevents both a local repin and an unreviewed provenance URL change.

### Mirror recovery — historical failed attempt and successful owner publication

On 2026-09-22, GitHub's REST API accepted creation of the intended private owner-controlled repository `EliabLemus/nexari-vivari-provenance-20260922`. The local recovery reference was independently checked to contain `210d50d3f314b1fc6b148776ee24c2d48d8d022d` before publication was attempted.

The first publication attempt was **not complete**: `git push` to that HTTPS remote returned `403 Write access to repository not granted`; the machine's SSH identity was a repository-scoped deploy key for `EliabLemus/pricing-tracker-web`, not an owner key for the mirror. This remains historical failure evidence.

On **2026-09-22T22:15:49-0600**, owner-authorized HTTPS credentials published the exact pin at:

```text
refs/heads/provenance/pinned-210d50d3f314
```

An ephemeral empty repository using those authorized credentials fetched that advertised ref, resolved `FETCH_HEAD` to the exact pin, and passed `git fsck --no-dangling --no-progress`. The adopted `.gitmodules` URL is now:

```text
https://github.com/EliabLemus/nexari-vivari-provenance-20260922.git
```

This is a private mirror: clean source retrieval is guaranteed for authorized developer/CI credentials with repository read access, not anonymous clients. The former public-origin failure remains intentionally preserved above. The proof executed was:

```text
git -C <empty> fetch --no-tags \
  https://github.com/EliabLemus/nexari-vivari-provenance-20260922.git \
  refs/heads/provenance/pinned-210d50d3f314
git -C <empty> rev-parse FETCH_HEAD  # exact SHA
```

## R-05 — Toolchain baseline

- Node: Bolt.DIY requires Node `>=18.18`; the local machine runs Node `v22.23.1`.
- pnpm: Bolt's declared package manager is available and the pinned reference checkout built/typechecked successfully.
- Nexari's build runner pins Rust `1.88.0-aarch64-apple-darwin`; that compiler is installed locally.
- Actual Vivari source builds also depend on the submodule contents and its vendored artifacts. The public origin still refuses the exact pin, but authorized clean repositories can retrieve it from the owner-controlled private mirror.

## Execution impact

**Delta 000 — restore reproducible pinned Vivari source** is complete. It was a supply-chain/configuration task, not a semantic runtime rewrite. The public-origin failure remains directly observed, while the owner-controlled mirror now has a deterministic credentialed clean-fetch proof. Bolt-facing work remains separately gated by its explicit integration scope.

## Sources

[1] https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated
[2] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy
[3] https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy
[4] https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
[5] https://raw.githubusercontent.com/maitrungduc1410/vivari/210d50d3f314b1fc6b148776ee24c2d48d8d022d/packages/core/src/types.ts
