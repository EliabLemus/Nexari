# Third-party notices and provenance

## Vivari

Nexari's runtime base is a local, source-pinned fork of:

```text
Upstream: https://github.com/maitrungduc1410/vivari
Base SHA: 9a89ff328b87ad0fb6a180d4401ea418c180cbe7
Base date: 2026-08-13
License: MIT (runtime/vivari/LICENSE)
Local path: runtime/vivari
```

The nested fork remote is named `upstream`; fetch points at the public upstream URL and push is disabled. Nexari changes must be documented in `runtime/PATCHES.md`, linked to a `BOLT-WC-###` requirement and a regression test. Upstream updates are deliberate: fetch, compare license and provenance, re-run the full Nexari Judge suite, then record the new base SHA.

### Evaluated, not adopted: `@vivari/core@1.0.0`

```text
Public source: https://github.com/maitrungduc1410/vivari.git
Published package metadata: https://registry.npmjs.org/@vivari/core/1.0.0
Package version / gitHead: 1.0.0 / 2629c71097238400c45aefa213ef61df4794c2b7
Git reference retrieved: refs/tags/v1.0.0
Retrieved at: 2026-09-04T19:20:19Z
License: MIT (tagged LICENSE SHA-256: 30a6c0cfc55b5c36932f8438db7925460283f72c75b5f7d32efbeaadb9b75d73)
Disposition: not adopted; migration candidate only.
```

This public-source record supports only provenance and candidate evaluation. It does not claim that BOLT-WC-005 or BOLT-WC-006 is compatible, and it cannot change either status without the required real Chrome proof.

## StackBlitz WebContainers

Nexari does **not** include, copy, download, inspect, reverse engineer, or depend on StackBlitz proprietary runtime artifacts. It may use only public documentation, public package declarations/types, and host-observable behavior as clean-room compatibility inputs. The current source ledger is `compatibility/stackblitz-public-contract-ledger.md`.

## Bolt.DIY

```text
Repository: https://github.com/stackblitz-labs/bolt.diy
Analysis commit: 2e254ac19a696394030601bc602f54945b12bfc4
License: MIT (upstream project)
Role: read-only compatibility input; not vendored or modified here
```
