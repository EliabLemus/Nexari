# Add Bolt-compatible Nexari runtime

## Why

Bolt.DIY relies on StackBlitz WebContainers for in-browser files, processes, terminal behavior, server previews and preview diagnostics. Nexari will own an MIT Vivari fork and improve it only against a finite, observable compatibility target. The Bolt analysis revision is `2e254ac19a696394030601bc602f54945b12bfc4` and stays read-only.

## Scope

- Create a source ledger from public StackBlitz WebContainers documentation and public API/package surface.
- Inventory Bolt's observed runtime requirements and triage open runtime-related issues.
- Keep an owned Vivari fork pinned at `9a89ff328b87ad0fb6a180d4401ea418c180cbe7`.
- Define an adapter contract, fail-closed isolation and browser E2E gates before any future Bolt integration.

## Non-goals

No Bolt changes, StackBlitz runtime inspection, v86 fusion, Docker, Linux/ELF execution, native addons, SSH, UDP, arbitrary TCP, remote execution, publication or deployment.

## Risks

SharedArrayBuffer headers, Service Worker scope, stale preview routes, upstream drift, browser incompatibility and untrusted guest resource use. Each has an explicit E2E or future spike before product exposure.

## Success

AC-01 through AC-09 from the implementation plan are traceable to deterministic local checks, with every must-have requirement proven in a browser before any adapter rollout is proposed.
